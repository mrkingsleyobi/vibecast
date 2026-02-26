# SPARC Implementation Roadmap

## Overview

The SpacetimeDB × ruvector fusion will be implemented using the SPARC methodology across 5 phases, with each bounded context progressing through all SPARC stages. The 15-agent swarm executes phases in parallel where dependency ordering allows.

---

## Phase 1: SPECIFICATION (Weeks 1-2)

**Lead Agent**: A11 (DDD Guardian) + Queen Coordinator
**Supporting**: A8 (Security Architect)

### Deliverables

| ID | Deliverable | Owner | Depends On |
|----|------------|-------|------------|
| S1.1 | Ubiquitous language glossary (all 8 contexts) | A11 | — |
| S1.2 | ADR-001 through ADR-013 ratified | Queen | — |
| S1.3 | Bounded context map with all relationships | A11 | S1.1 |
| S1.4 | Domain event catalog (complete) | A11 | S1.1 |
| S1.5 | Aggregate root specifications per context | A11 | S1.3 |
| S1.6 | Security threat model (STRIDE + DREAD) | A8 | S1.3 |
| S1.7 | Performance benchmark targets | A9 | S1.3 |
| S1.8 | Technology stack validation (PoC for each component) | A5, A6 | — |

### Quality Gate
- [ ] All 13 ADRs accepted by consensus (8/15 majority)
- [ ] Event storming complete with all policies identified
- [ ] Zero ambiguities in ubiquitous language
- [ ] All aggregate invariants formally specified

---

## Phase 2: PSEUDOCODE (Weeks 3-4)

**Lead Agent**: Queen Coordinator
**Working**: A1-A7 (all domain agents)

### Deliverables per Context

| Context | Agent | Pseudocode Scope |
|---------|-------|-----------------|
| Storage | A1 | Arrow table creation, WAL append, MVCC read/write, compaction |
| Query Engine | A2 | SQL parse → plan → execute pipeline, vector search integration |
| Subscription | A3 | Subscribe, delta computation (boundary tracking), push protocol |
| Integration | A4 | PG wire protocol state machine, type mapping, query translation |
| Runtime | A5 | WASM module load → compile → execute, host function dispatch |
| Consensus | A6 | Raft leader election, log replication, CRDT merge/broadcast |
| Intelligence | A7 | Embedding generation, GNN training loop, SONA adaptation |
| Security | A8 | Claims evaluation, JWT flow, audit logging |

### Algorithm Specifications

```
For each context:
  1. Define public API (trait/interface signatures)
  2. Write pseudocode for every public method
  3. Identify error cases and recovery paths
  4. Specify concurrency model (locks, channels, actors)
  5. Document performance-critical hot paths
```

### Quality Gate
- [ ] All public APIs defined with type signatures
- [ ] Pseudocode covers all domain events and commands
- [ ] Error handling specified for all boundary operations
- [ ] Concurrency model documented per context

---

## Phase 3: ARCHITECTURE (Weeks 5-8)

**Lead Agent**: A1 (Storage Architect) + A5 (Runtime Engineer)
**Supporting**: A11 (DDD Guardian), A8 (Security)

### Week 5-6: Foundation Layer

| Task | Agent | Description | Priority |
|------|-------|-------------|----------|
| A3.1 | A1 | Arrow storage engine scaffold | P0 |
| A3.2 | A1 | WAL implementation | P0 |
| A3.3 | A6 | OpenRaft integration | P0 |
| A3.4 | A5 | Wasmtime runtime scaffold | P0 |
| A3.5 | A8 | Security shared kernel (auth types) | P0 |
| A3.6 | A12 | CI/CD pipeline + Cargo workspace | P0 |

### Week 7-8: Core Engine

