/**
 * Driftbase Query Engine — Bounded Context
 * SQL parsing, vector indexing (HNSW), and hybrid query execution.
 * ADR-001: sub-100us vector search target for 1M vectors
 * ADR-003: hybrid queries combining vector search with relational filters
 */
import {
  UUID, Vector, DistanceMetric, SearchResult, ArrowSchema,
  RecordBatch, generateId, Result, ok, err, createRecordBatch,
} from '../common/types.js';
import {
  DomainEvent, BoundedContext, createEvent, EventBus,
} from '../common/events.js';

// ─── Distance Functions ──────────────────────────────────────

function dot(a: Vector, b: Vector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function norm(v: Vector): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

export function cosineDistance(a: Vector, b: Vector): number {
  const d = dot(a, b);
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 1;
  return 1 - d / (na * nb);
}

export function l2Distance(a: Vector, b: Vector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function innerProductDistance(a: Vector, b: Vector): number {
  return -dot(a, b);
}

export function distanceFunction(
  metric: DistanceMetric,
): (a: Vector, b: Vector) => number {
  switch (metric) {
    case DistanceMetric.Cosine: return cosineDistance;
    case DistanceMetric.L2: return l2Distance;
    case DistanceMetric.InnerProduct: return innerProductDistance;
  }
}

// ─── HNSW Node ───────────────────────────────────────────────

interface HnswNode {
  id: UUID;
  vector: Vector;
  neighbors: UUID[][];  // neighbors[layer] = list of neighbor ids
  data?: Record<string, unknown>;
}

// ─── HNSW Configuration ─────────────────────────────────────

export interface HnswConfig {
  m: number;            // max neighbors per layer
  mMax0: number;        // max neighbors at layer 0
  efConstruction: number;
  efSearch: number;
  ml: number;           // level generation factor (1/ln(m))
}

const DEFAULT_HNSW_CONFIG: HnswConfig = {
  m: 16,
  mMax0: 32,
  efConstruction: 200,
  efSearch: 50,
  ml: 1 / Math.log(16),
};

// ─── VectorIndex — Aggregate Root ────────────────────────────

export class VectorIndex {
  readonly indexId: UUID;
  readonly tableId: UUID;
  readonly column: string;
  readonly dimensions: number;
  readonly metric: DistanceMetric;
  readonly config: HnswConfig;

  private nodes: Map<UUID, HnswNode> = new Map();
  private entryPoint: UUID | null = null;
  private maxLevel = 0;
  private boundaryDistances: Map<UUID, number> = new Map();

  private readonly events: DomainEvent[] = [];

  constructor(
    tableId: UUID,
    column: string,
    dimensions: number,
    metric: DistanceMetric = DistanceMetric.Cosine,
    config: Partial<HnswConfig> = {},
  ) {
    this.indexId = generateId();
    this.tableId = tableId;
    this.column = column;
    this.dimensions = dimensions;
    this.metric = metric;
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
  }

  get size(): number {
    return this.nodes.size;
  }

  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events.length = 0;
  }

  /** Generate a random level for a new node using the skip-list probability. */
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.config.ml && level < 32) level++;
    return level;
  }

  /** Return the max number of neighbors allowed at a given layer. */
  private maxNeighbors(layer: number): number {
    return layer === 0 ? this.config.mMax0 : this.config.m;
  }

  /** Greedy search at a single layer, returning ef closest candidates. */
  private searchLayer(
    query: Vector,
    entryIds: UUID[],
    ef: number,
    layer: number,
    dist: (a: Vector, b: Vector) => number,
  ): Array<{ id: UUID; distance: number }> {
    const visited = new Set<UUID>(entryIds);
    const candidates: Array<{ id: UUID; distance: number }> = [];
    const results: Array<{ id: UUID; distance: number }> = [];

    for (const eid of entryIds) {
      const node = this.nodes.get(eid)!;
      const d = dist(query, node.vector);
      candidates.push({ id: eid, distance: d });
      results.push({ id: eid, distance: d });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    results.sort((a, b) => a.distance - b.distance);

    while (candidates.length > 0) {
      const closest = candidates.shift()!;
      const farthestResult = results[results.length - 1];

      if (results.length >= ef && closest.distance > farthestResult.distance) {
        break;
      }

      const closestNode = this.nodes.get(closest.id)!;
      const neighbors = closestNode.neighbors[layer] ?? [];

      for (const nid of neighbors) {
        if (visited.has(nid)) continue;
        visited.add(nid);

        const neighborNode = this.nodes.get(nid);
        if (!neighborNode) continue;

        const d = dist(query, neighborNode.vector);
        const worstResult = results[results.length - 1];

        if (results.length < ef || d < worstResult.distance) {
          candidates.push({ id: nid, distance: d });
          results.push({ id: nid, distance: d });
          results.sort((a, b) => a.distance - b.distance);

          if (results.length > ef) results.pop();

          // Keep candidates sorted for greedy traversal
          candidates.sort((a, b) => a.distance - b.distance);
        }
      }
    }

    return results;
  }

  /** Prune neighbors to keep only the closest maxN. */
  private pruneNeighbors(
    nodeId: UUID,
    neighborIds: UUID[],
    maxN: number,
    dist: (a: Vector, b: Vector) => number,
  ): UUID[] {
    const node = this.nodes.get(nodeId)!;
    const scored = neighborIds
      .filter(nid => this.nodes.has(nid) && nid !== nodeId)
      .map(nid => ({ id: nid, distance: dist(node.vector, this.nodes.get(nid)!.vector) }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, maxN).map(s => s.id);
  }

  /** Insert a vector into the HNSW index. */
  insertVector(id: UUID, vector: Vector, data?: Record<string, unknown>): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }

    const level = this.randomLevel();
    const neighbors: UUID[][] = Array.from({ length: level + 1 }, () => []);
    const newNode: HnswNode = { id, vector, neighbors, data };
    this.nodes.set(id, newNode);

    const dist = distanceFunction(this.metric);

    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentEntries = [this.entryPoint];

    // Traverse from top layer down to the node's insertion level + 1
    for (let lc = this.maxLevel; lc > level; lc--) {
      const nearest = this.searchLayer(vector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Insert at each layer from min(level, maxLevel) down to 0
    const topInsertLayer = Math.min(level, this.maxLevel);
    for (let lc = topInsertLayer; lc >= 0; lc--) {
      const nearest = this.searchLayer(
        vector, currentEntries, this.config.efConstruction, lc, dist,
      );

      const maxN = this.maxNeighbors(lc);
      const selectedNeighbors = nearest.slice(0, maxN).map(n => n.id);

      newNode.neighbors[lc] = selectedNeighbors;

      // Add bidirectional connections and prune if needed
      for (const nid of selectedNeighbors) {
        const neighbor = this.nodes.get(nid)!;
        while (neighbor.neighbors.length <= lc) neighbor.neighbors.push([]);
        neighbor.neighbors[lc].push(id);

        if (neighbor.neighbors[lc].length > maxN) {
          neighbor.neighbors[lc] = this.pruneNeighbors(
            nid, neighbor.neighbors[lc], maxN, dist,
          );
        }
      }

      currentEntries = nearest.map(n => n.id);
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  /** Delete a vector from the index by removing all neighbor references. */
  deleteVector(id: UUID): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove this node from all its neighbors' neighbor lists
    for (let layer = 0; layer < node.neighbors.length; layer++) {
      for (const nid of node.neighbors[layer]) {
        const neighbor = this.nodes.get(nid);
        if (neighbor && neighbor.neighbors[layer]) {
          neighbor.neighbors[layer] = neighbor.neighbors[layer].filter(x => x !== id);
        }
      }
    }

    this.nodes.delete(id);
    this.boundaryDistances.delete(id);

    // If we deleted the entry point, pick a new one
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.maxLevel = 0;
      } else {
        this.entryPoint = this.nodes.keys().next().value!;
        const ep = this.nodes.get(this.entryPoint)!;
        this.maxLevel = ep.neighbors.length - 1;
      }
    }

    return true;
  }

  /** Top-k nearest neighbor search. */
  search(
    queryVector: Vector,
    k: number,
    metric?: DistanceMetric,
  ): SearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) return [];

    const dist = distanceFunction(metric ?? this.metric);
    let currentEntries = [this.entryPoint];

    // Descend from top layer to layer 1, greedy nearest
    for (let lc = this.maxLevel; lc > 0; lc--) {
      const nearest = this.searchLayer(queryVector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Search at layer 0 with ef >= k
    const ef = Math.max(this.config.efSearch, k);
    const results = this.searchLayer(queryVector, currentEntries, ef, 0, dist);

    const topK = results.slice(0, k);

    // Track boundary distance for subscription delta computation
    if (topK.length > 0) {
      const boundaryDist = topK[topK.length - 1].distance;
      const queryKey = Array.from(queryVector.slice(0, 4)).join(',');
      this.boundaryDistances.set(queryKey as UUID, boundaryDist);
    }

    return topK.map(r => {
      const node = this.nodes.get(r.id)!;
      return { id: r.id, distance: r.distance, data: node.data };
    });
  }

  /** Top-k search with a predicate filter applied to node data. */
  searchFiltered(
    queryVector: Vector,
    k: number,
    filter: (data?: Record<string, unknown>) => boolean,
    metric?: DistanceMetric,
  ): SearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) return [];

    const dist = distanceFunction(metric ?? this.metric);
    let currentEntries = [this.entryPoint];

    for (let lc = this.maxLevel; lc > 0; lc--) {
      const nearest = this.searchLayer(queryVector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Over-fetch to account for filtered-out results
    const ef = Math.max(this.config.efSearch, k * 4);
    const candidates = this.searchLayer(queryVector, currentEntries, ef, 0, dist);

    const filtered: SearchResult[] = [];
    for (const c of candidates) {
      const node = this.nodes.get(c.id)!;
      if (filter(node.data)) {
        filtered.push({ id: c.id, distance: c.distance, data: node.data });
        if (filtered.length >= k) break;
      }
    }

    return filtered;
  }

  /** Get the boundary distance for the last search (for subscription deltas). */
  getBoundaryDistance(queryFingerprint: UUID): number | undefined {
    return this.boundaryDistances.get(queryFingerprint);
  }
}

