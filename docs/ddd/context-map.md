# Context Map — SpacetimeDB × ruvector Fusion

## Visual Context Map

```
                                    ┌─────────────────────────────────────┐
                                    │          SECURITY (SK)               │
                                    │  Principal · ClaimsSet · AuditLog   │
                                    │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
                                    │  Shared Kernel: ALL contexts import  │
                                    │  auth primitives from Security       │
                                    └─────────────┬───────────────────────┘
                                                  │ SK
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
          ┌─────────▼─────────┐         ┌────────▼────────┐         ┌─────────▼─────────┐
          │     STORAGE        │         │  QUERY ENGINE    │         │   SUBSCRIPTION     │
          │                    │ CF      │                  │ CS      │                    │
          │  Table             ├────────►│  QueryPlan       ├────────►│  ClientSession     │
          │  WALSegment        │         │  VectorIndex     │         │  Delta             │
          │  RecordBatch       │         │  HybridResult    │         │  Backpressure      │
          │                    │         │                  │         │                    │
          └────────┬───────────┘         └───────┬──┬──────┘         └────────────────────┘
                   │ P                           │  │
          ┌────────▼───────────┐                 │  │ OHS
          │    CONSENSUS        │                 │  │
          │                    │                 │  │
          │  RaftNode          │                 │  │
          │  CRDTDocument      │                 │  │
          │  ClusterMembership │                 │  │
          └────────────────────┘                 │  │
                                                 │  │
          ┌────────────────────┐         ┌───────▼──▼──────┐
          │     RUNTIME         │  ACL    │  INTELLIGENCE    │
          │                    ├────────►│                  │
          │  WasmModule        │         │  EmbeddingModel  │
          │  ReducerInvocation │         │  LearningEpoch   │
          │  ResourceLimits    │         │  GNNWeights      │
          └────────────────────┘         │  SONAAdapter     │
                                         └─────────────────┘
          ┌────────────────────┐
          │   INTEGRATION       │  ACL
          │                    ├──────── (to Query Engine)
          │  WireSession       │
          │  ProtocolAdapter   │
          │  TypeOIDMapping    │
          └────────────────────┘

Legend:
  SK  = Shared Kernel       (Security exports auth primitives to all)
  CF  = Conformist           (Query Engine conforms to Storage's Arrow schema)
  CS  = Customer-Supplier    (Subscription consumes Query Engine's deltas)
  P   = Partnership          (Consensus and Storage co-evolve WAL/Raft log)
  ACL = Anti-Corruption Layer (Runtime/Integration translate external to internal)
  OHS = Open Host Service    (Intelligence publishes vector search API)
```

## Relationship Details

### Shared Kernel: Security → All Contexts

```
Shared Types:
  - PrincipalId (UUID)
  - ClaimsSet (permissions bundle)
  - SecurityContext (thread-local auth state)
  - AuditEntry (structured audit event)

Rules:
  - Security owns these types; other contexts import read-only
  - Changes to shared types require ADR vote (majority of agents)
  - Version pinning: each context pins a Security version
  - Breaking changes: minimum 2-sprint deprecation window
```

### Conformist: Storage → Query Engine

```
Query Engine conforms to Storage's Arrow schema representation.
No translation layer — Query Engine speaks Arrow natively.

Contract:
  - Storage defines ArrowSchema, RecordBatch formats
  - Query Engine reads these formats directly
  - Query Engine may NOT modify Storage internals
  - Schema changes in Storage must be backward-compatible for 1 version
```

### Customer-Supplier: Query Engine → Subscription

```
Query Engine supplies delta-computation capabilities.
Subscription is the customer with requirements.

Contract:
  - Subscription requests: "notify me when results of plan P change"
  - Query Engine provides: incremental re-evaluation API
  - SLA: delta computation ≤10ms for single-row changes
  - Subscription may request priority for specific query patterns
```

### Partnership: Storage ↔ Consensus

```
Storage and Consensus co-evolve to maintain WAL/Raft log alignment.

Contract:
  - WAL entries are Raft log entries (same physical log)
  - Storage owns the format; Consensus owns the replication
  - Both teams must agree on log entry schema changes
  - Joint testing: WAL corruption recovery + Raft log replay
```

### Anti-Corruption Layers

```
Runtime → Query Engine:
  - WasmValue → ArrowValue translation
  - Host function results → RecordBatch conversion
  - Type validation at boundary

Integration → Query Engine:
  - PostgreSQL AST → Internal AST translation
  - PG type OIDs → Arrow types mapping
  - Error codes: Internal errors → PG error codes
  - SQL dialect differences handled in ACL

Both ACLs:
  - Owned by downstream context (Query Engine)
  - Tested independently (contract tests)
  - May reject invalid translations (fail-safe)
```

### Open Host Service: Intelligence

```
Intelligence publishes a vector search API that Query Engine consumes.

Published API:
  - search(index, query_vec, k) → Vec<SearchResult>
  - search_filtered(index, query_vec, k, predicate) → Vec<SearchResult>
  - enhance(results) → Vec<SearchResult>  (GNN enhancement)
  - embed(model, input) → Vec<f32>

Service guarantees:
  - Backward compatible for 3 versions
  - Versioned API (v1, v2, ...)
  - Deprecation: 90-day notice before removal
  - Fallback: disable GNN enhancement without breaking search
```

## Team Topology (maps to Swarm Agents)

| Bounded Context | Agent(s) | Team Type |
|----------------|----------|-----------|
| Storage | A1 (Storage Architect) | Stream-aligned |
| Query Engine | A2 (Query Engine Dev) | Stream-aligned |
| Subscription | A3 (Subscription Dev) | Stream-aligned |
| Integration | A4 (Wire Protocol Dev) | Stream-aligned |
| Runtime | A5 (Runtime Engineer) | Platform |
| Consensus | A6 (Consensus Engineer) | Platform |
| Intelligence | A7 (ML/Intelligence Dev) | Enabling |
| Security | A8 (Security Architect) | Enabling |

Cross-cutting agents (A9-A14) operate as an **enabling team** that supports all stream-aligned teams.
