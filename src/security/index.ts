/**
 * VibeCast Security Bounded Context
 * Claims-based access control, authentication, and audit logging per ADR-006
 */
import { UUID, generateId, Result, ok, err } from '../common/types.js';
import {
  BoundedContext, createEvent, EventBus,
  PrincipalAuthenticatedPayload, ClaimsIssuedPayload,
  AccessDeniedPayload, AuditRecordedPayload,
} from '../common/events.js';

// ─── Enums ─────────────────────────────────────────────────

export enum PrincipalType {
  User = 'user', Service = 'service', Module = 'module', System = 'system',
}

export enum PrincipalState {
  Active = 'active', Suspended = 'suspended', Revoked = 'revoked',
}

export enum CredentialType {
  PasswordHash = 'password_hash', APIKeyHash = 'api_key_hash', ModuleHash = 'module_hash',
}

export enum Operation {
  Read = 'read', Write = 'write', Delete = 'delete', Admin = 'admin',
}

const HMAC_SECRET = 'vibecast-security-hmac-key';
const TOKEN_VERSION = 1;

// ─── Interfaces ────────────────────────────────────────────

export interface Credentials {
  type: CredentialType;
  hash: string;
  salt: string;
  createdAt: number;
}

export interface TablePermission { table: string; operations: Operation[] }
export interface VectorIndexPermission { index: string; operations: Operation[] }
export interface ReducerPermission { reducer: string; operations: Operation[] }

export interface RowLevelPredicate {
  table: string;
  predicate: (row: Record<string, unknown>) => boolean;
}

export interface ClaimsSetData {
  claimsSetId: UUID;
  principalId: UUID;
  database: string;
  tablePermissions: TablePermission[];
  vectorIndexPermissions: VectorIndexPermission[];
  reducerPermissions: ReducerPermission[];
  rowPredicates: RowLevelPredicate[];
  issuedAt: number;
  expiresAt: number;
}

export interface AuditEntry {
  entryId: UUID;
  principalId: UUID;
  action: string;
  resource: string;
  operation: string;
  outcome: 'allowed' | 'denied';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TokenPayload {
  version: number;
  claimsSetId: UUID;
  principalId: UUID;
  database: string;
  tablePermissions: TablePermission[];
  vectorIndexPermissions: VectorIndexPermission[];
  reducerPermissions: ReducerPermission[];
  issuedAt: number;
  expiresAt: number;
}

export interface SignedToken { payload: string; signature: string }

// ─── HMAC Utilities ────────────────────────────────────────

function simpleHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function hmacSign(data: string, secret: string): string {
  return simpleHash(secret + ':outer:' + simpleHash(secret + ':inner:' + data));
}

function hashCredential(raw: string, salt: string): string {
  return hmacSign(salt + ':' + raw, HMAC_SECRET);
}

// ─── ClaimsSet Value Object ────────────────────────────────

export class ClaimsSet {
  readonly claimsSetId: UUID;
  readonly principalId: UUID;
  readonly database: string;
  readonly tablePermissions: ReadonlyArray<TablePermission>;
  readonly vectorIndexPermissions: ReadonlyArray<VectorIndexPermission>;
  readonly reducerPermissions: ReadonlyArray<ReducerPermission>;
  readonly rowPredicates: ReadonlyArray<RowLevelPredicate>;
  readonly issuedAt: number;
  readonly expiresAt: number;

  constructor(data: ClaimsSetData) {
    this.claimsSetId = data.claimsSetId;
    this.principalId = data.principalId;
    this.database = data.database;
    this.tablePermissions = Object.freeze([...data.tablePermissions]);
    this.vectorIndexPermissions = Object.freeze([...data.vectorIndexPermissions]);
    this.reducerPermissions = Object.freeze([...data.reducerPermissions]);
    this.rowPredicates = Object.freeze([...data.rowPredicates]);
    this.issuedAt = data.issuedAt;
    this.expiresAt = data.expiresAt;
  }

  isExpired(): boolean { return Date.now() > this.expiresAt; }