// ─── SQL AST Types ───────────────────────────────────────────

export type SqlStatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE_TABLE'
  | 'VECTOR_SEARCH';

export interface WhereClause {
  column: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=' | 'LIKE' | 'IN';
  value: unknown;
}

export interface VectorSearchClause {
  column: string;
  queryVector: number[];
  k: number;
  metric?: DistanceMetric;
}

export interface SqlAst {
  type: SqlStatementType;
  table: string;
  columns?: string[];
  values?: unknown[][];
  setClauses?: Array<{ column: string; value: unknown }>;
  where?: WhereClause[];
  vectorSearch?: VectorSearchClause;
  orderBy?: Array<{ column: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
  schema?: ArrowSchema;
}

// ─── QueryPlan — Aggregate Root ──────────────────────────────

export type PlanPhase = 'parsed' | 'logical' | 'physical' | 'executed';

export interface QueryPlan {
  planId: UUID;
  sql: string;
  ast: SqlAst;
  phase: PlanPhase;
  estimatedCost: number;
  createdAt: number;
}

// ─── SQL Parser ──────────────────────────────────────────────

function trimTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '').trim();
}

function parseWhereClause(whereStr: string): WhereClause[] {
  const clauses: WhereClause[] = [];
  const conditions = whereStr.split(/\s+AND\s+/i);

  for (const cond of conditions) {
    const match = cond.trim().match(
      /^(\w+)\s*(=|!=|<>|<=|>=|<|>|LIKE|IN)\s*(.+)$/i,
    );
    if (!match) continue;

    const column = match[1];
    let operator = match[2].toUpperCase() as WhereClause['operator'];
    if (operator === '<>' as string) operator = '!=';
    let value: unknown = match[3].trim();

    // Strip quotes from string values
    if (typeof value === 'string' && value.startsWith("'") && value.endsWith("'")) {
      value = (value as string).slice(1, -1);
    } else if (!isNaN(Number(value))) {
      value = Number(value);
    }

    clauses.push({ column, operator, value });
  }

  return clauses;
}

