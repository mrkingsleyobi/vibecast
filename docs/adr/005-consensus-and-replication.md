# ADR-005: Consensus & CRDT Replication

## Status

Accepted

## Date

2026-02-26

## Context

SpacetimeDB is currently single-node only. The fusion architecture must support multi-node deployment for production workloads. We need both strong consistency (ACID transactions) and eventual consistency (vector index propagation) in the same system. This is a dual-consensus challenge.

## Decision

Implement a **hybrid consensus architecture** using OpenRaft for transactional writes and CRDT replication for vector index propagation.

### Dual Consensus Model

```
┌──────────────────────────────────────────────────────────────┐
│                    Write Path (Strong)                        │
│                                                              │
│  Client ──► Leader Node ──► Raft Proposal ──► Majority ACK  │
│                                    │                         │
│                          ┌─────────┼─────────┐              │
│                          ▼         ▼         ▼              │
│                       Node A    Node B    Node C            │
│                       (Leader)  (Follower) (Follower)       │
│                                                              │
│  Guarantees: Linearizable reads, serializable writes        │
│  Latency: 2-5ms (intra-DC), 50-200ms (cross-DC)           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  Vector Path (Eventual)                       │
│                                                              │
│  Embedding Insert ──► Local HNSW Update ──► CRDT Broadcast  │
│                                                    │         │
│                          ┌─────────────────────────┤         │
│                          ▼              ▼          ▼         │
│                       Node A         Node B     Node C      │
│                       (origin)       (replica)  (replica)   │
│                                                              │
│  CRDTs Used:                                                 │
│  - OR-Set: Track which vectors exist in index                │
│  - LWW-Register: Vector data (embedding + metadata)         │
│  - G-Counter: Index version counter                         │
│                                                              │
│  Guarantees: Eventual consistency, conflict-free merges     │
│  Latency: <1ms local, 10-50ms propagation                  │
└──────────────────────────────────────────────────────────────┘
```

### Consistency Boundaries

| Operation | Consistency | Protocol | Latency Target |
|-----------|------------|----------|---------------|
| Row INSERT/UPDATE/DELETE | Linearizable | Raft | <5ms |
| Schema DDL | Linearizable | Raft | <10ms |
| Vector INSERT (index) | Eventual | CRDT OR-Set | <1ms local |
| Vector SEARCH | Session-consistent | Local HNSW + version check | <100μs |
| Subscription Delta | Causal | Vector clocks | <10ms |
| Snapshot | Consistent | Raft snapshot | <1s |

### Conflict Resolution

```
Raft Conflicts:
  → Leader arbitration (deterministic)
  → Split-brain: Raft quorum prevents

CRDT Conflicts:
  → OR-Set: Union semantics (add wins over remove)
  → LWW-Register: Timestamp-based (HLC clock)
  → Concurrent vector updates: Last-writer-wins with HLC

Cross-Layer Conflicts:
  → Row deleted via Raft but vector still in CRDT index
  → Resolution: Raft-committed tombstone triggers CRDT remove
  → GC: Tombstones collected after all replicas acknowledge
```

### Membership & Topology

```yaml
cluster:
  min_nodes: 3
  max_nodes: 7
  topology: raft_ring_with_crdt_mesh

  raft:
    election_timeout: 150-300ms
    heartbeat_interval: 50ms
    snapshot_threshold: 10000 entries

  crdt:
    sync_interval: 100ms
    full_sync_interval: 60s
    max_delta_size: 1MB
    compression: lz4

  membership:
    join_protocol: raft_joint_consensus
    leave_protocol: graceful_drain → raft_remove
    failure_detection: phi_accrual (threshold: 8)
```

## Consequences

### Positive
- Strong consistency for relational data protects application correctness
- Eventual consistency for vectors maximizes write throughput and availability
- CRDT merges are conflict-free by construction (no coordination needed)
- Raft provides well-understood safety guarantees

### Negative
- Two consensus protocols add operational complexity
- Cross-layer consistency (Raft row delete → CRDT vector remove) requires careful sequencing
- CRDT OR-Set metadata grows with number of add/remove operations (compaction needed)
- Network partitions create divergent vector indices that must reconverge

## Related ADRs
- ADR-001: Fusion Architecture Foundation (hybrid consistency principle)
- ADR-002: DDD Bounded Contexts (Consensus domain)
- ADR-003: Real-Time Reactive Vector Search (delta consistency)
