/**
 * Protocol Adapter — PG <-> Arrow Type Mapping
 *
 * Translates between PostgreSQL type OIDs and Arrow data types,
 * handles SQL query translation and result serialization.
 */
import { ArrowDataType, Result, ok, err } from '../common/types.js';
import {
  PgTypeOid,
  WireMessageType,
  WireMessage,
  FieldDescription,
  InternalQueryKind,
  InternalQuery,
  InternalResultSet,
} from './wire-protocol.js';

// ─── PG ↔ Arrow Type Mapping ────────────────────────────────

const PG_TO_ARROW: ReadonlyMap<PgTypeOid, ArrowDataType> = new Map([
  [PgTypeOid.Int4, ArrowDataType.Int32],
  [PgTypeOid.Int8, ArrowDataType.Int64],
  [PgTypeOid.Float4, ArrowDataType.Float32],
  [PgTypeOid.Float8, ArrowDataType.Float64],
  [PgTypeOid.Text, ArrowDataType.Utf8],
  [PgTypeOid.Bool, ArrowDataType.Boolean],
  [PgTypeOid.Bytea, ArrowDataType.Binary],
  [PgTypeOid.Timestamp, ArrowDataType.Timestamp],
]);

const ARROW_TO_PG: ReadonlyMap<ArrowDataType, PgTypeOid> = new Map([
  [ArrowDataType.Int32, PgTypeOid.Int4],
  [ArrowDataType.Int64, PgTypeOid.Int8],
  [ArrowDataType.Float32, PgTypeOid.Float4],
  [ArrowDataType.Float64, PgTypeOid.Float8],
  [ArrowDataType.Utf8, PgTypeOid.Text],
  [ArrowDataType.Boolean, PgTypeOid.Bool],
  [ArrowDataType.Binary, PgTypeOid.Bytea],
  [ArrowDataType.Timestamp, PgTypeOid.Timestamp],
]);

// ─── ProtocolAdapter ────────────────────────────────────────

export { PG_TO_ARROW, ARROW_TO_PG };

export class ProtocolAdapter {
  mapPgTypeToArrow(pgOid: PgTypeOid): ArrowDataType {
    const mapped = PG_TO_ARROW.get(pgOid);
    if (!mapped) {
      return ArrowDataType.Utf8; // default fallback
    }
    return mapped;
  }

  mapArrowTypeToPg(arrowType: ArrowDataType): PgTypeOid {
    const mapped = ARROW_TO_PG.get(arrowType);
    if (!mapped) {
      return PgTypeOid.Text; // default fallback
    }
    return mapped;
  }

  translateQuery(pgSql: string): Result<InternalQuery> {
    const trimmed = pgSql.trim().replace(/;$/, '').trim();
    const upper = trimmed.toUpperCase();

    if (upper === 'BEGIN' || upper === 'START TRANSACTION') {
      return ok({ kind: InternalQueryKind.Begin, rawSql: trimmed });
    }
    if (upper === 'COMMIT' || upper === 'END') {
      return ok({ kind: InternalQueryKind.Commit, rawSql: trimmed });
    }
    if (upper === 'ROLLBACK') {
      return ok({ kind: InternalQueryKind.Rollback, rawSql: trimmed });
    }
    if (upper.startsWith('SET ')) {
      return ok({ kind: InternalQueryKind.Set, rawSql: trimmed });
    }
    if (upper.startsWith('SELECT')) {
      return this.parseSelect(trimmed);
    }
    if (upper.startsWith('INSERT')) {
      return this.parseInsert(trimmed);
    }
    if (upper.startsWith('UPDATE')) {
      return ok({ kind: InternalQueryKind.Update, rawSql: trimmed });
    }
    if (upper.startsWith('DELETE')) {
      return ok({ kind: InternalQueryKind.Delete, rawSql: trimmed });
    }
    if (upper.startsWith('CREATE TABLE')) {
      return ok({ kind: InternalQueryKind.CreateTable, rawSql: trimmed });
    }
    if (upper.startsWith('DROP TABLE')) {
      return ok({ kind: InternalQueryKind.DropTable, rawSql: trimmed });
    }

    return err(new Error(`Unsupported SQL: ${trimmed.slice(0, 80)}`));
  }

  serializeResult(result: InternalResultSet): WireMessage[] {
    const messages: WireMessage[] = [];

    if (result.columns.length > 0) {
      const fields: FieldDescription[] = result.columns.map((col, idx) => ({
        name: col.name,
        tableOid: 0,
        columnIndex: idx,
        typeOid: this.mapArrowTypeToPg(col.dataType),
        typeSize: this.pgTypeSize(this.mapArrowTypeToPg(col.dataType)),
        typeMod: -1,
        formatCode: 0,
      }));
      messages.push({
        type: WireMessageType.RowDescription,
        payload: { fields },
      });
    }

    for (const row of result.rows) {
      messages.push({
        type: WireMessageType.DataRow,
        payload: { values: row.map(v => (v === null ? null : String(v))) },
      });
    }

    messages.push({
      type: WireMessageType.CommandComplete,
      payload: { tag: result.commandTag },
    });

    return messages;
  }

  private parseSelect(sql: string): Result<InternalQuery> {
    const query: InternalQuery = { kind: InternalQueryKind.Select, rawSql: sql };

    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      query.table = fromMatch[1];
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      query.limit = parseInt(limitMatch[1], 10);
    }

    if (sql.toUpperCase().includes('ORDER BY')) {
      const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/i);
      if (orderMatch) {
        query.orderBy = orderMatch[1].split(',').map(s => s.trim());
      }
    }

    return ok(query);
  }

  private parseInsert(sql: string): Result<InternalQuery> {
    const query: InternalQuery = { kind: InternalQueryKind.Insert, rawSql: sql };

    const tableMatch = sql.match(/INTO\s+(\w+)/i);
    if (tableMatch) {
      query.table = tableMatch[1];
    }

    return ok(query);
  }

  private pgTypeSize(oid: PgTypeOid): number {
    switch (oid) {
      case PgTypeOid.Bool: return 1;
      case PgTypeOid.Int4: return 4;
      case PgTypeOid.Int8: return 8;
      case PgTypeOid.Float4: return 4;
      case PgTypeOid.Float8: return 8;
      default: return -1; // variable length
    }
  }
}
