# ADR-012: Hook-Driven Development Lifecycle

## Status

Accepted

## Date

2026-02-26

## Context

Claude Flow V3 provides 7 hook types and 10 background daemon workers. These can automate quality gates, security scanning, performance regression detection, and learning capture throughout the development lifecycle. Manual checks are error-prone and slow; hook-driven automation ensures consistent quality at machine speed.

## Decision

Configure a **comprehensive hook pipeline** that enforces quality, security, and learning at every development lifecycle stage.

### Hook Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT LIFECYCLE HOOKS                           │
│                                                                         │
│  SessionStart ──────────────────────────────────────────────────────┐   │
│  │ • Restore session state from checkpoint                          │   │
│  │ • Load ReasoningBank patterns for current context                │   │
│  │ • Initialize memory namespace for active bounded context         │   │
│  │ • Start security scanner in background                          │   │
│  │ • Load ADR compliance rules                                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  PreToolUse (Bash) ─────────────────────────────────────────────────┐   │
│  │ • Validate command against security allowlist                    │   │
│  │ • Check for secrets in command arguments                        │   │
│  │ • Verify working directory is within project bounds             │   │
│  │ • Log command to audit trail                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  PostToolUse (Write/Edit) ──────────────────────────────────────────┐   │
│  │ • Run DDD boundary check (file in correct bounded context?)     │   │
│  │ • Verify file size <500 lines (CLAUDE.md rule)                  │   │
│  │ • Check for hardcoded secrets/credentials                       │   │
│  │ • Validate imports stay within context boundaries               │   │
│  │ • Update ADR compliance status                                  │   │
│  │ • Trigger incremental security scan on changed file             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TaskCompleted ─────────────────────────────────────────────────────┐   │
│  │ • Capture task pattern in ReasoningBank                         │   │
│  │ • Update swarm progress metrics                                 │   │
│  │ • Run affected test suites                                      │   │
│  │ • Check test coverage delta (must not decrease)                 │   │
│  │ • Trigger performance benchmark if hot path changed             │   │
│  │ • Update ADR traceability matrix                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  SubagentStart ─────────────────────────────────────────────────────┐   │
│  │ • Load context-specific memory namespace                        │   │
│  │ • Apply bounded context constraints                             │   │
│  │ • Set resource limits based on agent role                       │   │
│  │ • Register agent with swarm coordinator                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TeammateIdle ──────────────────────────────────────────────────────┐   │
│  │ • Check dependency graph for unblocked tasks                    │   │
│  │ • Auto-assign next task from backlog                            │   │
│  │ • Run background optimization if no tasks available             │   │
│  │ • Trigger memory consolidation during idle periods              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  SessionEnd ────────────────────────────────────────────────────────┐   │
│  │ • Persist session state to checkpoint                           │   │
│  │ • Sync ReasoningBank to AgentDB                                 │   │
│  │ • Generate session summary with metrics                         │   │
│  │ • Export learning patterns for cross-session use                │   │
│  │ • Run final security audit                                     │   │
│  │ • Update V3 progress dashboard                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  PreCompact ────────────────────────────────────────────────────────┐   │
│  │ • Save critical context before memory compaction                │   │
│  │ • Prioritize architectural decisions and ADRs                   │   │
│  │ • Compress pattern history (keep top-confidence)                │   │
│  │ • Archive completed task details                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Background Daemon Workers

| Worker | Interval | Priority | Purpose for Fusion Architecture |
|--------|----------|----------|--------------------------------|
| audit | 1h | Critical | Security compliance scanning across all 8 bounded contexts |
| optimize | 30m | High | Identify code optimization opportunities in hot paths |
| consolidate | 2h | Low | Merge ReasoningBank patterns, deduplicate learned knowledge |
| testgaps | 1h | High | Detect untested code paths, especially at context boundaries |
| ultralearn | 1h | Normal | Deep pattern analysis from completed tasks |
| deepdive | 4h | Normal | Complex codebase analysis (cross-context dependencies) |
| document | 1h | Normal | Auto-generate API docs when interfaces change |
| refactor | 2h | Low | Suggest refactoring when DDD violations accumulate |
| benchmark | 4h | Normal | Run performance regression suite |
| map | 30m | High | Update dependency graph and context map |

### Quality Gates (Enforced by Hooks)

```yaml
quality_gates:
  pre_commit:
    - lint: "cargo clippy -- -D warnings"
    - format: "cargo fmt --check"
    - test: "cargo test --lib"
    - security: "cargo audit"
    - ddd_check: ".claude/helpers/ddd-tracker.sh validate"

  pre_merge:
    - all_tests: "cargo test"
    - coverage: ">= 80% (lines)"
    - security_score: ">= 90/100"
    - adr_compliance: ".claude/helpers/adr-compliance.sh"
    - no_context_violations: "ddd boundary check clean"
    - benchmark_regression: "< 5% degradation on any metric"

  pre_release:
    - integration_tests: "cargo test --test integration"
    - fuzz_tests: "cargo fuzz run (1 hour minimum)"
    - performance_suite: "full benchmark suite passes"
    - security_audit: "complete STRIDE review"
    - documentation: "all public APIs documented"
    - adr_review: "all ADRs current and consistent"
```

## Consequences

### Positive
- Every code change is automatically validated against quality gates
- Security issues caught immediately, not in review
- DDD boundaries enforced by tooling, not discipline alone
- Learning is continuous and automatic — the system improves every session
- Background workers handle maintenance tasks without blocking development

### Negative
- Hook execution adds latency to every tool use (~100-500ms)
- False positives from security/DDD checks may require overrides
- Background workers consume compute resources
- Hook configuration complexity (debugging hook failures)

## Related ADRs
- ADR-006: Security-First Architecture (security hooks)
- ADR-007: Self-Learning Neural Pipeline (learning hooks)
- ADR-011: Swarm Orchestration Plan (agent coordination hooks)
