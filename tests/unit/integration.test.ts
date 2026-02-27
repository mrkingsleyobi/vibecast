/**
 * Tests for VibeCast Integration Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntegrationEngine,
  ProtocolAdapter,
  WireSession,
  WireMessageType,
  PgTypeOid,
  SessionState,
  TransactionState,
  InternalQueryKind,
  PROTOCOL_VERSION_3,
} from '../../src/integration/index.js';
import { EventBus } from '../../src/common/events.js';
import { ArrowDataType, generateId } from '../../src/common/types.js';

describe('Integration Engine', () => {
  let engine: IntegrationEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new IntegrationEngine(eventBus);
  });

  describe('Session Management', () => {
    it('should open a session', () => {
      const result = engine.openSession(generateId());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBeDefined();
        expect(result.value.state).toBe(SessionState.Startup);
      }
    });

    it('should handle startup message', () => {
      const openResult = engine.openSession(generateId());
      if (openResult.ok) {
        const result = engine.handleMessage(openResult.value.sessionId, {
          type: WireMessageType.StartupMessage,
          payload: { parameters: { user: 'test', database: 'testdb' } },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.some(m => m.type === WireMessageType.AuthenticationOk)).toBe(true);
          expect(result.value.some(m => m.type === WireMessageType.ReadyForQuery)).toBe(true);
        }
      }
    });

    it('should close a session', () => {
      const openResult = engine.openSession(generateId());
      if (openResult.ok) {
        const closeResult = engine.closeSession(openResult.value.sessionId);
        expect(closeResult.ok).toBe(true);
        expect(engine.getSession(openResult.value.sessionId)).toBeUndefined();
      }
    });

    it('should track session count', () => {
      expect(engine.sessionCount).toBe(0);
      engine.openSession(generateId());
      engine.openSession(generateId());
      expect(engine.sessionCount).toBe(2);
    });

    it('should return error for missing session', () => {
      const result = engine.handleMessage('nonexistent', {
        type: WireMessageType.Query,
        payload: { query: 'SELECT 1' },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('Simple Query Protocol', () => {
    let sessionId: string;

    beforeEach(() => {
      const openResult = engine.openSession(generateId());
      if (openResult.ok) {
        sessionId = openResult.value.sessionId;
        engine.handleMessage(sessionId, {
          type: WireMessageType.StartupMessage,
          payload: { parameters: {} },
        });
      }
    });

    it('should handle simple SELECT query', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: 'SELECT * FROM users' },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some(m => m.type === WireMessageType.CommandComplete)).toBe(true);
        expect(result.value.some(m => m.type === WireMessageType.ReadyForQuery)).toBe(true);
      }
    });

    it('should handle INSERT query', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: "INSERT INTO users (id) VALUES (1)" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const complete = result.value.find(m => m.type === WireMessageType.CommandComplete);
        expect(complete?.payload.tag).toContain('INSERT');
      }
    });

    it('should handle transaction commands', () => {
      // BEGIN
      let result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: 'BEGIN' },
      });
      expect(result.ok).toBe(true);

      // COMMIT
      result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: 'COMMIT' },
      });
      expect(result.ok).toBe(true);
    });

    it('should handle SET commands', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: 'SET search_path TO public' },
      });
      expect(result.ok).toBe(true);
    });

    it('should handle invalid SQL with error response', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Query,
        payload: { query: 'INVALID SQL' },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some(m => m.type === WireMessageType.ErrorResponse)).toBe(true);
      }
    });
  });

  describe('Extended Query Protocol', () => {
    let sessionId: string;

    beforeEach(() => {
      const openResult = engine.openSession(generateId());
      if (openResult.ok) {
        sessionId = openResult.value.sessionId;
        engine.handleMessage(sessionId, {
          type: WireMessageType.StartupMessage,
          payload: { parameters: {} },
        });
      }
    });

    it('should handle Parse message', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Parse,
        payload: { name: 'stmt1', query: 'SELECT * FROM users', parameterTypes: [] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].type).toBe(WireMessageType.ParseComplete);
      }
    });

    it('should handle Bind message', () => {
      // First parse
      engine.handleMessage(sessionId, {
        type: WireMessageType.Parse,
        payload: { name: 'stmt1', query: 'SELECT * FROM users', parameterTypes: [] },
      });

      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Bind,
        payload: { portal: 'portal1', statement: 'stmt1', parameters: [] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].type).toBe(WireMessageType.BindComplete);
      }
    });

    it('should handle Sync message', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Sync,
        payload: {},
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].type).toBe(WireMessageType.ReadyForQuery);
      }
    });

    it('should handle Close message', () => {
      engine.prepareStatement(sessionId, 'stmt1', 'SELECT 1');
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Close,
        payload: { kind: 'S', name: 'stmt1' },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].type).toBe(WireMessageType.CloseComplete);
      }
    });

    it('should handle Terminate message', () => {
      const result = engine.handleMessage(sessionId, {
        type: WireMessageType.Terminate,
        payload: {},
      });
      expect(result.ok).toBe(true);
      expect(engine.getSession(sessionId)).toBeUndefined();
    });
  });

  describe('Domain Events', () => {
    it('should emit WireSessionOpened event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      engine.openSession(generateId());
      expect(events).toContain('WireSessionOpened');
    });

    it('should emit QueryTranslated event', () => {
      const events: string[] = [];
      const openResult = engine.openSession(generateId());
      if (openResult.ok) {
        const sid = openResult.value.sessionId;
        engine.handleMessage(sid, {
          type: WireMessageType.StartupMessage,
          payload: { parameters: {} },
        });
        eventBus.onAll((e) => events.push(e.eventType));
        engine.handleMessage(sid, {
          type: WireMessageType.Query,
          payload: { query: 'SELECT * FROM test' },
        });
      }
      expect(events).toContain('QueryTranslated');
    });
  });
});

describe('ProtocolAdapter', () => {
  let adapter: ProtocolAdapter;

  beforeEach(() => {
    adapter = new ProtocolAdapter();
  });

  describe('Type Mapping', () => {
    it('should map PG types to Arrow types', () => {
      expect(adapter.mapPgTypeToArrow(PgTypeOid.Int4)).toBe(ArrowDataType.Int32);
      expect(adapter.mapPgTypeToArrow(PgTypeOid.Int8)).toBe(ArrowDataType.Int64);
      expect(adapter.mapPgTypeToArrow(PgTypeOid.Float4)).toBe(ArrowDataType.Float32);
      expect(adapter.mapPgTypeToArrow(PgTypeOid.Text)).toBe(ArrowDataType.Utf8);
      expect(adapter.mapPgTypeToArrow(PgTypeOid.Bool)).toBe(ArrowDataType.Boolean);
    });

    it('should map Arrow types to PG types', () => {
      expect(adapter.mapArrowTypeToPg(ArrowDataType.Int32)).toBe(PgTypeOid.Int4);
      expect(adapter.mapArrowTypeToPg(ArrowDataType.Utf8)).toBe(PgTypeOid.Text);
    });

    it('should default to Text/Utf8 for unknown types', () => {
      expect(adapter.mapPgTypeToArrow(99999 as PgTypeOid)).toBe(ArrowDataType.Utf8);
      expect(adapter.mapArrowTypeToPg('unknown' as ArrowDataType)).toBe(PgTypeOid.Text);
    });
  });

  describe('Query Translation', () => {
    it('should translate SELECT', () => {
      const result = adapter.translateQuery('SELECT * FROM users');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe(InternalQueryKind.Select);
        expect(result.value.table).toBe('users');
      }
    });

    it('should translate INSERT', () => {
      const result = adapter.translateQuery("INSERT INTO users (id) VALUES (1)");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe(InternalQueryKind.Insert);
        expect(result.value.table).toBe('users');
      }
    });

    it('should translate BEGIN/COMMIT/ROLLBACK', () => {
      expect(adapter.translateQuery('BEGIN').ok).toBe(true);
      expect(adapter.translateQuery('COMMIT').ok).toBe(true);
      expect(adapter.translateQuery('ROLLBACK').ok).toBe(true);
    });

    it('should translate SET', () => {
      const result = adapter.translateQuery('SET search_path TO public');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.kind).toBe(InternalQueryKind.Set);
    });

    it('should reject unsupported SQL', () => {
      const result = adapter.translateQuery('GRANT ALL ON users TO admin');
      expect(result.ok).toBe(false);
    });

    it('should parse LIMIT clause', () => {
      const result = adapter.translateQuery('SELECT * FROM users LIMIT 10');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.limit).toBe(10);
    });
  });

  describe('Result Serialization', () => {
    it('should serialize result set to wire messages', () => {
      const result = {
        columns: [
          { name: 'id', dataType: ArrowDataType.Int32 },
          { name: 'name', dataType: ArrowDataType.Utf8 },
        ],
        rows: [[1, 'alice'], [2, 'bob']],
        rowCount: 2,
        commandTag: 'SELECT 2',
      };

      const messages = adapter.serializeResult(result);
      expect(messages.some(m => m.type === WireMessageType.RowDescription)).toBe(true);
      expect(messages.filter(m => m.type === WireMessageType.DataRow)).toHaveLength(2);
      expect(messages.some(m => m.type === WireMessageType.CommandComplete)).toBe(true);
    });
  });
});

describe('WireSession', () => {
  it('should initialize with startup state', () => {
    const session = new WireSession(generateId());
    expect(session.state).toBe(SessionState.Startup);
    expect(session.transactionState).toBe(TransactionState.Idle);
    expect(session.protocolVersion).toBe(PROTOCOL_VERSION_3);
  });

  it('should set default server parameters', () => {
    const session = new WireSession(generateId());
    expect(session.parameters.get('server_version')).toContain('VibeCast');
    expect(session.parameters.get('server_encoding')).toBe('UTF8');
  });

  it('should manage prepared statements', () => {
    const session = new WireSession(generateId());
    session.addPreparedStatement({ name: 'stmt1', sql: 'SELECT 1', parameterTypes: [], columns: [] });
    expect(session.getPreparedStatement('stmt1')).toBeDefined();
    session.removePreparedStatement('stmt1');
    expect(session.getPreparedStatement('stmt1')).toBeUndefined();
  });

  it('should manage portals', () => {
    const session = new WireSession(generateId());
    session.addPortal({ name: 'p1', statementName: 'stmt1', parameters: [], resultFormatCodes: [] });
    expect(session.getPortal('p1')).toBeDefined();
    session.removePortal('p1');
    expect(session.getPortal('p1')).toBeUndefined();
  });

  it('should track transaction state', () => {
    const session = new WireSession(generateId());
    session.authenticate();
    session.markReady();

    expect(session.readyForQueryIndicator).toBe('I');
    session.beginTransaction();
    expect(session.readyForQueryIndicator).toBe('T');
    session.failTransaction();
    expect(session.readyForQueryIndicator).toBe('E');
    session.rollbackTransaction();
    expect(session.readyForQueryIndicator).toBe('I');
  });

  it('should clean up on close', () => {
    const session = new WireSession(generateId());
    session.addPreparedStatement({ name: 's', sql: '', parameterTypes: [], columns: [] });
    session.addPortal({ name: 'p', statementName: 's', parameters: [], resultFormatCodes: [] });
    session.close();
    expect(session.state).toBe(SessionState.Closing);
    expect(session.getPreparedStatement('s')).toBeUndefined();
  });
});
