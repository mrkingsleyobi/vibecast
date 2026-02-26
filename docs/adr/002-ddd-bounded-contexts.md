# ADR-002: DDD Bounded Contexts

## Status

Accepted

## Date

2026-02-26

## Context

The SpacetimeDB × ruvector fusion combines real-time transactional processing, vector search, consensus, replication, ML inference, and client subscription management. Without rigorous domain decomposition, this becomes an unmaintainable monolith. Domain-Driven Design provides the discipline to isolate concerns while maintaining a cohesive ubiquitous language.

## Decision

Decompose the fusion engine into **8 bounded contexts** organized across 3 tiers: Core, Supporting, and Generic.

### Bounded Context Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CORE DOMAINS                                      │
│                                                                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  STORAGE         │  │  QUERY ENGINE    │  │  SUBSCRIPTION          │  │
│  │                  │  │                  │  │                        │  │
│  │  Arrow Tables    │◄─┤  SQL Parser      │  │  Client Connections    │  │
│  │  WAL             │  │  Query Planner   ├─►│  Delta Computation     │  │
│  │  Compaction      │  │  Vector Search   │  │  Push Protocol         │  │
│  │  Snapshots       │  │  Hybrid Queries  │  │  Backpressure          │  │
│  │  MVCC            │  │  Full-Text (Tan) │  │  Session State         │  │
│  └────────┬─────────┘  └───────┬──────────┘  └───────────┬────────────┘  │
│           │                    │                          │               │
│           └────────────────────┼──────────────────────────┘               │
│                                │                                          │
├────────────────────────────────┼──────────────────────────────────────────┤
│                     SUPPORTING DOMAINS                                    │
│                                │                                          │
│  ┌─────────────────┐  ┌───────┴──────────┐  ┌────────────────────────┐  │
│  │  RUNTIME         │  │  CONSENSUS       │  │  INTELLIGENCE          │  │
│  │                  │  │                  │  │                        │  │
│  │  WASM Sandbox    │  │  Raft Leader     │  │  GNN Enhancement       │  │
│  │  Reducer Exec    │  │  Log Replication │  │  ONNX Inference        │  │
│  │  Resource Limits │  │  CRDT Sync       │  │  Embedding Pipeline    │  │
│  │  Module Registry │  │  Conflict Resol. │  │  Model Registry        │  │
│  │  AOT Compilation │  │  Membership      │  │  Self-Learning Loop    │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                      GENERIC DOMAINS                                      │
│                                                                          │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  SECURITY                    │  │  INTEGRATION                     │  │
│  │                              │  │                                  │  │
│  │  AuthN/AuthZ                 │  │  PostgreSQL Wire Protocol        │  │
│  │  Claims-Based Access         │  │  napi-rs Node.js Bindings        │  │
│  │  TLS/mTLS                    │  │  REST/gRPC Gateway               │  │
│  │  Audit Logging               │  │  SDK Generation                  │  │
│  │  Secret Management           │  │  Migration Tools                 │  │
│  └─────────────────────────────┘  └──────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Context Relationships

| Upstream | Downstream | Relationship | Pattern |
|----------|-----------|--------------|---------|
| Storage | Query Engine | Conformist | Query Engine conforms to Storage's Arrow schema |
| Query Engine | Subscription | Customer-Supplier | Subscription consumes query deltas |
| Consensus | Storage | Partnership | Co-evolve WAL and Raft log |
| Runtime | Query Engine | Anti-Corruption Layer | WASM reducer results translated to query types |
| Intelligence | Query Engine | Open Host Service | Vector search exposed as a published API |
| Security | All Contexts | Shared Kernel | Auth primitives shared across all contexts |
| Integration | Query Engine + Storage | Anti-Corruption Layer | Wire protocol translates external SQL to internal types |

### Aggregate Roots per Context

| Context | Aggregate Root(s) | Invariants |
|---------|-------------------|------------|
| Storage | `Table`, `WALSegment` | Schema immutability within segment, MVCC version ordering |
| Query Engine | `QueryPlan`, `VectorIndex` | Plan validity, index consistency |
| Subscription | `ClientSession`, `SubscriptionSet` | Session uniqueness, subscription lifecycle |
| Runtime | `WasmModule`, `ReducerInvocation` | Module integrity, resource limits |
| Consensus | `RaftNode`, `CRDTDocument` | Leader election invariants, CRDT merge commutativity |
| Intelligence | `EmbeddingModel`, `LearningEpoch` | Model versioning, training data provenance |
| Security | `Principal`, `ClaimsSet` | Credential validity, authorization policies |
| Integration | `WireSession`, `ProtocolAdapter` | Protocol state machine, backward compat |

### Domain Events

```
Storage:        TableCreated, RowInserted, RowUpdated, RowDeleted, SnapshotCreated, WALTruncated
Query:          QueryParsed, PlanOptimized, VectorSearchExecuted, HybridResultsMerged
Subscription:   ClientConnected, SubscriptionCreated, DeltaComputed, DeltaPushed, ClientDisconnected
Runtime:        ModuleLoaded, ReducerInvoked, ReducerCompleted, ResourceLimitExceeded
Consensus:      LeaderElected, LogAppended, SnapshotInstalled, MemberJoined, MemberLeft, CRDTMerged
Intelligence:   EmbeddingGenerated, ModelUpdated, GNNEnhanced, LearningEpochCompleted
Security:       PrincipalAuthenticated, ClaimsIssued, AccessDenied, AuditRecorded
Integration:    WireSessionOpened, QueryTranslated, ResultSerialized, WireSessionClosed
```

## Consequences

### Positive
- Each context can evolve independently with its own ubiquitous language
- Anti-corruption layers protect core domains from external protocol changes
- Clear ownership boundaries for swarm agent assignment (1 agent per context)
- Domain events enable loose coupling and event sourcing

### Negative
- 8 contexts requires careful coordination at integration points
- Shared Kernel (Security) creates coupling that must be carefully managed
- Event bus introduces eventual consistency between contexts
- Higher initial complexity before first working prototype

## Related ADRs
- ADR-001: Fusion Architecture Foundation
- ADR-006: Security-First Architecture (Shared Kernel details)
- ADR-008: Arrow-Native Storage Engine (Storage context internals)
