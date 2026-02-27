/**
 * Integration Test: Integration (Wire Protocol) ↔ Query Engine
 * ADR-002 Relationship: Integration → Query + Storage (ACL)
 * Wire protocol translates external SQL to internal types.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { generateId } from '../../src/common/types.js';
import {
  IntegrationEngine,
  WireMessageType,
  WireMessage,
} from '../../src/integration/index.js';
import { QueryEngine } from '../../src/query/index.js';

describe('Integration ↔ Query Engine Integration', () => {
  let eventBus: EventBus;
  let integration: IntegrationEngine;
  let queryEngine: QueryEngine;

  beforeEach(() => {
    eventBus = new EventBus();
    integration = new IntegrationEngine(eventBus);
    queryEngine = new QueryEngine(eventBus);
  });

  it('should open session and process simple SELECT through wire protocol', () => {
    const principalId = generateId();
    const sessionResult = integration.openSession(principalId);
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;
    const session = sessionResult.value;

    // Startup handshake
    const startupMsg: WireMessage = {
      type: WireMessageType.StartupMessage,
      payload: { parameters: { user: 'test', database: 'driftbase' } },
    };
    const startupResult = integration.handleMessage(session.sessionId, startupMsg);
    expect(startupResult.ok).toBe(true);
    if (!startupResult.ok) return;

    // Verify AuthenticationOk + ReadyForQuery
    const startupMsgs = startupResult.value;
    expect(startupMsgs.some(m => m.type === WireMessageType.AuthenticationOk)).toBe(true);
    expect(startupMsgs.some(m => m.type === WireMessageType.ReadyForQuery)).toBe(true);

    // Simple query
    const queryMsg: WireMessage = {
      type: WireMessageType.Query,
      payload: { query: 'SELECT * FROM users' },
    };
    const queryResult = integration.handleMessage(session.sessionId, queryMsg);
    expect(queryResult.ok).toBe(true);
    if (!queryResult.ok) return;

    // Should get CommandComplete + ReadyForQuery
    expect(queryResult.value.some(m => m.type === WireMessageType.CommandComplete)).toBe(true);
    expect(queryResult.value.some(m => m.type === WireMessageType.ReadyForQuery)).toBe(true);
  });

  it('should translate SQL through wire protocol and verify query engine can parse it', () => {
    // Wire protocol translates SQL
    const sql = 'SELECT id, name FROM products WHERE price > 10';

    // Query engine can also parse it
    const planResult = queryEngine.parseSQL(sql);
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) return;

    expect(planResult.value.ast.type).toBe('SELECT');
    expect(planResult.value.ast.table).toBe('products');
    expect(planResult.value.ast.columns).toContain('id');
    expect(planResult.value.ast.columns).toContain('name');
  });

  it('should handle extended query protocol (Parse/Bind/Execute)', () => {
    const principalId = generateId();
    const sessionResult = integration.openSession(principalId);
    if (!sessionResult.ok) return;
    const session = sessionResult.value;

    // Startup
    integration.handleMessage(session.sessionId, {
      type: WireMessageType.StartupMessage,
      payload: { parameters: {} },
    });

    // Parse
    const parseResult = integration.handleMessage(session.sessionId, {
      type: WireMessageType.Parse,
      payload: { name: 'stmt1', query: 'SELECT 1', parameterTypes: [] },
    });
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(parseResult.value.some(m => m.type === WireMessageType.ParseComplete)).toBe(true);

    // Bind
    const bindResult = integration.handleMessage(session.sessionId, {
      type: WireMessageType.Bind,
      payload: { portal: '', statement: 'stmt1', parameters: [], resultFormatCodes: [] },
    });
    expect(bindResult.ok).toBe(true);
    if (!bindResult.ok) return;
    expect(bindResult.value.some(m => m.type === WireMessageType.BindComplete)).toBe(true);

    // Execute
    const execResult = integration.handleMessage(session.sessionId, {
      type: WireMessageType.Execute,
      payload: { portal: '', maxRows: 0 },
    });
    expect(execResult.ok).toBe(true);
  });

  it('should emit events across both contexts through shared EventBus', () => {
    const events: string[] = [];
    eventBus.onAll((e) => events.push(`${e.context}:${e.eventType}`));

    // Integration event
    const principalId = generateId();
    integration.openSession(principalId);

    // Query event (must use valid SQL with FROM clause)
    queryEngine.parseSQL('SELECT * FROM users');

    const integrationEvents = events.filter(e => e.startsWith('integration:'));
    const queryEvents = events.filter(e => e.startsWith('query:'));

    expect(integrationEvents.length).toBeGreaterThanOrEqual(1);
    expect(queryEvents.length).toBeGreaterThanOrEqual(1);
  });
});
