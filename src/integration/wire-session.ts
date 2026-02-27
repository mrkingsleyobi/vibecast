/**
 * WireSession Aggregate Root
 *
 * Manages a single PostgreSQL wire protocol session including
 * authentication state, transaction state, prepared statements,
 * and portals.
 */
import { UUID, ArrowDataType, generateId } from '../common/types.js';
import {
  PROTOCOL_VERSION_3,
  PgTypeOid,
  SessionState,
  TransactionState,
  PreparedStatement,
  Portal,
} from './wire-protocol.js';
import { PG_TO_ARROW } from './protocol-adapter.js';

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

    this.parameters.set('server_version', '15.0 (VibeCast)');
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