function parseSelect(sql: string): SqlAst {
  const vectorMatch = sql.match(
    /SELECT\s+VECTOR_SEARCH\s*\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*,\s*(\d+)\s*(?:,\s*'(\w+)')?\s*\)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
  );

  if (vectorMatch) {
    const column = vectorMatch[1];
    const vectorNums = vectorMatch[2].split(',').map(s => parseFloat(s.trim()));
    const k = parseInt(vectorMatch[3], 10);
    const metric = vectorMatch[4] as DistanceMetric | undefined;
    const table = vectorMatch[5];
    const whereStr = vectorMatch[6];
    const limit = vectorMatch[7] ? parseInt(vectorMatch[7], 10) : undefined;

    return {
      type: 'VECTOR_SEARCH',
      table,
      vectorSearch: { column, queryVector: vectorNums, k, metric },
      where: whereStr ? parseWhereClause(whereStr) : undefined,
      limit: limit ?? k,
    };
  }

  const selectMatch = sql.match(
    /SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
  );

  if (!selectMatch) throw new Error(`Invalid SELECT syntax: ${sql}`);

  const columnsStr = selectMatch[1].trim();
  const columns = columnsStr === '*' ? ['*'] : columnsStr.split(',').map(c => c.trim());
  const table = selectMatch[2];
  const whereStr = selectMatch[3];
  const orderByStr = selectMatch[4];
  const limit = selectMatch[5] ? parseInt(selectMatch[5], 10) : undefined;

  const orderBy = orderByStr
    ? orderByStr.split(',').map(o => {
        const parts = o.trim().split(/\s+/);
        return {
          column: parts[0],
          direction: (parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
        };
      })
    : undefined;

  return {
    type: 'SELECT',
    table,
    columns,
    where: whereStr ? parseWhereClause(whereStr) : undefined,
    orderBy,
    limit,
  };
}

