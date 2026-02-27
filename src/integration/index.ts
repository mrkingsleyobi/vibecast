/**
 * Driftbase Integration Bounded Context
 *
 * PostgreSQL wire protocol v3 compatibility layer per ADR-009.
 * Translates between PG wire protocol messages and the internal
 * query engine, managing sessions, type mapping, prepared statements,
 * and transaction state.
 */
import { UUID, ArrowDataType, generateId, Result, ok, err } from '../common/types.js';
import { DomainEvent, BoundedContext, createEvent, EventBus } from '../common/events.js';

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
  sessionId: UUID;
  principalId: UUID;
  protocolVersion: number;
}

export interface QueryTranslatedPayload {
  sessionId: UUID;
  originalSql: string;
  queryKind: InternalQueryKind;
}

export interface ResultSerializedPayload {
  sessionId: UUID;
  rowCount: number;
  commandTag: string;
}

export interface WireSessionClosedPayload {
  sessionId: UUID;
  principalId: UUID;
  reason: string;
}

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

// ─── WireSession Aggregate Root ─────────────────────────────

export class WireSession {
  readonly sessionId: UUID;
  readonly principalId: UUID;
  readonly protocolVersion: number;
  readonly parameters: Map<string, string>;
  readonly preparedStatements: Map<string, PreparedStatement>;
  readonly portals: Map<string, Portal>;
  readonly typeOidMap: Map<PgTypeOid, ArrowDataType>;

  private _state: SessionState;
  private _txState: TransactionState;

  constructor(principalId: UUID, protocolVersion: number = PROTOCOL_VERSION_3) {
    this.sessionId = generateId();
    this.principalId = principalId;
    this.protocolVersion = protocolVersion;
    this.parameters = new Map();
    this.preparedStatements = new Map();
    this.portals = new Map();
    this.typeOidMap = new Map(PG_TO_ARROW);
    this._state = SessionState.Startup;
    this._txState = TransactionState.Idle;

    this.parameters.set('server_version', '15.0 (Driftbase)');
    this.parameters.set('server_encoding', 'UTF8');
    this.parameters.set('client_encoding', 'UTF8');
    this.parameters.set('DateStyle', 'ISO, MDY');
    this.parameters.set('TimeZone', 'UTC');
  }

  get state(): SessionState {
    return this._state;
  }

  get transactionState(): TransactionState {
    return this._txState;
  }

  get readyForQueryIndicator(): string {
    switch (this._txState) {
      case TransactionState.Idle: return 'I';
      case TransactionState.InTransaction: return 'T';
      case TransactionState.Failed: return 'E';
    }
  }

  authenticate(): void {
    if (this._state !== SessionState.Startup) {
      throw new Error(`Cannot authenticate in state ${this._state}`);
    }
    this._state = SessionState.Authenticated;
  }

  markReady(): void {
    if (this._state !== SessionState.Authenticated && this._state !== SessionState.InQuery) {
      throw new Error(`Cannot transition to ready from state ${this._state}`);
    }
    this._state = SessionState.Ready;
  }

  beginQuery(): void {
    if (this._state !== SessionState.Ready) {
      throw new Error(`Cannot begin query in state ${this._state}`);
    }
    this._state = SessionState.InQuery;
  }

  beginTransaction(): void {
    if (this._txState !== TransactionState.Idle) {
      throw new Error(`Cannot begin transaction in state ${this._txState}`);
    }
    this._txState = TransactionState.InTransaction;
  }

  commitTransaction(): void {
    if (this._txState !== TransactionState.InTransaction) {
      throw new Error(`Cannot commit: not in transaction`);
    }
    this._txState = TransactionState.Idle;
  }

  rollbackTransaction(): void {
    this._txState = TransactionState.Idle;
  }

  failTransaction(): void {
    if (this._txState === TransactionState.InTransaction) {
      this._txState = TransactionState.Failed;
    }
  }

  addPreparedStatement(stmt: PreparedStatement): void {
    this.preparedStatements.set(stmt.name, stmt);
  }

  getPreparedStatement(name: string): PreparedStatement | undefined {
    return this.preparedStatements.get(name);
  }

  removePreparedStatement(name: string): boolean {
    return this.preparedStatements.delete(name);
  }

  addPortal(portal: Portal): void {
    this.portals.set(portal.name, portal);
  }

  getPortal(name: string): Portal | undefined {
    return this.portals.get(name);
  }

  removePortal(name: string): boolean {
    return this.portals.delete(name);
  }

  close(): void {
    this._state = SessionState.Closing;
    this.preparedStatements.clear();
    this.portals.clear();
  }
}

// ─── IntegrationEngine Service ──────────────────────────────