  canAccess(table: string, operation: Operation): boolean {
    if (this.isExpired()) return false;
    return this.tablePermissions.some(
      (p) => p.table === table && p.operations.includes(operation),
    );
  }

  canAccessIndex(index: string, operation: Operation): boolean {
    if (this.isExpired()) return false;
    return this.vectorIndexPermissions.some(
      (p) => p.index === index && p.operations.includes(operation),
    );
  }

  canAccessReducer(reducer: string, operation: Operation): boolean {
    if (this.isExpired()) return false;
    return this.reducerPermissions.some(
      (p) => p.reducer === reducer && p.operations.includes(operation),
    );
  }

  getRowPredicate(table: string): ((row: Record<string, unknown>) => boolean) | null {
    const entry = this.rowPredicates.find((p) => p.table === table);
    return entry?.predicate ?? null;
  }
}

// ─── Principal Aggregate Root ──────────────────────────────

export class Principal {
  readonly principalId: UUID;
  readonly type: PrincipalType;
  private _state: PrincipalState;
  private _credentials: Credentials;
  private _claimsSets: Map<UUID, ClaimsSet> = new Map();
  private _auditTrail: AuditEntry[] = [];

  constructor(
    principalId: UUID, type: PrincipalType,
    credentials: Credentials, state: PrincipalState = PrincipalState.Active,
  ) {
    this.principalId = principalId;
    this.type = type;
    this._state = state;
    this._credentials = credentials;
  }

  get state(): PrincipalState { return this._state; }
  get credentials(): Credentials { return this._credentials; }
  get claimsSets(): ReadonlyMap<UUID, ClaimsSet> { return this._claimsSets; }
  get auditTrail(): ReadonlyArray<AuditEntry> { return this._auditTrail; }

  addClaimsSet(claims: ClaimsSet): void { this._claimsSets.set(claims.claimsSetId, claims); }
  removeClaimsSet(id: UUID): boolean { return this._claimsSets.delete(id); }
  addAuditEntry(entry: AuditEntry): void { this._auditTrail.push(entry); }

  suspend(): Result<void> {
    if (this._state === PrincipalState.Revoked) {
      return err(new Error('Cannot suspend a revoked principal'));
    }
    this._state = PrincipalState.Suspended;
    return ok(undefined);
  }

  revoke(): Result<void> {
    this._state = PrincipalState.Revoked;
    this._claimsSets.clear();
    return ok(undefined);
  }

  reactivate(): Result<void> {
    if (this._state === PrincipalState.Revoked) {
      return err(new Error('Cannot reactivate a revoked principal'));
    }
    this._state = PrincipalState.Active;
    return ok(undefined);
  }

  verifyCredential(raw: string): boolean {
    return hashCredential(raw, this._credentials.salt) === this._credentials.hash;
  }