| Task | Agent | Description | Priority | Depends On |
|------|-------|-------------|----------|-----------|
| A3.7 | A2 | SQL parser + query planner | P0 | A3.1 |
| A3.8 | A2 | USearch HNSW integration | P0 | A3.1 |
| A3.9 | A2 | Tantivy full-text integration | P1 | A3.1 |
| A3.10 | A6 | CRDT replication layer (Yrs/Automerge) | P0 | A3.3 |
| A3.11 | A5 | Host function interface (table_*, vector_*) | P0 | A3.4, A3.1 |
| A3.12 | A7 | ONNX Runtime embedding pipeline | P1 | A3.1 |

### Dependency Graph

```
Week 5-6:
  A3.1 (Storage) ──────────┐
  A3.2 (WAL) ──────────────┤
  A3.3 (Raft) ─────────────┤──► Foundation Complete (Gate)
  A3.4 (Runtime) ──────────┤
  A3.5 (Security) ─────────┤
  A3.6 (CI/CD) ────────────┘

Week 7-8:
  A3.7 (SQL) ◄──── A3.1
  A3.8 (HNSW) ◄─── A3.1
  A3.9 (FTS) ◄──── A3.1
  A3.10 (CRDT) ◄── A3.3
  A3.11 (Host) ◄── A3.4 + A3.1
  A3.12 (ONNX) ◄── A3.1
```

### Cargo Workspace Layout

```
vibecast/
├── Cargo.toml                 (workspace root)
├── crates/
│   ├── vibecast-storage/      (Storage context)
│   ├── vibecast-query/        (Query Engine context)
│   ├── vibecast-subscription/ (Subscription context)
│   ├── vibecast-runtime/      (Runtime context)
│   ├── vibecast-consensus/    (Consensus context)
│   ├── vibecast-intelligence/ (Intelligence context)
│   ├── vibecast-security/     (Security context)
│   ├── vibecast-integration/  (Integration context)
│   ├── vibecast-server/       (Binary entry point)
│   └── vibecast-common/       (Shared types, minimal)
├── bindings/
│   └── vibecast-napi/         (Node.js bindings via napi-rs)
├── tests/
│   ├── integration/           (Cross-context integration tests)
│   └── benchmarks/            (Criterion benchmarks)
├── docs/                      (Architecture documents)
└── .claude-flow/              (Claude Flow V3 runtime)
```

### Quality Gate
- [ ] All crate scaffolds compile (`cargo check`)
- [ ] Shared kernel (Security types) importable from all crates
- [ ] CI pipeline runs: check, clippy, fmt, test
- [ ] Foundation benchmarks established (baseline numbers)

---

## Phase 4: REFINEMENT / TDD (Weeks 9-12)

**Lead Agent**: A10 (Test Architect)
**Working**: All implementation agents (A1-A7)

### TDD Strategy: London School (Mock-First)

```
For each bounded context:
  1. Define trait/interface for all dependencies
  2. Write tests with mock implementations
  3. Implement to pass tests
  4. Refactor while green
  5. Integration test at context boundaries

Test Layers:
  ├── Unit Tests (per crate, mocked dependencies)
  ├── Contract Tests (ACL and OHS boundaries)
  ├── Integration Tests (cross-crate, real dependencies)
  ├── Property Tests (proptest: CRDT merge commutativity, MVCC isolation)
  ├── Fuzz Tests (cargo-fuzz: SQL parser, wire protocol, WASM host calls)
  └── Performance Tests (criterion: all hot paths)
```

### Week 9-10: Core Path Tests + Implementation

| Task | Agent | Test Focus |
|------|-------|-----------|
| R4.1 | A1+A10 | Storage: Arrow CRUD, MVCC isolation, WAL recovery |
| R4.2 | A2+A10 | Query: SQL parsing correctness, plan optimization |
| R4.3 | A2+A10 | Query: Vector search accuracy (recall@10 ≥ 0.95) |
| R4.4 | A5+A10 | Runtime: WASM execution, resource limits, fuel metering |
| R4.5 | A6+A10 | Consensus: Raft safety (leader election, log consistency) |
| R4.6 | A6+A10 | Consensus: CRDT merge commutativity (property tests) |
| R4.7 | A8+A10 | Security: Claims evaluation, JWT validation |

### Week 11-12: Integration + Hardening

