# ADR-007: Self-Learning Neural Pipeline

## Status

Accepted

## Date

2026-02-26

## Context

ruvector's differentiating feature is its self-learning capability — the vector index improves search quality over time by learning from query patterns and user feedback. The fusion architecture must integrate this learning pipeline with SpacetimeDB's real-time infrastructure to create a database that genuinely improves with use.

## Decision

Implement a **continuous self-learning pipeline** that combines ruvector's GNN-enhanced search with real-time feedback loops, backed by ONNX Runtime for model inference.

### Learning Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Self-Learning Pipeline                               │
│                                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │  Queries  │───►│  Feedback    │───►│  Training   │───►│  Model    │ │
│  │  & Usage  │    │  Collection  │    │  Pipeline   │    │  Registry │ │
│  └──────────┘    └──────────────┘    └─────────────┘    └─────┬─────┘ │
│       │                                                        │       │
│       │          ┌──────────────┐    ┌─────────────┐          │       │
│       └─────────►│  Pattern     │───►│  SONA       │──────────┘       │
│                  │  Recognition │    │  Adaptation  │                  │
│                  └──────────────┘    └─────────────┘                  │
│                                                                         │
│  Feedback Signals:                                                      │
│  ├── Explicit: click-through, relevance ratings, corrections           │
│  ├── Implicit: dwell time, re-queries, subscription renewals           │
│  └── System:   cache hit rates, delta frequency, index utilization    │
│                                                                         │
│  Learning Modes:                                                        │
│  ├── Online:  SONA micro-LoRA (<0.05ms per adaptation)                │
│  ├── Batch:   Full GNN retraining (scheduled, off-peak)               │
│  └── Hybrid:  Online accumulation → periodic batch consolidation      │
└─────────────────────────────────────────────────────────────────────────┘
```

### GNN Enhancement Pipeline

```
Raw HNSW Graph ──► GNN Feature Extraction ──► Edge Weight Learning ──► Enhanced Graph
     │                     │                          │                      │
     │              Node features:              Learn optimal           Improved
     │              - Embedding values          neighbor weights       recall@10
     │              - Query frequency           from click data        (+12.4%)
     │              - Access patterns
     │              - Temporal locality
```

### Model Registry

| Model | Format | Purpose | Update Frequency | Inference Latency |
|-------|--------|---------|-----------------|-------------------|
| GNN-Enhancer | ONNX | Graph edge weight optimization | Daily batch | 5-10ms per query |
| Query-Predictor | ONNX | Predict which indices a query will hit | Hourly | <1ms |
| Embedding-Compressor | ONNX | Dimensionality reduction (1536→256) | Weekly | 2ms |
| Anomaly-Detector | ONNX | Detect poisoned embeddings | Continuous | <0.5ms |
| SONA-Adapter | In-memory | Micro-LoRA real-time adaptation | Continuous | <0.05ms |

### ReasoningBank Integration

```yaml
reasoning_bank:
  storage: agentdb (vector-indexed)
  pattern_types:
    - query_patterns:       # Recurring query shapes
        retention: 30d
        confidence_decay: 0.95
    - optimization_patterns: # What optimizer decisions worked
        retention: 90d
        confidence_decay: 0.99
    - failure_patterns:     # What went wrong and why
        retention: 180d
        confidence_decay: 0.90
    - security_patterns:    # Suspicious behavior signatures
        retention: 365d
        confidence_decay: 0.99
```

### EWC++ Anti-Forgetting

```
Problem: Continuous learning can overwrite previously learned patterns
         (catastrophic forgetting)

Solution: Elastic Weight Consolidation++ (EWC++)
  1. After each batch training epoch, compute Fisher Information Matrix
  2. Identify "important" weights (high Fisher values)
  3. Penalize changes to important weights in subsequent training
  4. Exponential decay on old Fisher values (prevent rigidity)

Parameters:
  lambda: 5000        # Regularization strength
  fisher_samples: 200 # Samples for Fisher estimation
  decay: 0.999        # Old knowledge decay rate
```

## Consequences

### Positive
- Database literally gets smarter with use — unprecedented capability
- SONA micro-LoRA enables real-time adaptation without full retraining
- GNN enhancement improves recall by 12.4% over static HNSW
- ReasoningBank preserves learned patterns across sessions/restarts
- EWC++ prevents catastrophic forgetting during continuous learning

### Negative
- Learning pipeline adds CPU/memory overhead
- GNN enhancement adds 5-10ms to queries (opt-in per index)
- Model management complexity (versioning, rollback, A/B testing)
- Poisoned feedback data could degrade search quality
- EWC++ Fisher matrix computation is expensive (batch only)

## Related ADRs
- ADR-001: Fusion Architecture Foundation (self-learning principle)
- ADR-002: DDD Bounded Contexts (Intelligence domain)
- ADR-006: Security-First Architecture (anomaly detection, poisoning defense)