export class IntegrationEngine {
  private readonly sessions: Map<UUID, WireSession> = new Map();
  private readonly adapter: ProtocolAdapter;
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus, adapter?: ProtocolAdapter) {
    this.eventBus = eventBus;
    this.adapter = adapter ?? new ProtocolAdapter();
  }

  openSession(principalId: UUID): Result<WireSession> {
    const session = new WireSession(principalId);
    this.sessions.set(session.sessionId, session);

    this.emitEvent('WireSessionOpened', {
      sessionId: session.sessionId,
      principalId,
      protocolVersion: session.protocolVersion,
    } satisfies WireSessionOpenedPayload);

    return ok(session);
  }

  handleMessage(sessionId: UUID, message: WireMessage): Result<WireMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Session not found: ${sessionId}`));
    }

    switch (message.type) {
      case WireMessageType.StartupMessage:
        return this.handleStartup(session, message);
      case WireMessageType.Query:
        return this.handleSimpleQuery(session, message);
      case WireMessageType.Parse:
        return this.handleParse(session, message);
      case WireMessageType.Bind:
        return this.handleBind(session, message);
      case WireMessageType.Describe:
        return this.handleDescribe(session, message);
      case WireMessageType.Execute:
        return this.handleExecute(session, message);
      case WireMessageType.Sync:
        return this.handleSync(session);
      case WireMessageType.Close:
        return this.handleClose(session, message);
      case WireMessageType.Terminate:
        return this.handleTerminate(session);
      default:
        return err(new Error(`Unsupported message type: ${message.type}`));
    }
  }

  closeSession(sessionId: UUID): Result<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Session not found: ${sessionId}`));
    }

    session.close();
    this.sessions.delete(sessionId);

    this.emitEvent('WireSessionClosed', {
      sessionId,
      principalId: session.principalId,
      reason: 'client_request',
    } satisfies WireSessionClosedPayload);

    return ok(undefined);
  }

  prepareStatement(
    sessionId: UUID,
    name: string,
    sql: string,
  ): Result<WireMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Session not found: ${sessionId}`));
    }

    const parseMsg: WireMessage = {
      type: WireMessageType.Parse,
      payload: { name, query: sql, parameterTypes: [] },
    };
    return this.handleParse(session, parseMsg);
  }

  executePortal(sessionId: UUID, portalName: string): Result<WireMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Session not found: ${sessionId}`));
    }

    const execMsg: WireMessage = {
      type: WireMessageType.Execute,
      payload: { portal: portalName, maxRows: 0 },
    };
    return this.handleExecute(session, execMsg);
  }

  getSession(sessionId: UUID): WireSession | undefined {
    return this.sessions.get(sessionId);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  // ─── Message Handlers ───────────────────────────────────

  private handleStartup(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const params = (message.payload.parameters ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(params)) {
      session.parameters.set(key, value);
    }

    session.authenticate();
    session.markReady();

    const responses: WireMessage[] = [
      { type: WireMessageType.AuthenticationOk, payload: {} },
    ];

    for (const [name, value] of session.parameters) {
      responses.push({
        type: WireMessageType.ParameterStatus,
        payload: { name, value },
      });
    }

    responses.push({
      type: WireMessageType.ReadyForQuery,
      payload: { transactionStatus: session.readyForQueryIndicator },
    });

    return ok(responses);
  }

  private handleSimpleQuery(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const sql = message.payload.query as string;
    if (!sql) {
      return err(new Error('Query message missing query string'));
    }

    session.beginQuery();
    const translateResult = this.adapter.translateQuery(sql);

    if (!translateResult.ok) {
      session.failTransaction();
      session.markReady();
      return ok([
        this.errorMessage(translateResult.error.message),
        { type: WireMessageType.ReadyForQuery, payload: { transactionStatus: session.readyForQueryIndicator } },
      ]);
    }

    const query = translateResult.value;
    this.emitEvent('QueryTranslated', {
      sessionId: session.sessionId,
      originalSql: sql,
      queryKind: query.kind,
    } satisfies QueryTranslatedPayload);

    const responses = this.processQuery(session, query);
    session.markReady();

    responses.push({
      type: WireMessageType.ReadyForQuery,
      payload: { transactionStatus: session.readyForQueryIndicator },
    });

    return ok(responses);
  }

  private handleParse(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const name = (message.payload.name ?? '') as string;
    const sql = (message.payload.query ?? '') as string;
    const paramTypes = (message.payload.parameterTypes ?? []) as PgTypeOid[];

    const translateResult = this.adapter.translateQuery(sql);
    if (!translateResult.ok) {
      return ok([this.errorMessage(translateResult.error.message)]);
    }

    const stmt: PreparedStatement = {
      name,
      sql,
      parameterTypes: paramTypes,
      columns: [],
    };
    session.addPreparedStatement(stmt);

    return ok([{ type: WireMessageType.ParseComplete, payload: {} }]);
  }

  private handleBind(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const portalName = (message.payload.portal ?? '') as string;
    const stmtName = (message.payload.statement ?? '') as string;
    const params = (message.payload.parameters ?? []) as unknown[];
    const formatCodes = (message.payload.resultFormatCodes ?? []) as number[];

    const stmt = session.getPreparedStatement(stmtName);
    if (!stmt) {
      return ok([this.errorMessage(`Prepared statement not found: ${stmtName}`)]);
    }

    const portal: Portal = {
      name: portalName,
      statementName: stmtName,
      parameters: params,
      resultFormatCodes: formatCodes,
    };
    session.addPortal(portal);

    return ok([{ type: WireMessageType.BindComplete, payload: {} }]);
  }

  private handleDescribe(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const kind = (message.payload.kind ?? 'S') as string; // 'S' = statement, 'P' = portal
    const name = (message.payload.name ?? '') as string;

    if (kind === 'S') {
      const stmt = session.getPreparedStatement(name);
      if (!stmt) {
        return ok([this.errorMessage(`Prepared statement not found: ${name}`)]);
      }
      if (stmt.columns.length === 0) {
        return ok([{ type: WireMessageType.NoData, payload: {} }]);
      }
      return ok([{
        type: WireMessageType.RowDescription,
        payload: { fields: stmt.columns },
      }]);
    }

    const portal = session.getPortal(name);
    if (!portal) {
      return ok([this.errorMessage(`Portal not found: ${name}`)]);
    }
    return ok([{ type: WireMessageType.NoData, payload: {} }]);
  }

  private handleExecute(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const portalName = (message.payload.portal ?? '') as string;
    const portal = session.getPortal(portalName);
    if (!portal) {
      return ok([this.errorMessage(`Portal not found: ${portalName}`)]);
    }

    const stmt = session.getPreparedStatement(portal.statementName);
    if (!stmt) {
      return ok([this.errorMessage(`Prepared statement not found: ${portal.statementName}`)]);
    }

    session.beginQuery();
    const translateResult = this.adapter.translateQuery(stmt.sql);
    if (!translateResult.ok) {
      session.failTransaction();
      session.markReady();
      return ok([this.errorMessage(translateResult.error.message)]);
    }

    const responses = this.processQuery(session, translateResult.value);
    session.markReady();

    this.emitEvent('ResultSerialized', {
      sessionId: session.sessionId,
      rowCount: 0,
      commandTag: responses.find(m => m.type === WireMessageType.CommandComplete)
        ?.payload.tag as string ?? 'EXECUTE',
    } satisfies ResultSerializedPayload);

    return ok(responses);
  }

  private handleSync(session: WireSession): Result<WireMessage[]> {
    if (session.state === SessionState.InQuery) {
      session.markReady();
    }
    return ok([{
      type: WireMessageType.ReadyForQuery,
      payload: { transactionStatus: session.readyForQueryIndicator },
    }]);
  }

  private handleClose(session: WireSession, message: WireMessage): Result<WireMessage[]> {
    const kind = (message.payload.kind ?? 'S') as string;
    const name = (message.payload.name ?? '') as string;

    if (kind === 'S') {
      session.removePreparedStatement(name);
    } else {
      session.removePortal(name);
    }

    return ok([{ type: WireMessageType.CloseComplete, payload: {} }]);
  }

  private handleTerminate(session: WireSession): Result<WireMessage[]> {
    this.closeSession(session.sessionId);
    return ok([]);
  }

  // ─── Query Processing ───────────────────────────────────

  private processQuery(session: WireSession, query: InternalQuery): WireMessage[] {
    switch (query.kind) {
      case InternalQueryKind.Begin:
        session.beginTransaction();
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'BEGIN' } }];

      case InternalQueryKind.Commit:
        session.commitTransaction();
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'COMMIT' } }];

      case InternalQueryKind.Rollback:
        session.rollbackTransaction();
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'ROLLBACK' } }];

      case InternalQueryKind.Set:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'SET' } }];

      case InternalQueryKind.Select: {
        const result: InternalResultSet = {
          columns: [],
          rows: [],
          rowCount: 0,
          commandTag: 'SELECT 0',
        };
        const serialized = this.adapter.serializeResult(result);

        this.emitEvent('ResultSerialized', {
          sessionId: session.sessionId,
          rowCount: result.rowCount,
          commandTag: result.commandTag,
        } satisfies ResultSerializedPayload);

        return serialized;
      }

      case InternalQueryKind.Insert:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'INSERT 0 0' } }];

      case InternalQueryKind.Update:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'UPDATE 0' } }];

      case InternalQueryKind.Delete:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'DELETE 0' } }];

      case InternalQueryKind.CreateTable:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'CREATE TABLE' } }];

      case InternalQueryKind.DropTable:
        return [{ type: WireMessageType.CommandComplete, payload: { tag: 'DROP TABLE' } }];

      default:
        return [this.errorMessage(`Unhandled query kind: ${query.kind}`)];
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private errorMessage(message: string): WireMessage {
    return {
      type: WireMessageType.ErrorResponse,
      payload: {
        severity: 'ERROR',
        code: '42000',
        message,
      },
    };
  }

  private emitEvent(eventType: string, payload: unknown): void {
    const event = createEvent(eventType, BoundedContext.Integration, payload);
    this.eventBus.emit(event).catch(() => {
      // Event emission failures are non-fatal for session operations
    });
  }
}
