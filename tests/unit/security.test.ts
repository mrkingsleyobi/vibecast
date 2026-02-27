/**
 * Tests for VibeCast Security Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecurityEngine,
  Principal,
  PrincipalType,
  PrincipalState,
  Operation,
  ClaimsSet,
} from '../../src/security/index.js';
import { EventBus } from '../../src/common/events.js';

describe('Security Engine', () => {
  let engine: SecurityEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new SecurityEngine(eventBus);
  });

  describe('Principal Management', () => {
    it('should create a user principal', () => {
      const result = engine.createPrincipal(PrincipalType.User, 'password123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe(PrincipalType.User);
        expect(result.value.state).toBe(PrincipalState.Active);
      }
    });

    it('should create a service principal', () => {
      const result = engine.createPrincipal(PrincipalType.Service, 'api-key-123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe(PrincipalType.Service);
      }
    });

    it('should authenticate with correct credentials', () => {
      engine.createPrincipal(PrincipalType.User, 'secret');
      const authResult = engine.authenticate('secret');
      expect(authResult.ok).toBe(true);
    });

    it('should reject invalid credentials', () => {
      engine.createPrincipal(PrincipalType.User, 'secret');
      const authResult = engine.authenticate('wrong');
      expect(authResult.ok).toBe(false);
    });

    it('should suspend a principal', () => {
      const createResult = engine.createPrincipal(PrincipalType.User, 'pass');
      if (createResult.ok) {
        const result = engine.suspendPrincipal(createResult.value.principalId);
        expect(result.ok).toBe(true);
        const principal = engine.getPrincipal(createResult.value.principalId);
        expect(principal?.state).toBe(PrincipalState.Suspended);
      }
    });

    it('should revoke a principal', () => {
      const createResult = engine.createPrincipal(PrincipalType.User, 'pass');
      if (createResult.ok) {
        const result = engine.revokePrincipal(createResult.value.principalId);
        expect(result.ok).toBe(true);
        const principal = engine.getPrincipal(createResult.value.principalId);
        expect(principal?.state).toBe(PrincipalState.Revoked);
      }
    });

    it('should not authenticate suspended principal', () => {
      const createResult = engine.createPrincipal(PrincipalType.User, 'pass');
      if (createResult.ok) {
        engine.suspendPrincipal(createResult.value.principalId);
        const authResult = engine.authenticate('pass');
        expect(authResult.ok).toBe(false);
      }
    });
  });

  describe('Claims-Based Authorization', () => {
    let principalId: string;

    beforeEach(() => {
      const result = engine.createPrincipal(PrincipalType.User, 'cred');
      if (result.ok) principalId = result.value.principalId;
    });

    it('should issue claims with token', () => {
      const result = engine.issueClaims(principalId, {
        database: 'testdb',
        tablePermissions: [{ table: 'users', operations: [Operation.Read, Operation.Write] }],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.claimsSet).toBeDefined();
        expect(result.value.token).toBeDefined();
        expect(result.value.token.length).toBeGreaterThan(0);
      }
    });

    it('should validate a token', () => {
      const issueResult = engine.issueClaims(principalId, {
        database: 'testdb',
        tablePermissions: [{ table: 'users', operations: [Operation.Read] }],
      });
      if (issueResult.ok) {
        const validateResult = engine.validateClaims(issueResult.value.token);
        expect(validateResult.ok).toBe(true);
        if (validateResult.ok) {
          expect(validateResult.value.database).toBe('testdb');
        }
      }
    });

    it('should reject invalid tokens', () => {
      const result = engine.validateClaims('invalid-token');
      expect(result.ok).toBe(false);
    });

    it('should authorize access based on claims', () => {
      engine.issueClaims(principalId, {
        database: 'testdb',
        tablePermissions: [{ table: 'users', operations: [Operation.Read] }],
      });

      expect(engine.authorize(principalId, 'users', Operation.Read)).toBe(true);
      expect(engine.authorize(principalId, 'users', Operation.Write)).toBe(false);
      expect(engine.authorize(principalId, 'orders', Operation.Read)).toBe(false);
    });

    it('should deny access for unknown principal', () => {
      expect(engine.authorize('nonexistent', 'users', Operation.Read)).toBe(false);
    });

    it('should deny access for revoked principal', () => {
      engine.issueClaims(principalId, {
        database: 'testdb',
        tablePermissions: [{ table: 'users', operations: [Operation.Read] }],
      });
      engine.revokePrincipal(principalId);
      expect(engine.authorize(principalId, 'users', Operation.Read)).toBe(false);
    });
  });

  describe('Audit Trail', () => {
    it('should record audit entries', () => {
      const result = engine.createPrincipal(PrincipalType.User, 'audit-test');
      if (result.ok) {
        const trail = engine.getAuditTrail(result.value.principalId);
        expect(trail.length).toBeGreaterThan(0);
        expect(trail[0].action).toBe('principal.created');
      }
    });

    it('should record authentication attempts', () => {
      engine.createPrincipal(PrincipalType.User, 'audit-cred');
      engine.authenticate('audit-cred');
      // Find the principal and check audit
      const authResult = engine.authenticate('audit-cred');
      if (authResult.ok) {
        const trail = engine.getAuditTrail(authResult.value.principalId);
        expect(trail.some(e => e.action === 'principal.authenticated')).toBe(true);
      }
    });

    it('should record authorization checks', () => {
      const createResult = engine.createPrincipal(PrincipalType.User, 'auth-test');
      if (createResult.ok) {
        engine.authorize(createResult.value.principalId, 'table1', Operation.Read);
        const trail = engine.getAuditTrail(createResult.value.principalId);
        expect(trail.some(e => e.action === 'access.check')).toBe(true);
      }
    });
  });

  describe('Domain Events', () => {
    it('should emit PrincipalAuthenticated event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      engine.createPrincipal(PrincipalType.User, 'ev-test');
      engine.authenticate('ev-test');
      expect(events).toContain('PrincipalAuthenticated');
    });

    it('should emit ClaimsIssued event', () => {
      const events: string[] = [];
      const createResult = engine.createPrincipal(PrincipalType.User, 'claims-ev');
      eventBus.onAll((e) => events.push(e.eventType));
      if (createResult.ok) {
        engine.issueClaims(createResult.value.principalId, {
          database: 'db', tablePermissions: [],
        });
      }
      expect(events).toContain('ClaimsIssued');
    });

    it('should emit AccessDenied event', () => {
      const events: string[] = [];
      const createResult = engine.createPrincipal(PrincipalType.User, 'deny-ev');
      eventBus.onAll((e) => events.push(e.eventType));
      if (createResult.ok) {
        engine.authorize(createResult.value.principalId, 'restricted', Operation.Admin);
      }
      expect(events).toContain('AccessDenied');
    });
  });
});

describe('ClaimsSet', () => {
  it('should check table access', () => {
    const claims = new ClaimsSet({
      claimsSetId: 'cs1',
      principalId: 'p1',
      database: 'db',
      tablePermissions: [{ table: 'users', operations: [Operation.Read, Operation.Write] }],
      vectorIndexPermissions: [],
      reducerPermissions: [],
      rowPredicates: [],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    expect(claims.canAccess('users', Operation.Read)).toBe(true);
    expect(claims.canAccess('users', Operation.Delete)).toBe(false);
    expect(claims.canAccess('orders', Operation.Read)).toBe(false);
  });

  it('should detect expired claims', () => {
    const claims = new ClaimsSet({
      claimsSetId: 'cs1',
      principalId: 'p1',
      database: 'db',
      tablePermissions: [{ table: 'users', operations: [Operation.Read] }],
      vectorIndexPermissions: [],
      reducerPermissions: [],
      rowPredicates: [],
      issuedAt: Date.now() - 7200000,
      expiresAt: Date.now() - 3600000,
    });

    expect(claims.isExpired()).toBe(true);
    expect(claims.canAccess('users', Operation.Read)).toBe(false);
  });

  it('should check vector index access', () => {
    const claims = new ClaimsSet({
      claimsSetId: 'cs1',
      principalId: 'p1',
      database: 'db',
      tablePermissions: [],
      vectorIndexPermissions: [{ index: 'embedding_idx', operations: [Operation.Read] }],
      reducerPermissions: [],
      rowPredicates: [],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    expect(claims.canAccessIndex('embedding_idx', Operation.Read)).toBe(true);
    expect(claims.canAccessIndex('embedding_idx', Operation.Write)).toBe(false);
  });
});
