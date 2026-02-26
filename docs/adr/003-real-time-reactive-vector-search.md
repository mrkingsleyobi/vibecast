# ADR-003: Real-Time Reactive Vector Search

## Status

Accepted

## Date

2026-02-26

## Context

SpacetimeDB already supports real-time SQL subscriptions — clients issue a query and receive push updates when underlying data changes. ruvector provides sub-100μs vector search with HNSW indexing. No existing system combines these: you cannot subscribe to "top-10 similar documents" and get pushed updates when new embeddings shift results.

This is the core innovation of the fusion architecture.

## Decision

Implement a **reactive vector subscription engine** that extends SpacetimeDB's subscription protocol to support vector similarity queries with push-based result invalidation.

### Subscription Lifecycle

```
Client                    Subscription Engine              Vector Index
  │                              │                              │
  │── SUBSCRIBE(query, k=10) ──►│                              │
  │                              │── initial_search(query, k) ─►│
  │                              │◄── results[0..k] ────────────│
  │◄── INITIAL_RESULTS ─────────│                              │
  │                              │                              │
  │                              │   [Background: new embedding inserted]
  │                              │◄── INDEX_CHANGED event ──────│
  │                              │── delta_search(query, k) ───►│
  │                              │◄── changed_results ──────────│
  │◄── DELTA_PUSH ──────────────│                              │
  │                              │                              │
  │── UNSUBSCRIBE ─────────────►│                              │
  │◄── ACK ─────────────────────│                              │
```

### Query Types

```sql
-- Pure vector subscription
SUBSCRIBE SELECT * FROM documents
  ORDER BY embedding <-> $query_vector
  LIMIT 10;

-- Hybrid: vector + relational filter
SUBSCRIBE SELECT * FROM documents
  WHERE category = 'science'
  ORDER BY embedding <-> $query_vector
  LIMIT 10;

-- Multi-vector subscription
SUBSCRIBE SELECT * FROM documents
  ORDER BY (0.7 * (embedding <-> $query_vec) + 0.3 * (title_embedding <-> $title_vec))
  LIMIT 10;
```

### Delta Computation Strategy

| Strategy | Latency | Cost | Use When |
|----------|---------|------|----------|
| Full Recompute | O(k·log N) | High | Small k, infrequent updates |
| Boundary Tracking | O(1) amortized | Low | k-th result distance threshold monitoring |
| Incremental HNSW | O(log N) | Medium | Single embedding insert/update |
| Batch Invalidation | O(batch·log N) | Medium | Bulk inserts |

**Default**: Boundary Tracking with fallback to Full Recompute when >10% of index changes between pushes.

### Backpressure Protocol

```
If client ACK latency > 100ms:
  → Switch to batched deltas (aggregate changes)
If client ACK latency > 1s:
  → Switch to periodic polling (5s interval)
If client ACK latency > 10s:
  → Pause subscription, notify client
If client disconnects:
  → Hold subscription state for 30s (reconnect grace)
  → After 30s, tombstone subscription
```

### Consistency Model

- **Vector index updates**: Eventually consistent (CRDT-propagated)
- **Subscription deltas**: Causally ordered (vector clocks)
- **Relational filters**: Strongly consistent (Raft-committed)
- **Hybrid queries**: Read-your-writes within session, eventual across nodes

## Consequences

### Positive
- Industry-first capability: no competitor offers reactive vector subscriptions
- Builds naturally on SpacetimeDB's existing subscription infrastructure
- Boundary tracking minimizes unnecessary recomputation
- Backpressure prevents slow clients from degrading system performance

### Negative
- Delta computation for vector queries is fundamentally harder than relational deltas
- Boundary tracking has edge cases with clustered embeddings
- Hybrid consistency model is difficult to reason about
- Subscription state consumes memory proportional to (clients × subscriptions × k)

### Risks
- High-frequency embedding updates could overwhelm delta computation
- Clustered embeddings may cause "subscription storms" (many subs invalidated simultaneously)
- Memory pressure from large subscription sets on popular indices

## Related ADRs
- ADR-001: Fusion Architecture Foundation
- ADR-002: DDD Bounded Contexts (Subscription context)
- ADR-005: Consensus & CRDT Replication (consistency model)
