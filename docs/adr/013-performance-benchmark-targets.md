# ADR-013: Performance Benchmark Targets

## Status

Accepted

## Date

2026-02-26

## Context

The fusion architecture combines two high-performance systems (SpacetimeDB at 107,850 TPS and ruvector at 61-72μs p50 vector search). The fused system must not regress below either component's standalone performance. Performance targets must be established before implementation to guide optimization decisions.

## Decision

Establish **quantified performance targets** for every critical path, with automated regression detection via the benchmark daemon worker.

### Target Matrix

| Metric | Target | Measurement | Source Baseline |
|--------|--------|------------|-----------------|
| **OLTP Throughput** | ≥100K TPS | Single-node, 8 threads, simple inserts | SpacetimeDB: 107,850 TPS |
| **Vector Search p50** | ≤100μs | Top-10 cosine, 1M vectors, 1536-dim | ruvector: 61-72μs |
| **Vector Search p99** | ≤500μs | Same conditions | New target |
| **Hybrid Query** | ≤1ms | Vector + relational filter, 1M rows | New target |
| **Subscription Delta** | ≤10ms | Single embedding change → client push | New target |
| **Subscription Storm** | ≤100ms | 1K affected subscriptions batch | New target |
| **Reducer Invocation** | ≤1ms overhead | WASM host function round-trip | SpacetimeDB baseline |
| **Raft Commit** | ≤5ms | 3-node, intra-DC | OpenRaft baseline |
| **CRDT Propagation** | ≤50ms | Vector index update to all replicas | New target |
| **Cold Start** | ≤500ms | Process launch to first query served | New target |
| **Wire Protocol** | ≤5% overhead | vs. native protocol latency | PG wire overhead |
| **Memory per 1M vectors** | ≤6GB | 1536-dim, float32, with index | USearch baseline |
| **Memory per 1M vectors (quantized)** | ≤1.5GB | 1536-dim, int8 | 4x reduction target |
| **SONA Adaptation** | ≤0.05ms | Micro-LoRA weight update | ruvector baseline |
| **GNN Enhancement** | ≤10ms | Per-query graph enhancement | New target |
| **Embedding Generation** | ≤50ms | 512-token text → 1536-dim, ONNX | ort baseline |

### Benchmark Suite Configuration

```yaml
benchmark_suite:
  name: driftbase-fusion-bench

  suites:
    oltp:
      - insert_single: { rows: 1M, threads: [1, 4, 8, 16] }
      - insert_batch: { batch_size: [100, 1000, 10000], rows: 1M }
      - point_read: { rows: 1M, threads: [1, 4, 8, 16] }
      - scan_range: { rows: 1M, range_size: [10, 100, 1000] }
      - update_single: { rows: 1M, threads: [1, 4, 8, 16] }
      - mixed_rw: { read_ratio: [0.5, 0.8, 0.95], threads: 8 }

    vector:
      - search_topk: { k: [1, 10, 100], vectors: [100K, 1M, 10M], dim: 1536 }
      - search_filtered: { k: 10, filter_selectivity: [0.01, 0.1, 0.5] }
      - insert_single: { vectors: 1M, dim: 1536 }
      - insert_batch: { batch_size: [100, 1000], vectors: 1M }
      - delete_rebuild: { delete_ratio: [0.01, 0.1], vectors: 1M }

    hybrid:
      - vector_plus_filter: { k: 10, filter_cols: [1, 3, 5] }
      - vector_plus_join: { k: 10, join_tables: [1, 2] }
      - fulltext_plus_vector: { k: 10, text_query: "sample" }

    subscription:
      - initial_subscribe: { concurrent_subs: [100, 1K, 10K] }
      - delta_single: { subs: 1K, single_insert: true }
      - delta_batch: { subs: 1K, batch_size: [10, 100] }
      - storm: { subs: 10K, clustered_insert: true }

    consensus:
      - raft_commit: { nodes: [3, 5, 7], payload_size: [1KB, 10KB] }
      - raft_leader_election: { nodes: [3, 5, 7] }
      - crdt_merge: { replicas: [3, 5], operations: [100, 1000] }
      - crdt_propagation: { replicas: 3, vector_updates: [1, 100] }

    learning:
      - sona_adapt: { patterns: [10, 100, 1000] }
      - gnn_enhance: { graph_size: [10K, 100K, 1M] }
      - embedding_gen: { batch: [1, 10, 100], token_length: 512 }

  regression_detection:
    threshold: 5%          # Alert if any metric degrades >5%
    window: 10 runs        # Compare against rolling window
    action: block_merge    # Prevent merging regressed code
```

### Profiling Integration

```
For each benchmark run:
  1. CPU profile (perf/flamegraph)
  2. Memory profile (peak RSS, allocations/s)
  3. I/O profile (read/write IOPS, bandwidth)
  4. Lock contention (futex waits, mutex holds)
  5. WASM overhead (host call frequency, fuel consumption)

Stored in: .claude-flow/metrics/
Visualized via: performance-report command
Regression alerts via: swarm-monitor daemon
```

## Consequences

### Positive
- Quantified targets prevent "it feels fast enough" reasoning
- Automated regression detection catches performance bugs before merge
- Comprehensive suite covers all hot paths in the fusion architecture
- Profiling integration enables root-cause analysis when targets are missed

### Negative
- Full benchmark suite takes ~30 minutes to run
- Benchmark infrastructure requires dedicated hardware for consistent results
- 5% regression threshold may be too tight for some workloads
- Benchmark maintenance burden as the system evolves

## Related ADRs
- ADR-001: Fusion Architecture Foundation (performance baselines)
- ADR-003: Real-Time Reactive Vector Search (subscription benchmarks)
- ADR-005: Consensus & CRDT Replication (consensus benchmarks)
- ADR-012: Hook-Driven Development Lifecycle (benchmark daemon)