  getActiveClaimsSets(): ClaimsSet[] {
    return Array.from(this._claimsSets.values()).filter((c) => !c.isExpired());
  }
}

// ─── Token Encoding / Decoding ─────────────────────────────

function encodeBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function decodeBase64(b64: string): string {
  return Buffer.from(b64, 'base64url').toString('utf-8');
}

function createToken(claims: ClaimsSet): string {
  const payload: TokenPayload = {
    version: TOKEN_VERSION,
    claimsSetId: claims.claimsSetId,
    principalId: claims.principalId,
    database: claims.database,
    tablePermissions: claims.tablePermissions as TablePermission[],
    vectorIndexPermissions: claims.vectorIndexPermissions as VectorIndexPermission[],
    reducerPermissions: claims.reducerPermissions as ReducerPermission[],
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
  };
  const payloadStr = encodeBase64(JSON.stringify(payload));
  const signature = hmacSign(payloadStr, HMAC_SECRET);
  return encodeBase64(JSON.stringify({ payload: payloadStr, signature }));
}

function decodeToken(token: string): Result<TokenPayload> {
  try {
    const outer = JSON.parse(decodeBase64(token)) as SignedToken;
    const expectedSig = hmacSign(outer.payload, HMAC_SECRET);
    if (outer.signature !== expectedSig) return err(new Error('Invalid token signature'));
    const payload = JSON.parse(decodeBase64(outer.payload)) as TokenPayload;
    if (payload.version !== TOKEN_VERSION) {
      return err(new Error(`Unsupported token version: ${payload.version}`));
    }
    if (Date.now() > payload.expiresAt) return err(new Error('Token has expired'));
    return ok(payload);
  } catch (e) {
    return err(new Error(`Token decode failed: ${(e as Error).message}`));
  }
}

// ─── Credential Type Mapping ───────────────────────────────

function credentialTypeForPrincipal(type: PrincipalType): CredentialType {
  switch (type) {
    case PrincipalType.User: return CredentialType.PasswordHash;
    case PrincipalType.Service: return CredentialType.APIKeyHash;
    case PrincipalType.Module: return CredentialType.ModuleHash;
    case PrincipalType.System: return CredentialType.APIKeyHash;
  }
}

// ─── SecurityEngine Service ────────────────────────────────

export interface SecurityEngineOptions {
  defaultTokenTTLMs?: number;
  maxAuditEntries?: number;
}

export class SecurityEngine {
  private principals: Map<UUID, Principal> = new Map();
  private eventBus: EventBus;
  private defaultTokenTTLMs: number;

  constructor(eventBus: EventBus, options: SecurityEngineOptions = {}) {
    this.eventBus = eventBus;
    this.defaultTokenTTLMs = options.defaultTokenTTLMs ?? 3_600_000;
  }

  createPrincipal(type: PrincipalType, rawCredential: string): Result<Principal> {
    const principalId = generateId();
    const salt = generateId();
    const hash = hashCredential(rawCredential, salt);
    const credentials: Credentials = {
      type: credentialTypeForPrincipal(type), hash, salt, createdAt: Date.now(),
    };
    const principal = new Principal(principalId, type, credentials);
    this.principals.set(principalId, principal);
    this.recordAudit(principalId, 'principal.created', 'principal', 'write', 'allowed');
    return ok(principal);
  }

  authenticate(rawCredential: string): Result<Principal> {
    const entries = Array.from(this.principals.values());
    for (const principal of entries) {
      if (principal.state !== PrincipalState.Active) continue;
      if (principal.verifyCredential(rawCredential)) {
        this.emitSecurityEvent('PrincipalAuthenticated', {
          principalId: principal.principalId, method: principal.credentials.type,
        } satisfies PrincipalAuthenticatedPayload);
        this.recordAudit(
          principal.principalId, 'principal.authenticated', 'principal', 'read', 'allowed',
        );
        return ok(principal);
      }
    }
    return err(new Error('Authentication failed: invalid credentials'));
  }

  issueClaims(
    principalId: UUID,
    permissions: {
      database: string;
      tablePermissions?: TablePermission[];
      vectorIndexPermissions?: VectorIndexPermission[];
      reducerPermissions?: ReducerPermission[];
      rowPredicates?: RowLevelPredicate[];
      ttlMs?: number;
    },
  ): Result<{ claimsSet: ClaimsSet; token: string }> {
    const principal = this.principals.get(principalId);
    if (!principal) return err(new Error(`Principal not found: ${principalId}`));
    if (principal.state !== PrincipalState.Active) {
      return err(new Error(`Principal is ${principal.state}, cannot issue claims`));
    }
    const now = Date.now();
    const ttl = permissions.ttlMs ?? this.defaultTokenTTLMs;
    const claimsSetId = generateId();
    const claimsSet = new ClaimsSet({
      claimsSetId, principalId, database: permissions.database,
      tablePermissions: permissions.tablePermissions ?? [],
      vectorIndexPermissions: permissions.vectorIndexPermissions ?? [],
      reducerPermissions: permissions.reducerPermissions ?? [],
      rowPredicates: permissions.rowPredicates ?? [],
      issuedAt: now, expiresAt: now + ttl,
    });
    principal.addClaimsSet(claimsSet);
    const token = createToken(claimsSet);
    this.emitSecurityEvent('ClaimsIssued', {
      principalId, claimsSetId,
    } satisfies ClaimsIssuedPayload);
    this.recordAudit(principalId, 'claims.issued', 'claims', 'write', 'allowed');
    return ok({ claimsSet, token });
  }

