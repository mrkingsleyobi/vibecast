/**
 * Driftbase Query — QueryEngine Domain Service
 * Executes SQL query plans against in-memory table stores and vector indexes.
 * ADR-002: Split from monolithic query module into DDD-compliant submodule.
 * ADR-003: Hybrid queries combining vector search with relational filters.
 */
import {
  UUID, DistanceMetric, SearchResult, ArrowSchema,
  RecordBatch, Result, ok, err, createRecordBatch,
} from '../common/types.js';
import {
  BoundedContext, createEvent, EventBus,
} from '../common/events.js';
import { VectorIndex, HnswConfig } from './hnsw.js';
import { parseSQL, SqlAst, QueryPlan, evaluateWhere } from './sql-parser.js';
import { distanceFunction } from './distance.js';

// ─── TableStore Type ─────────────────────────────────────────

export type TableStore = Map<string, {
  schema: ArrowSchema;
  rows: Array<Record<string, unknown>>;
}>;

// ─── QueryEngine — Domain Service ────────────────────────────

export class QueryEngine {
  private vectorIndexes: Map<string, VectorIndex> = new Map();
  private tables: TableStore;
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus, tables?: TableStore) {
    this.eventBus = eventBus;
    this.tables = tables ?? new Map();
  }

  /** Parse a SQL string into a QueryPlan. */
  parseSQL(sql: string): Result<QueryPlan> {
    try {
      const plan = parseSQL(sql);
      this.eventBus.emit(createEvent(
        'QueryParsed', BoundedContext.Query,
        { planId: plan.planId, sql: plan.sql },
      ));
      return ok(plan);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Create a new vector index for a table column. */
  createVectorIndex(
    tableId: UUID,
    column: string,
    dimensions: number,
    metric: DistanceMetric = DistanceMetric.Cosine,
    config?: Partial<HnswConfig>,
  ): VectorIndex {
    const index = new VectorIndex(tableId, column, dimensions, metric, config);
    const key = `${tableId}:${column}`;
    this.vectorIndexes.set(key, index);
    return index;
  }

  /** Retrieve an existing vector index. */
  getVectorIndex(tableId: UUID, column: string): VectorIndex | undefined {
    return this.vectorIndexes.get(`${tableId}:${column}`);
  }

  /** Execute a query plan and return results. */
  executeQuery(plan: QueryPlan): Result<RecordBatch | SearchResult[]> {
    try {
      const result = this.executePlan(plan);
      plan.phase = 'executed';
      return ok(result);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private executePlan(plan: QueryPlan): RecordBatch | SearchResult[] {
    const ast = plan.ast;

    switch (ast.type) {
      case 'VECTOR_SEARCH': return this.executeVectorSearch(ast);
      case 'SELECT': return this.executeSelect(ast);
      case 'INSERT': return this.executeInsert(ast);
      case 'UPDATE': return this.executeUpdate(ast);
      case 'DELETE': return this.executeDelete(ast);
      case 'CREATE_TABLE': return this.executeCreateTable(ast);
      default: throw new Error(`Unsupported statement type: ${ast.type}`);
    }
  }

  private executeVectorSearch(ast: SqlAst): SearchResult[] {
    const vs = ast.vectorSearch!;
    const queryVector = new Float32Array(vs.queryVector);

    // Find matching vector index
    let index: VectorIndex | undefined;
    for (const [key, idx] of this.vectorIndexes) {
      if (key.endsWith(`:${vs.column}`)) { index = idx; break; }
    }
    if (!index) throw new Error(`No vector index found for column: ${vs.column}`);

    const startTime = performance.now();

    let results: SearchResult[];
    if (ast.where && ast.where.length > 0) {
      const whereClauses = ast.where;
      results = index.searchFiltered(
        queryVector, vs.k,
        (data) => data ? evaluateWhere(data, whereClauses) : false,
        vs.metric,
      );
    } else {
      results = index.search(queryVector, vs.k, vs.metric);
    }

    const durationUs = Math.round((performance.now() - startTime) * 1000);

    this.eventBus.emit(createEvent(
      'VectorSearchExecuted', BoundedContext.Query,
      { indexId: index.indexId, k: vs.k, durationUs },
    ));

    return ast.limit ? results.slice(0, ast.limit) : results;
  }

  private executeSelect(ast: SqlAst): RecordBatch {
    const table = this.tables.get(ast.table);
    if (!table) throw new Error(`Table not found: ${ast.table}`);

    let rows = [...table.rows];

    if (ast.where) rows = rows.filter(row => evaluateWhere(row, ast.where!));

    if (ast.orderBy) {
      rows.sort((a, b) => {
        for (const ob of ast.orderBy!) {
          const av = a[ob.column] as number;
          const bv = b[ob.column] as number;
          if (av !== bv) {
            const cmp = av < bv ? -1 : 1;
            return ob.direction === 'DESC' ? -cmp : cmp;
          }
        }
        return 0;
      });
    }

    if (ast.limit !== undefined) rows = rows.slice(0, ast.limit);

    const selectedCols = ast.columns?.[0] === '*'
      ? table.schema.columns.map(c => c.name)
      : (ast.columns ?? []);

    const data: Record<string, unknown[]> = {};
    const columns = table.schema.columns.filter(
      c => selectedCols.includes(c.name) || selectedCols.includes('*'),
    );
    for (const col of columns) {
      data[col.name] = rows.map(r => r[col.name]);
    }

    const schema: ArrowSchema = { columns, version: table.schema.version };
    return createRecordBatch(schema, data);
  }

  private executeInsert(ast: SqlAst): RecordBatch {
    const table = this.tables.get(ast.table);
    if (!table) throw new Error(`Table not found: ${ast.table}`);

    const cols = ast.columns ?? [];
    for (const vals of ast.values ?? []) {
      const row: Record<string, unknown> = {};
      cols.forEach((col, i) => { row[col] = vals[i]; });
      table.rows.push(row);
    }

    return createRecordBatch(table.schema, {});
  }

  private executeUpdate(ast: SqlAst): RecordBatch {
    const table = this.tables.get(ast.table);
    if (!table) throw new Error(`Table not found: ${ast.table}`);

    let count = 0;
    for (const row of table.rows) {
      if (ast.where && !evaluateWhere(row, ast.where)) continue;
      for (const sc of ast.setClauses ?? []) {
        row[sc.column] = sc.value;
      }
      count++;
    }

    return createRecordBatch(table.schema, {});
  }

  private executeDelete(ast: SqlAst): RecordBatch {
    const table = this.tables.get(ast.table);
    if (!table) throw new Error(`Table not found: ${ast.table}`);

    if (ast.where) {
      table.rows = table.rows.filter(row => !evaluateWhere(row, ast.where!));
    } else {
      table.rows = [];
    }

    return createRecordBatch(table.schema, {});
  }

  private executeCreateTable(ast: SqlAst): RecordBatch {
    if (this.tables.has(ast.table)) {
      throw new Error(`Table already exists: ${ast.table}`);
    }

    const schema = ast.schema!;
    this.tables.set(ast.table, { schema, rows: [] });

    this.eventBus.emit(createEvent(
      'TableCreated', BoundedContext.Query,
      { tableId: ast.table, name: ast.table, columnCount: schema.columns.length },
    ));

    return createRecordBatch(schema, {});
  }
}
