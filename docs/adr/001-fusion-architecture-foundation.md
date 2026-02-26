# ADR-001: Fusion Architecture Foundation

## Status

Accepted

## Date

2026-02-26

## Context

SpacetimeDB and ruvector are complementary database systems:

- **SpacetimeDB** merges application server into the database process, runs user logic via Wasmtime/V8, supports ACID-transactional Reducers, real-time SQL subscriptions, and achieves 107,850 TPS on OLTP workloads. However, it is single-node only, has no vector search, and uses BSL 1.1 → AGPL v3 licensing.
- **ruvector** provides HNSW vector indexing with GNN enhancement, 61–72 μs p50 latency for vector search, multi-platform deployment (native, WASM, PostgreSQL extension), and is MIT licensed with 30+ npm packages and 80+ Rust crates.

No existing product offers a distributed, real-time vector database that pushes semantic search results to connected clients. The fusion fills this gap.

## Decision

Build a unified database engine that fuses SpacetimeDB's real-time multiplayer substrate with ruvector's self-learning vector search. The system will be architected as a single-process, multi-domain engine with clear bounded contexts.

### Core Fusion Principles

1. **Single-Process Architecture**: Database + application server + vector engine in one process, eliminating network hops between components
2. **WASM-First User Logic**: All user-defined reducers and queries execute in sandboxed Wasmtime, with V8 as fallback for JS/TS workloads
3. **Real-Time Reactive Vector Search**: Clients subscribe to vector similarity queries and receive push updates when embeddings shift results
4. **ACID + Eventually-Consistent Hybrid**: Strong consistency for transactional writes (Raft), eventual consistency for vector index propagation (CRDT)
5. **Arrow-Native Storage**: Apache Arrow columnar format as the canonical on-disk and in-memory representation for 20-year longevity

### Technology Stack (Ratified)

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Vector Indexing | USearch | Best-in-class HNSW, C++ core with Rust bindings |
| Full-Text Search | Tantivy | Rust-native Lucene alternative, composable |
| Consensus | OpenRaft | Production-grade Raft in Rust |
| CRDT Replication | Yrs + Automerge | Yrs for text/docs, Automerge for structured data |
| WASM Runtime | Wasmtime | AOT compilation, WASI support, security sandbox |
| ML Inference | ort (ONNX Runtime) | Cross-platform model serving |
| Node.js Bindings | napi-rs v3 | Zero-copy Rust→Node bridge |

## Consequences

### Positive
- No existing competitor offers real-time reactive vector search
- Single-process eliminates serialization overhead between query engine and vector index
- WASM sandbox provides security isolation for user code
- Arrow-native storage ensures format longevity and interop with the data ecosystem

### Negative
- Significant engineering complexity combining two paradigms (OLTP + vector)
- Single-process design requires careful memory management
- WASM runtime adds latency vs. native code (~2-10x overhead)
- Must maintain compatibility with both SpacetimeDB and ruvector ecosystems

### Risks
- SpacetimeDB's BSL→AGPL transition may create licensing friction
- Performance regression from fusing two hot paths in one process
- Complexity explosion in the consensus layer (Raft for txn + CRDT for vectors)

## Related ADRs
- ADR-002: DDD Bounded Contexts (domain decomposition)
- ADR-003: Real-Time Reactive Vector Search (subscription model)
- ADR-004: WASM Runtime Strategy (sandboxing)
- ADR-008: Arrow-Native Storage Engine (persistence)
