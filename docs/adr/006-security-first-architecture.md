# ADR-006: Security-First Architecture

## Status

Accepted

## Date

2026-02-26

## Context

The fusion engine runs arbitrary user code (WASM reducers) inside the database process, manages distributed consensus across nodes, and handles real-time client connections. This attack surface is significantly larger than a traditional database. Security must be architectural, not bolted on.

## Decision

Implement a **zero-trust, defense-in-depth security architecture** with claims-based authorization, WASM sandboxing, and continuous threat monitoring.

### Threat Model (STRIDE Analysis)

| Threat | Category | Attack Surface | Mitigation |
|--------|----------|---------------|------------|
| T1: Malicious WASM reducer | Tampering | Runtime Domain | WASM sandbox, resource limits, fuel metering |
| T2: SQL injection via wire protocol | Tampering | Integration Domain | Parameterized queries, AST-level validation |
| T3: Unauthorized vector access | Info Disclosure | Query Domain | Row-level security on vector indices |
| T4: Raft leader impersonation | Spoofing | Consensus Domain | mTLS between nodes, certificate pinning |
| T5: Subscription eavesdropping | Info Disclosure | Subscription Domain | TLS 1.3, per-subscription auth tokens |
| T6: Embedding model poisoning | Tampering | Intelligence Domain | Model signature verification, inference sandboxing |
| T7: Denial of service via expensive queries | DoS | Query Domain | Query cost estimation, timeout, rate limiting |
| T8: Privilege escalation via claims | Elevation | Security Domain | Claims validation, principle of least privilege |
| T9: Side-channel via timing | Info Disclosure | All Domains | Constant-time comparison, query padding |
| T10: Supply chain (dependencies) | Tampering | Build | cargo-audit, lockfile verification, SBOM |

### DREAD Risk Assessment

| Threat | Damage | Reproducibility | Exploitability | Affected Users | Discoverability | Score |
|--------|--------|-----------------|----------------|----------------|-----------------|-------|
| T1 | 9 | 8 | 6 | 10 | 5 | 7.6 |
| T2 | 8 | 9 | 7 | 10 | 8 | 8.4 |
| T3 | 7 | 7 | 5 | 8 | 4 | 6.2 |
| T4 | 10 | 3 | 3 | 10 | 2 | 5.6 |
| T7 | 6 | 9 | 8 | 10 | 9 | 8.4 |

### Security Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Network                                                │
│  ├── TLS 1.3 (all client connections)                           │
│  ├── mTLS (all inter-node communication)                        │
│  ├── Certificate rotation (90-day auto-rotate)                  │
│  └── Rate limiting (per-IP, per-principal, per-query-type)      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Authentication                                         │
│  ├── JWT tokens (RS256, 15-min expiry, refresh rotation)        │
│  ├── API keys (HMAC-SHA256, scoped to database + operations)    │
│  ├── mTLS client certificates (for service-to-service)          │
│  └── Credential storage: Argon2id (memory=64MB, iterations=3)  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Authorization (Claims-Based)                           │
│  ├── Claims: { principal, database, tables[], operations[] }    │
│  ├── Row-Level Security: per-table predicate functions          │
│  ├── Vector Index ACL: read/write/admin per index               │
│  ├── Reducer ACL: invoke permission per module                  │
│  └── Policy engine: OPA-compatible (Rego subset in WASM)        │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: Runtime Isolation                                      │
│  ├── WASM linear memory isolation (per-module)                  │
│  ├── Fuel metering (CPU budget per invocation)                  │
│  ├── Memory ceiling (256MB per module)                          │
│  ├── Syscall allowlist (WASI subset: no network, no filesystem) │
│  └── Host function audit logging (all cross-boundary calls)     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: Data Protection                                        │
│  ├── Encryption at rest: AES-256-GCM (per-table keys)          │
│  ├── Encryption in transit: TLS 1.3 (all paths)                │
│  ├── Key management: Envelope encryption with KMS integration   │
│  ├── PII detection: Automated scanning of stored embeddings     │
│  └── Audit log: Append-only, signed, tamper-evident             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 6: Continuous Monitoring                                  │
│  ├── Anomaly detection on query patterns                        │
│  ├── WASM reducer behavior profiling                            │
│  ├── Raft protocol integrity monitoring                         │
│  ├── CVE scanning (cargo-audit, npm audit)                      │
│  └── Security score dashboard (target: 90/100)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Input Validation Strategy

```
All Boundaries:
  → Zod schemas for all external inputs (wire protocol, REST, gRPC)
  → Path sanitization (no traversal: ../../)
  → SQL AST validation (no dynamic string concatenation)
  → Embedding dimension validation (match index schema)
  → Payload size limits (configurable per endpoint)

WASM Boundary:
  → Type checking at host function interface
  → Pointer validation for shared memory regions
  → Return value sanitization before propagation
```

## Consequences

### Positive
- Zero-trust model means every operation is authenticated and authorized
- WASM sandbox prevents user code from escaping to host
- Claims-based auth enables fine-grained, composable permissions
- Continuous monitoring catches novel attack patterns

### Negative
- Performance overhead from encryption, auth checks, and audit logging
- Claims validation on every query adds latency (~0.1-0.5ms)
- Key management complexity (rotation, distribution, revocation)
- Security monitoring generates significant log volume

## Related ADRs
- ADR-001: Fusion Architecture Foundation
- ADR-002: DDD Bounded Contexts (Security as Shared Kernel)
- ADR-004: WASM Runtime Strategy (sandbox details)