  validateClaims(token: string): Result<ClaimsSet> {
    const decoded = decodeToken(token);
    if (!decoded.ok) return decoded as Result<ClaimsSet>;
    const payload = decoded.value;
    const principal = this.principals.get(payload.principalId);
    if (!principal) return err(new Error('Principal not found for token'));
    if (principal.state !== PrincipalState.Active) {
      return err(new Error(`Principal is ${principal.state}`));
    }
    const existing = principal.claimsSets.get(payload.claimsSetId);
    if (existing && !existing.isExpired()) return ok(existing);
    // Reconstruct from token payload if claims evicted from memory
    return ok(new ClaimsSet({
      claimsSetId: payload.claimsSetId, principalId: payload.principalId,
      database: payload.database, tablePermissions: payload.tablePermissions,
      vectorIndexPermissions: payload.vectorIndexPermissions,
      reducerPermissions: payload.reducerPermissions,
      rowPredicates: [], issuedAt: payload.issuedAt, expiresAt: payload.expiresAt,
    }));
  }

  authorize(principalId: UUID, resource: string, operation: Operation): boolean {
    const principal = this.principals.get(principalId);
    if (!principal || principal.state !== PrincipalState.Active) {
      this.emitSecurityEvent('AccessDenied', {
        principalId, resource, operation,
      } satisfies AccessDeniedPayload);
      this.recordAudit(principalId, 'access.check', resource, operation, 'denied');
      return false;
    }
    const allowed = principal.getActiveClaimsSets().some(
      (c) => c.canAccess(resource, operation),
    );
    if (!allowed) {
      this.emitSecurityEvent('AccessDenied', {
        principalId, resource, operation,
      } satisfies AccessDeniedPayload);
    }
    this.recordAudit(principalId, 'access.check', resource, operation,
      allowed ? 'allowed' : 'denied');
    return allowed;
  }

  suspendPrincipal(principalId: UUID): Result<void> {
    const principal = this.principals.get(principalId);
    if (!principal) return err(new Error(`Principal not found: ${principalId}`));
    const result = principal.suspend();
    if (result.ok) this.recordAudit(principalId, 'principal.suspended', 'principal', 'admin', 'allowed');
    return result;
  }

  revokePrincipal(principalId: UUID): Result<void> {
    const principal = this.principals.get(principalId);
    if (!principal) return err(new Error(`Principal not found: ${principalId}`));
    const result = principal.revoke();
    if (result.ok) this.recordAudit(principalId, 'principal.revoked', 'principal', 'admin', 'allowed');
    return result;
  }

  getPrincipal(principalId: UUID): Principal | undefined {
    return this.principals.get(principalId);
  }

  getAuditTrail(principalId: UUID): AuditEntry[] {
    const principal = this.principals.get(principalId);
    if (!principal) return [];
    return [...principal.auditTrail];
  }

  private recordAudit(
    principalId: UUID, action: string, resource: string,
    operation: string, outcome: 'allowed' | 'denied',
    metadata?: Record<string, unknown>,
  ): void {
    const entry: AuditEntry = {
      entryId: generateId(), principalId, action, resource,
      operation, outcome, timestamp: Date.now(), metadata,
    };
    const principal = this.principals.get(principalId);
    if (principal) principal.addAuditEntry(entry);
    this.emitSecurityEvent('AuditRecorded', {
      principalId, action,
    } satisfies AuditRecordedPayload);
  }

  private emitSecurityEvent(eventType: string, payload: unknown): void {
    const event = createEvent(eventType, BoundedContext.Security, payload);
    this.eventBus.emit(event).catch(() => {});
  }
}
