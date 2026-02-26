# ADR-010: Licensing & Enterprise Strategy

## Status

Accepted

## Date

2026-02-26

## Context

SpacetimeDB uses BSL 1.1 (converting to AGPL v3 after 4 years). ruvector is MIT licensed. The fusion must choose a license that enables both open-source community growth and sustainable commercial development. The 20-year longevity goal requires a business model that doesn't depend on VC funding cycles.

## Decision

Adopt **AGPL v3 with commercial dual-licensing**, modeled on the MongoDB/Redis/TimescaleDB playbook.

### Licensing Structure

```
┌────────────────────────────────────────────────────┐
│  Open Source (AGPL v3)                              │
│  ├── Full database engine                          │
│  ├── Vector search + HNSW                          │
│  ├── Real-time subscriptions                       │
│  ├── WASM runtime                                  │
│  ├── Raft consensus (3-node)                       │
│  ├── PostgreSQL wire protocol                      │
│  └── Self-learning pipeline                        │
├────────────────────────────────────────────────────┤
│  Enterprise License (Commercial)                    │
│  ├── LDAP/SAML/OIDC authentication                 │
│  ├── Encryption at rest (AES-256-GCM)              │
│  ├── Audit logging with compliance templates       │
│  ├── Multi-region replication (>3 nodes)           │
│  ├── Priority support (SLA-backed)                 │
│  ├── Advanced monitoring dashboard                 │
│  ├── Backup/restore orchestration                  │
│  └── SOC2/HIPAA compliance toolkit                 │
├────────────────────────────────────────────────────┤
│  Cloud Service (Managed)                            │
│  ├── Fully managed database-as-a-service           │
│  ├── Auto-scaling                                  │
│  ├── Point-in-time recovery                        │
│  ├── Global replication                            │
│  └── Usage-based pricing                           │
└────────────────────────────────────────────────────┘
```

### ruvector Integration Licensing

Since ruvector is MIT, all ruvector-derived code can be included in both AGPL and commercial builds without conflict. USearch (Apache 2.0), Tantivy (MIT), OpenRaft (MIT/Apache 2.0) are all compatible.

### Contributor License Agreement

All contributors sign a CLA granting the project dual-licensing rights. This enables the commercial license without requiring contributor permission for each release.

## Consequences

### Positive
- AGPL ensures all improvements to the core are shared back
- Commercial dual-license provides sustainable revenue
- MIT components (ruvector, Tantivy) have no licensing friction
- Cloud service provides highest-margin revenue stream
- 20-year sustainability via multiple revenue streams

### Negative
- AGPL deters some enterprises (must purchase commercial license)
- CLA requirement may slow contributor onboarding
- Must maintain feature parity (open vs. enterprise) carefully
- Cloud service requires significant infrastructure investment

## Related ADRs
- ADR-001: Fusion Architecture Foundation (longevity strategy)
