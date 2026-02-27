/**
 * Wire Protocol Constants, Enums, and Interfaces
 *
 * PostgreSQL wire protocol v3 types used throughout the
 * Integration bounded context per ADR-009.
 */
import { ArrowDataType } from '../common/types.js';

// ─── Wire Protocol Constants ────────────────────────────────

export const PROTOCOL_VERSION_3 = 196608; // 3.0 encoded as (3 << 16)

// ─── PostgreSQL Type OIDs ───────────────────────────────────

export enum PgTypeOid {
  Bool = 16,
  Bytea = 17,
  Int8 = 20,
  Int4 = 23,
  Float4 = 700,
  Float8 = 701,
  Text = 25,
  Timestamp = 1184,
}

// ─── Session & Transaction States ───────────────────────────

export enum SessionState {
  Startup = 'startup',
  Authenticated = 'authenticated',
  Ready = 'ready',
  InQuery = 'in_query',
  Closing = 'closing',
}

export enum TransactionState {
  Idle = 'idle',
  InTransaction = 'in_transaction',
  Failed = 'failed',
}

// ─── Wire Protocol Message Types ────────────────────────────

export enum WireMessageType {
  // Frontend (client) messages
  StartupMessage = 'StartupMessage',
  Query = 'Query',
  Parse = 'Parse',
  Bind = 'Bind',
  Describe = 'Describe',
  Execute = 'Execute',
  Close = 'Close',
  Sync = 'Sync',
  Terminate = 'Terminate',
  // Backend (server) messages
  AuthenticationOk = 'AuthenticationOk',
  ParameterStatus = 'ParameterStatus',
  ReadyForQuery = 'ReadyForQuery',
  RowDescription = 'RowDescription',
  DataRow = 'DataRow',
  CommandComplete = 'CommandComplete',
  ParseComplete = 'ParseComplete',
  BindComplete = 'BindComplete',
  CloseComplete = 'CloseComplete',
  ErrorResponse = 'ErrorResponse',
  NoData = 'NoData',
}

// ─── Wire Message Interfaces ────────────────────────────────

export interface WireMessage {
  type: WireMessageType;
  payload: Record<string, unknown>;
}

export interface FieldDescription {
  name: string;
  tableOid: number;
  columnIndex: number;
  typeOid: PgTypeOid;
  typeSize: number;
  typeMod: number;
  formatCode: number; // 0 = text, 1 = binary
}

export interface PreparedStatement {
  name: string;
  sql: string;
  parameterTypes: PgTypeOid[];
  columns: FieldDescription[];
}

export interface Portal {
  name: string;
  statementName: string;
  parameters: unknown[];
  resultFormatCodes: number[];
}

// ─── Internal Query Representation ──────────────────────────

export enum InternalQueryKind {
  Select = 'select',
  Insert = 'insert',
  Update = 'update',
  Delete = 'delete',
  VectorSearch = 'vector_search',
  Begin = 'begin',
  Commit = 'commit',
  Rollback = 'rollback',
  CreateTable = 'create_table',
  DropTable = 'drop_table',
  Set = 'set',
}

export interface InternalQuery {
  kind: InternalQueryKind;
  table?: string;
  columns?: string[];
  conditions?: string[];
  values?: unknown[][];
  orderBy?: string[];
  limit?: number;
  rawSql: string;
}

export interface InternalResultSet {
  columns: Array<{ name: string; dataType: ArrowDataType }>;
  rows: unknown[][];
  rowCount: number;
  commandTag: string;
}

// ─── Event Payloads ─────────────────────────────────────────

export interface WireSessionOpenedPayload {
  sessionId: string;
  principalId: string;
  protocolVersion: number;
}

export interface QueryTranslatedPayload {
  sessionId: string;
  originalSql: string;
  queryKind: InternalQueryKind;
}

export interface ResultSerializedPayload {
  sessionId: string;
  rowCount: number;
  commandTag: string;
}

export interface WireSessionClosedPayload {
  sessionId: string;
  principalId: string;
  reason: string;
}