function parseInsert(sql: string): SqlAst {
  const match = sql.match(
    /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+)$/i,
  );
  if (!match) throw new Error(`Invalid INSERT syntax: ${sql}`);

  const table = match[1];
  const columns = match[2].split(',').map(c => c.trim());
  const valuesStr = match[3];

  const valueGroups = [...valuesStr.matchAll(/\(([^)]+)\)/g)];
  const values = valueGroups.map(g =>
    g[1].split(',').map(v => {
      const trimmed = v.trim();
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
      if (!isNaN(Number(trimmed))) return Number(trimmed);
      if (trimmed.toUpperCase() === 'NULL') return null;
      if (trimmed.toUpperCase() === 'TRUE') return true;
      if (trimmed.toUpperCase() === 'FALSE') return false;
      return trimmed;
    }),
  );

  return { type: 'INSERT', table, columns, values };
}

function parseUpdate(sql: string): SqlAst {
  const match = sql.match(
    /UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i,
  );
  if (!match) throw new Error(`Invalid UPDATE syntax: ${sql}`);

  const table = match[1];
  const setStr = match[2];
  const whereStr = match[3];

  const setClauses = setStr.split(',').map(s => {
    const [col, val] = s.split('=').map(x => x.trim());
    let parsedVal: unknown = val;
    if (val.startsWith("'") && val.endsWith("'")) parsedVal = val.slice(1, -1);
    else if (!isNaN(Number(val))) parsedVal = Number(val);
    return { column: col, value: parsedVal };
  });

  return {
    type: 'UPDATE',
    table,
    setClauses,
    where: whereStr ? parseWhereClause(whereStr) : undefined,
  };
}

function parseDelete(sql: string): SqlAst {
  const match = sql.match(
    /DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i,
  );
  if (!match) throw new Error(`Invalid DELETE syntax: ${sql}`);

  return {
    type: 'DELETE',
    table: match[1],
    where: match[2] ? parseWhereClause(match[2]) : undefined,
  };
}

