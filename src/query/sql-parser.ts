/**
 * VibeCast Query — SQL Parser
 * SQL AST types and parser for SELECT, INSERT, UPDATE, DELETE, CREATE TABLE,
 * and VECTOR_SEARCH statements.
 * ADR-002: Split from monolithic query module into DDD-compliant submodule.
 * ADR-003: Hybrid queries combining vector search with relational filters.
 */
import {
  UUID, DistanceMetric, ArrowSchema, ArrowDataType, generateId,
} from '../common/types.js';

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

// ─── SQL Parser — Internal Helpers ───────────────────────────

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

  const typeMap: Record<string, ArrowDataType> = {
    TEXT: ArrowDataType.Utf8,
    VARCHAR: ArrowDataType.Utf8,
    STRING: ArrowDataType.Utf8,
    INT: ArrowDataType.Int32,
    INTEGER: ArrowDataType.Int32,
    BIGINT: ArrowDataType.Int64,
    FLOAT: ArrowDataType.Float32,
    DOUBLE: ArrowDataType.Float64,
    BOOLEAN: ArrowDataType.Boolean,
    BOOL: ArrowDataType.Boolean,
    BLOB: ArrowDataType.Binary,
    BINARY: ArrowDataType.Binary,
    TIMESTAMP: ArrowDataType.Timestamp,
    VECTOR: ArrowDataType.FixedSizeList,
  };

  const columns = columnDefs.map(def => {
    const parts = def.trim().split(/\s+/);
    const name = parts[0];
    const rawType = parts[1]?.toUpperCase() ?? 'TEXT';
    const nullable = !def.toUpperCase().includes('NOT NULL');
    const dataType = typeMap[rawType] ?? ArrowDataType.Utf8;
    return { name, dataType, nullable };
  });

  const schema: ArrowSchema = { columns, version: 1 };
  return { type: 'CREATE_TABLE', table, schema };
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

// ─── Public API ──────────────────────────────────────────────

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

// ─── Filter evaluator for WHERE clauses ──────────────────────

export function evaluateWhere(
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