| Task | Agent | Test Focus |
|------|-------|-----------|
| R4.8 | A3+A10 | Subscription: Delta computation, backpressure |
| R4.9 | A4+A10 | Integration: PG wire protocol compliance |
| R4.10 | A7+A10 | Intelligence: Embedding accuracy, SONA adaptation |
| R4.11 | A9 | Performance: Full benchmark suite, regression detection |
| R4.12 | A8 | Security: Penetration testing, fuzz all parsers |
| R4.13 | A10 | Coverage: Ensure ≥80% line coverage across all crates |

### Quality Gate
- [ ] ≥80% line coverage on all crates
- [ ] All property tests pass (10K iterations)
- [ ] Fuzz tests run for 1 hour with no crashes
- [ ] All performance targets met (ADR-013)
- [ ] Security score ≥90/100
- [ ] Zero DDD boundary violations

---

## Phase 5: COMPLETION (Weeks 13-14)

**Lead Agent**: A12 (DevOps) + A13 (Documentation)
**Supporting**: A14 (Learning Specialist)

### Deliverables

| Task | Agent | Description |
|------|-------|-------------|
| C5.1 | A12 | Docker image (multi-stage, <100MB) |
| C5.2 | A12 | Kubernetes Helm chart (3-node cluster) |
| C5.3 | A12 | GitHub Actions CI/CD (test + bench + release) |
| C5.4 | A13 | API reference (auto-generated from rustdoc) |
| C5.5 | A13 | Architecture guide (from ADRs) |
| C5.6 | A13 | Getting Started tutorial |
| C5.7 | A13 | pgvector migration guide |
| C5.8 | A14 | ReasoningBank patterns exported for future sessions |
| C5.9 | A14 | Lessons learned document |
| C5.10 | Queen | v0.1.0 release tag + changelog |

### Quality Gate (Release)
- [ ] All Phase 4 gates still passing
- [ ] Docker image builds and runs smoke test
- [ ] Helm chart deploys 3-node cluster on k3s
- [ ] All documentation reviewed
- [ ] CHANGELOG.md complete
- [ ] Security audit final report clean
- [ ] Performance benchmark report attached to release

---

## Swarm Execution Timeline

```
Week:  1   2   3   4   5   6   7   8   9  10  11  12  13  14
       ├───┤   ├───┤   ├───┤   ├───┤   ├───┤   ├───┤   ├───┤

A11    ████████                                              DDD Guardian
A8     ████████                    ░░░░░░░░░░░░██████        Security
Queen  ████████████████████████████████████████████████████   Coordinator
A1              ████████████████████████████████              Storage
A2                      ████████████████████████              Query
A3                              ████████████████              Subscription
A4                              ████████████████              Wire Protocol
A5              ████████████████████████████████              Runtime
A6              ████████████████████████████████              Consensus
A7                      ████████████████████████              Intelligence
A9                                      ████████████████     Performance
A10                             ████████████████████████     Test Architect
A12                                             ████████     DevOps
A13                                             ████████     Docs
A14     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████     Learning

Legend: ████ = Active development
        ░░░░ = Background/monitoring
```

---

## ReasoningBank Learning Integration

```yaml
learning_capture:
  per_phase:
    specification:
      - What ADR decisions took multiple rounds?
      - Which ubiquitous language terms were ambiguous?
      - How did DDD boundary discussions resolve?

    pseudocode:
      - Which algorithms required redesign during implementation?
      - Where did pseudocode miss error cases?

    architecture:
      - Which dependency choices worked well?
      - Where did the Cargo workspace structure need adjustment?
      - Which cross-context integrations were hardest?

    refinement:
      - Which tests caught real bugs vs. false positives?
      - Where was coverage hard to achieve (and why)?
      - Which performance optimizations had the biggest impact?

    completion:
      - What documentation was most valuable to write?
      - What deployment issues were unexpected?
      - What would we do differently next time?

  stored_in: .claude-flow/data/reasoning-bank/
  format: JSON with vector embeddings for semantic search
  retention: permanent (cross-project learning)
```
