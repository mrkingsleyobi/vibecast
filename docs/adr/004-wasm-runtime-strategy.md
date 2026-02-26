# ADR-004: WASM Runtime Strategy

## Status

Accepted

## Date

2026-02-26

## Context

SpacetimeDB executes user-defined logic (Reducers) inside the database process via WASM. This is the key architectural feature that eliminates the application server as a separate tier. We must decide how to extend this model to support vector operations, ML inference, and custom similarity functions while maintaining security isolation.

## Decision

Use **Wasmtime** as the primary WASM runtime with AOT compilation, WASI preview 2 support, and a custom host interface for vector/ML operations.

### Runtime Architecture

```
┌────────────────────────────────────────────────────┐
│                  Host Process (Rust)                │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │             Wasmtime Engine                   │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ Module A│ │ Module B│ │ Module C│  ...    │  │
│  │  │ (User)  │ │ (User)  │ │ (System)│        │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘        │  │
│  │       │           │           │              │  │
│  │  ┌────┴───────────┴───────────┴────┐         │  │
│  │  │       Host Function Interface    │         │  │
│  │  │                                  │         │  │
│  │  │  table_*()     - Storage ops     │         │  │
│  │  │  vector_*()    - HNSW search     │         │  │
│  │  │  embed_*()     - Embedding gen   │         │  │
│  │  │  subscribe_*() - Subscriptions   │         │  │
│  │  │  consensus_*() - Raft proposals  │         │  │
│  │  └──────────────────────────────────┘         │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Resource Limits: 256MB heap, 10s CPU, 1K syscalls │
│  Isolation: Per-module memory, no shared state     │
│  Compilation: AOT (cranelift) → cached native code │
└────────────────────────────────────────────────────┘
```

### Host Function Categories

| Category | Functions | Description |
|----------|-----------|-------------|
| Storage | `table_create`, `row_insert`, `row_get`, `row_scan`, `row_delete` | Arrow-backed table operations |
| Vector | `vector_insert`, `vector_search`, `vector_delete`, `vector_search_filtered` | HNSW index operations via USearch |
| Embedding | `embed_text`, `embed_image`, `embed_custom` | ONNX Runtime model invocation |
| Subscription | `subscribe_query`, `subscribe_vector`, `unsubscribe` | Reactive subscription management |
| Consensus | `propose_write`, `read_committed` | Raft-mediated consistent operations |

### Resource Governance

```yaml
limits:
  memory_per_module: 256MB
  cpu_time_per_invocation: 10s
  max_host_calls_per_invocation: 1000
  max_concurrent_modules: 64
  max_vector_search_k: 10000
  max_embedding_batch: 100

metering:
  instruction_counting: true
  fuel_per_invocation: 10_000_000
  fuel_cost_host_call: 100
  fuel_cost_vector_search: 1000
  fuel_cost_embedding: 5000
```

### Compilation Pipeline

```
Source (.rs/.ts/.go) → WASM bytecode → Wasmtime AOT (Cranelift) → Cached native
                                                                      │
                                                              Module Registry
                                                              (content-hash keyed)
```

## Consequences

### Positive
- Security isolation: each module runs in its own linear memory space
- Deterministic execution: no floating-point nondeterminism, no shared state
- AOT compilation eliminates JIT warmup latency
- Host functions bridge to native Rust for performance-critical paths

### Negative
- ~2-10x overhead vs native for compute-heavy user code
- 256MB memory limit constrains large batch operations
- Host function interface is a stable API surface that's hard to change
- WASI preview 2 is still maturing (filesystem, networking)

## Related ADRs
- ADR-001: Fusion Architecture Foundation (WASM-first principle)
- ADR-006: Security-First Architecture (sandbox security model)
