# Architecture Decision Records — VibeCast

## SpacetimeDB × ruvector Fusion Architecture

This ADR registry tracks all architectural decisions for the VibeCast fusion database platform — a distributed, real-time vector database combining SpacetimeDB's multiplayer engine with ruvector's self-learning vector search.

## ADR Index

| ADR | Title | Status | Domain |
|-----|-------|--------|--------|
| [ADR-001](./001-fusion-architecture-foundation.md) | Fusion Architecture Foundation | Accepted | Core |
| [ADR-002](./002-ddd-bounded-contexts.md) | DDD Bounded Contexts | Accepted | Core |
| [ADR-003](./003-real-time-reactive-vector-search.md) | Real-Time Reactive Vector Search | Accepted | Core |
| [ADR-004](./004-wasm-runtime-strategy.md) | WASM Runtime Strategy | Accepted | Runtime |
| [ADR-005](./005-consensus-and-replication.md) | Consensus & CRDT Replication | Accepted | Distributed |
| [ADR-006](./006-security-first-architecture.md) | Security-First Architecture | Accepted | Security |
| [ADR-007](./007-self-learning-neural-pipeline.md) | Self-Learning Neural Pipeline | Accepted | Intelligence |
| [ADR-008](./008-arrow-native-storage-engine.md) | Arrow-Native Storage Engine | Accepted | Storage |
| [ADR-009](./009-postgres-wire-protocol-compat.md) | PostgreSQL Wire Protocol Compatibility | Accepted | Integration |
| [ADR-010](./010-licensing-and-enterprise-strategy.md) | Licensing & Enterprise Strategy | Accepted | Business |
| [ADR-011](./011-swarm-orchestration-plan.md) | Swarm Orchestration Plan | Accepted | DevOps |
| [ADR-012](./012-hook-driven-development-lifecycle.md) | Hook-Driven Development Lifecycle | Accepted | DevOps |
| [ADR-013](./013-performance-benchmark-targets.md) | Performance Benchmark Targets | Accepted | Performance |

## Decision Process

All ADRs follow the MADR (Markdown Any Decision Records) format and are tracked by the `adr-architect` agent. Decisions are stored in ReasoningBank for cross-session learning.

## Bounded Context Alignment

```
ADR-001 ──► Core Domain (Fusion Engine)
ADR-002 ──► All Domains (Context Mapping)
ADR-003 ──► Query Domain + Subscription Domain
ADR-004 ──► Runtime Domain
ADR-005 ──► Consensus Domain + Replication Domain
ADR-006 ──► Security Domain (cross-cutting)
ADR-007 ──► Intelligence Domain
ADR-008 ──► Storage Domain
ADR-009 ──► Integration Domain
ADR-010 ──► Business Context (external)
ADR-011 ──► DevOps Context (build-time)
ADR-012 ──► DevOps Context (build-time)
ADR-013 ──► Performance Context (cross-cutting)
```