function parseCreateTable(sql: string): SqlAst {
  const match = sql.match(
    /CREATE\s+TABLE\s+(\w+)\s*\(([^)]+)\)/i,
  );
  if (!match) throw new Error(`Invalid CREATE TABLE syntax: ${sql}`);

  const table = match[1];
  const columnDefs = match[2].split(',').map(c => c.trim());

  const typeMap: Record<string, import('../common/types.js').ArrowDataType> = {
    TEXT: 'utf8' as import('../common/types.js').ArrowDataType,
    VARCHAR: 'utf8' as import('../common/types.js').ArrowDataType,
    STRING: 'utf8' as import('../common/types.js').ArrowDataType,
    INT: 'int32' as import('../common/types.js').ArrowDataType,
    INTEGER: 'int32' as import('../common/types.js').ArrowDataType,
    BIGINT: 'int64' as import('../common/types.js').ArrowDataType,
    FLOAT: 'float32' as import('../common/types.js').ArrowDataType,
    DOUBLE: 'float64' as import('../common/types.js').ArrowDataType,
    BOOLEAN: 'boolean' as import('../common/types.js').ArrowDataType,
    BOOL: 'boolean' as import('../common/types.js').ArrowDataType,
    BLOB: 'binary' as import('../common/types.js').ArrowDataType,
    BINARY: 'binary' as import('../common/types.js').ArrowDataType,
    TIMESTAMP: 'timestamp' as import('../common/types.js').ArrowDataType,
    VECTOR: 'fixed_size_list' as import('../common/types.js').ArrowDataType,
  };

  const columns = columnDefs.map(def => {
    const parts = def.trim().split(/\s+/);
    const name = parts[0];
    const rawType = parts[1]?.toUpperCase() ?? 'TEXT';
    const nullable = !def.toUpperCase().includes('NOT NULL');
    const dataType = typeMap[rawType] ?? ('utf8' as import('../common/types.js').ArrowDataType);
    return { name, dataType, nullable };
  });

  const schema: ArrowSchema = { columns, version: 1 };
  return { type: 'CREATE_TABLE', table, schema };
}

export function parseSQL(sql: string): QueryPlan {
  const cleaned = trimTrailingSemicolon(sql).trim();
  const upper = cleaned.toUpperCase();

  let ast: SqlAst;
  if (upper.startsWith('SELECT')) ast = parseSelect(cleaned);
  else if (upper.startsWith('INSERT')) ast = parseInsert(cleaned);
  else if (upper.startsWith('UPDATE')) ast = parseUpdate(cleaned);
  else if (upper.startsWith('DELETE')) ast = parseDelete(cleaned);
  else if (upper.startsWith('CREATE TABLE')) ast = parseCreateTable(cleaned);
  else throw new Error(`Unsupported SQL statement: ${cleaned}`);

  return {
    planId: generateId(),
    sql: cleaned,
    ast,
    phase: 'parsed',
    estimatedCost: estimateCost(ast),
    createdAt: Date.now(),
  };
}

function estimateCost(ast: SqlAst): number {
  switch (ast.type) {
    case 'SELECT': return ast.where ? 10 : 50;
    case 'VECTOR_SEARCH': return 5;
    case 'INSERT': return 2 * (ast.values?.length ?? 1);
    case 'UPDATE': return ast.where ? 15 : 100;
    case 'DELETE': return ast.where ? 10 : 100;
    case 'CREATE_TABLE': return 1;
    default: return 50;
  }
}

// ─── Filter evaluator for WHERE clauses ──────────────────────

function evaluateWhere(
  row: Record<string, unknown>,
  clauses: WhereClause[],
): boolean {
  return clauses.every(clause => {
    const val = row[clause.column];
    switch (clause.operator) {
      case '=': return val === clause.value;
      case '!=': return val !== clause.value;
      case '<': return (val as number) < (clause.value as number);
      case '>': return (val as number) > (clause.value as number);
      case '<=': return (val as number) <= (clause.value as number);
      case '>=': return (val as number) >= (clause.value as number);
      case 'LIKE': {
        const pattern = String(clause.value).replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`, 'i').test(String(val));
      }
      case 'IN': return Array.isArray(clause.value) && clause.value.includes(val);
      default: return false;
    }
  });
}

// ─── QueryEngine — Domain Service ────────────────────────────

export type TableStore = Map<string, {
  schema: ArrowSchema;
  rows: Array<Record<string, unknown>>;
}>;

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
    let table = this.tables.get(ast.table);
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
