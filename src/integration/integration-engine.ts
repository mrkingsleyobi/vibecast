/**
 * IntegrationEngine Service
 *
 * Orchestrates PG wire protocol sessions, routing incoming
 * messages to appropriate handlers and emitting domain events.
 */
import { UUID, Result, ok, err } from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';
import {
  PgTypeOid,
  SessionState,
  WireMessageType,
  WireMessage,
  PreparedStatement,
  Portal,
  InternalQueryKind,
  InternalQuery,
  InternalResultSet,
  WireSessionOpenedPayload,
  QueryTranslatedPayload,
  ResultSerializedPayload,
  WireSessionClosedPayload,
} from './wire-protocol.js';
import { ProtocolAdapter } from './protocol-adapter.js';
import { WireSession } from './wire-session.js';

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
