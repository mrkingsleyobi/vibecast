/**
 * Integration Test: Security as Shared Kernel
 * ADR-002 Relationship: Security → All Contexts (Shared Kernel)
 * Auth primitives shared across all contexts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { ArrowSchema, ArrowDataType, generateId } from '../../src/common/types.js';
import {
  SecurityEngine, PrincipalType, Operation,
} from '../../src/security/index.js';
import { StorageEngine } from '../../src/storage/index.js';
import { QueryEngine } from '../../src/query/index.js';
import { IntegrationEngine, WireMessageType } from '../../src/integration/index.js';
import { SubscriptionEngine } from '../../src/subscription/index.js';

describe('Security Shared Kernel Integration', () => {
  let eventBus: EventBus;
  let security: SecurityEngine;

  const schema: ArrowSchema = {
    columns: [
      { name: 'data', dataType: ArrowDataType.Utf8, nullable: false },
    ],
    version: 1,
  };

  beforeEach(() => {
    eventBus = new EventBus();
    security = new SecurityEngine(eventBus);
  });

  it('should authenticate principal and authorize storage access', async () => {
    // Create principal
    const createResult = security.createPrincipal(PrincipalType.User, 'secret-password');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const principal = createResult.value;

    // Authenticate
    const authResult = security.authenticate('secret-password');
    expect(authResult.ok).toBe(true);

    // Issue claims for storage access
    const claimsResult = security.issueClaims(principal.principalId, {
      database: 'driftbase',
      tablePermissions: [
        { table: 'users', operations: [Operation.Read, Operation.Write] },
      ],
    });
    expect(claimsResult.ok).toBe(true);
    if (!claimsResult.ok) return;

    // Authorize storage operations
    expect(security.authorize(principal.principalId, 'users', Operation.Read)).toBe(true);
    expect(security.authorize(principal.principalId, 'users', Operation.Write)).toBe(true);
    expect(security.authorize(principal.principalId, 'users', Operation.Admin)).toBe(false);
    expect(security.authorize(principal.principalId, 'secrets', Operation.Read)).toBe(false);
  });

  it('should validate claims token for cross-context authorization', () => {
    const createResult = security.createPrincipal(PrincipalType.Service, 'svc-key');
    if (!createResult.ok) return;
    const principal = createResult.value;

    const claimsResult = security.issueClaims(principal.principalId, {
      database: 'driftbase',
      tablePermissions: [
        { table: '*', operations: [Operation.Read] },
      ],
      vectorIndexPermissions: [
        { index: 'embeddings', operations: [Operation.Read] },
      ],
    });
    expect(claimsResult.ok).toBe(true);
    if (!claimsResult.ok) return;

    // Validate the token (simulating cross-context token passing)
    const validateResult = security.validateClaims(claimsResult.value.token);
    expect(validateResult.ok).toBe(true);
    if (!validateResult.ok) return;

    const claims = validateResult.value;
    expect(claims.canAccess('*', Operation.Read)).toBe(true);
    expect(claims.canAccessIndex('embeddings', Operation.Read)).toBe(true);
  });

  it('should enforce authorization with wire protocol sessions', () => {
    const createResult = security.createPrincipal(PrincipalType.User, 'wire-user');
    if (!createResult.ok) return;
    const principal = createResult.value;

    // Open wire protocol session using principal ID
    const integration = new IntegrationEngine(eventBus);
    const sessionResult = integration.openSession(principal.principalId);
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;

    // Verify the session is associated with the principal
    expect(sessionResult.value.principalId).toBe(principal.principalId);

    // Without claims, authorization should fail
    expect(security.authorize(principal.principalId, 'users', Operation.Read)).toBe(false);

    // Issue claims and retry
    security.issueClaims(principal.principalId, {
      database: 'driftbase',
      tablePermissions: [{ table: 'users', operations: [Operation.Read] }],
    });
    expect(security.authorize(principal.principalId, 'users', Operation.Read)).toBe(true);
  });

  it('should record audit trail across all operations', () => {
    const createResult = security.createPrincipal(PrincipalType.User, 'audit-user');
    if (!createResult.ok) return;
    const principal = createResult.value;

    security.authenticate('audit-user');
    security.issueClaims(principal.principalId, {
      database: 'driftbase',
      tablePermissions: [{ table: 'data', operations: [Operation.Read] }],
    });
    security.authorize(principal.principalId, 'data', Operation.Read);
    security.authorize(principal.principalId, 'data', Operation.Write);

    const audit = security.getAuditTrail(principal.principalId);
    expect(audit.length).toBeGreaterThanOrEqual(4);

    const outcomes = audit.map(e => e.outcome);
    expect(outcomes).toContain('allowed');
    expect(outcomes).toContain('denied');
  });

  it('should emit security events through shared EventBus', () => {
    const events: string[] = [];
    eventBus.onAll((e) => events.push(`${e.context}:${e.eventType}`));

    const createResult = security.createPrincipal(PrincipalType.User, 'events-user');
    if (!createResult.ok) return;
    const principal = createResult.value;

    security.authenticate('events-user');
    security.authorize(principal.principalId, 'data', Operation.Read);

    const securityEvents = events.filter(e => e.startsWith('security:'));
    expect(securityEvents.length).toBeGreaterThanOrEqual(2);
    expect(securityEvents.some(e => e.includes('PrincipalAuthenticated'))).toBe(true);
  });

  it('should suspend principal and deny access across all contexts', () => {
    const createResult = security.createPrincipal(PrincipalType.User, 'suspend-me');
    if (!createResult.ok) return;
    const principal = createResult.value;

    security.issueClaims(principal.principalId, {
      database: 'driftbase',
      tablePermissions: [{ table: 'data', operations: [Operation.Read] }],
    });

    expect(security.authorize(principal.principalId, 'data', Operation.Read)).toBe(true);

    // Suspend
    security.suspendPrincipal(principal.principalId);

    // Now authorization should fail
    expect(security.authorize(principal.principalId, 'data', Operation.Read)).toBe(false);
  });
});
