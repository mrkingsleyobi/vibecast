# ADR-011: Swarm Orchestration Plan

## Status

Accepted

## Date

2026-02-26

## Context

The fusion architecture spans 8 bounded contexts, each requiring deep expertise. Claude Flow V3's 15-agent hierarchical-mesh swarm can parallelize development across all domains simultaneously, with consensus-based coordination ensuring architectural coherence.

## Decision

Deploy a **15-agent swarm** organized in a hierarchical-mesh topology, with agents mapped to bounded contexts and cross-cutting concerns.

### Swarm Topology

```
                    ┌─────────────────┐
                    │   QUEEN          │
                    │   Coordinator    │
                    │   (Orchestrator) │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────┴──────┐  ┌─────┴─────┐  ┌──────┴──────┐
     │  CORE       │  │ SUPPORT   │  │  CROSS-CUT  │
     │  DOMAIN     │  │ DOMAIN    │  │  CONCERNS   │
     │  CLUSTER    │  │ CLUSTER   │  │  CLUSTER    │
     └──────┬──────┘  └─────┬─────┘  └──────┬──────┘
            │               │                │
    ┌───┬───┼───┐     ┌────┼────┐      ┌────┼────┐
    │   │   │   │     │    │    │      │    │    │
    A1  A2  A3  A4    A5   A6   A7     A8   A9  A10-A14
```

### Agent Roster

| ID | Agent | Role | Bounded Context | SPARC Phase | Tools |
|----|-------|------|-----------------|-------------|-------|
| Q | **Queen Coordinator** | Orchestration, conflict resolution, progress tracking | All | All | sparc-orchestrator, swarm-coordinator |
| A1 | **Storage Architect** | Arrow tables, WAL, MVCC, compaction | Storage | Architecture | adr-architect, code, tdd |
| A2 | **Query Engine Dev** | SQL parser, planner, vector search, hybrid queries | Query Engine | Code + Refinement | coder, tester, debugger |
| A3 | **Subscription Dev** | Client connections, delta computation, push protocol | Subscription | Code + Refinement | coder, tester, debugger |
| A4 | **Wire Protocol Dev** | PostgreSQL v3 frontend, type mapping, pgvector compat | Integration | Code + Refinement | coder, integration, tester |
| A5 | **Runtime Engineer** | Wasmtime, host functions, resource governance | Runtime | Architecture + Code | architect, coder, security-review |
| A6 | **Consensus Engineer** | Raft (OpenRaft), CRDT (Yrs/Automerge), membership | Consensus | Architecture + Code | architect, coder, tdd |
| A7 | **ML/Intelligence Dev** | GNN enhancement, ONNX, SONA, embedding pipeline | Intelligence | Code + Refinement | coder, researcher, optimizer |
| A8 | **Security Architect** | Threat modeling, AuthN/AuthZ, audit, CVE tracking | Security | All (cross-cutting) | security-review, security-scanner |
| A9 | **Performance Engineer** | Benchmarks, profiling, optimization, regression detection | Performance | Refinement | optimizer, benchmark, analyzer |
| A10 | **Test Architect** | Test strategy, coverage, TDD London School, fuzzing | Quality | Refinement | tester, tdd, reviewer |
| A11 | **DDD Guardian** | Context boundaries, ubiquitous language, anti-corruption | Architecture | Specification | ddd-domain-expert, reviewer |
| A12 | **DevOps Engineer** | CI/CD, Docker, Kubernetes, release automation | Deployment | Completion | devops, github-modes |
| A13 | **Documentation Writer** | API docs, architecture docs, tutorials, ADR maintenance | Documentation | Completion | documenter, docs-writer |
| A14 | **Learning Specialist** | ReasoningBank, pattern capture, self-improvement | Intelligence | All | memory-manager, learning-optimizer |

### Communication Protocol

```yaml
coordination:
  strategy: consensus
  quorum: majority (8/15)

  channels:
    - name: architecture-decisions
      participants: [Q, A1, A5, A6, A8, A11]
      consensus_required: true

    - name: implementation-sync
      participants: [A1, A2, A3, A4, A5, A6, A7]
      consensus_required: false

    - name: security-alerts
      participants: [Q, A8, A5, A9]
      priority: critical

    - name: performance-reports
      participants: [Q, A9, A1, A2, A7]
      frequency: per-milestone

    - name: test-results
      participants: [Q, A10, all-implementers]
      frequency: continuous

  conflict_resolution:
    - level: agent-pair → direct negotiation
    - level: cluster → cluster lead arbitration
    - level: cross-cluster → Queen decision
    - level: architectural → ADR vote (majority)
```

### Dependency Graph

```
Phase 1 (Foundation):     A1(Storage) ──► A11(DDD validates)
                          A8(Security foundations)
                          A11(DDD context map)

Phase 2 (Core Engine):    A2(Query) depends on A1(Storage)
                          A5(Runtime) depends on A1(Storage)
                          A6(Consensus) depends on A1(Storage)

Phase 3 (Integration):    A3(Subscription) depends on A2(Query)
                          A7(Intelligence) depends on A2(Query) + A1(Storage)
                          A4(Wire Protocol) depends on A2(Query)

Phase 4 (Hardening):      A9(Performance) validates A1-A7
                          A10(Tests) covers A1-A7
                          A8(Security) audits A1-A7

Phase 5 (Release):        A12(DevOps) packages all
                          A13(Docs) documents all
                          A14(Learning) captures patterns
```

## Consequences

### Positive
- 15 agents working in parallel dramatically accelerates development
- Context-per-agent ensures deep domain expertise
- Hierarchical-mesh allows both directed coordination and peer collaboration
- Consensus-based architecture decisions prevent drift
- Learning specialist captures patterns for future projects

### Negative
- 15-agent coordination overhead (~15% of total capacity)
- Context switching between agents adds latency to cross-domain decisions
- Queen coordinator is a single point of decision-making bottleneck
- Requires careful monitoring to detect and resolve agent conflicts

## Related ADRs
- ADR-001: Fusion Architecture Foundation
- ADR-002: DDD Bounded Contexts (agent-to-context mapping)
- ADR-012: Hook-Driven Development Lifecycle (automation)
