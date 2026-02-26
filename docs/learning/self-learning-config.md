# Self-Learning Configuration — Fusion Architecture Development

## Overview

The self-learning system operates at two levels:
1. **Product Level**: The fusion database learns from user queries (GNN, SONA) — this is what we're building
2. **Development Level**: Claude Flow V3 learns from our development patterns (ReasoningBank, hooks) — this helps us build better

This document configures **Level 2**: how the development swarm learns and improves.

---

## ReasoningBank Configuration

```yaml
reasoning_bank:
  enabled: true
  storage: agentdb
  vector_index: hnsw

  pattern_categories:
    # Architecture patterns
    architecture:
      - ddd_boundary_decisions: # How we resolved context boundary disputes
          retention: permanent
          confidence_threshold: 0.7
          examples:
            - "Storage vs Query: who owns index metadata?"
            - "Security shared kernel: what types to share?"

      - adr_evolution: # How ADRs changed over time
          retention: permanent
          confidence_threshold: 0.8

      - dependency_choices: # Which libraries worked, which didn't
          retention: permanent
          confidence_threshold: 0.9

    # Implementation patterns
    implementation:
      - rust_patterns: # Effective Rust patterns for this domain
          retention: permanent
          confidence_threshold: 0.8
          examples:
            - "Arrow RecordBatch builder patterns"
            - "WASM host function FFI patterns"
            - "OpenRaft integration patterns"

      - error_handling: # What error strategies worked
          retention: 180d
          confidence_threshold: 0.7

      - concurrency: # Async/sync boundary decisions
          retention: permanent
          confidence_threshold: 0.8

    # Testing patterns
    testing:
      - test_strategies: # What test approaches caught real bugs
          retention: permanent
          confidence_threshold: 0.8

      - property_test_generators: # Effective proptest strategies
          retention: permanent
          confidence_threshold: 0.9

      - fuzz_findings: # What fuzzing discovered
          retention: permanent
          confidence_threshold: 0.95

    # Performance patterns
    performance:
      - optimization_wins: # Optimizations with measured impact
          retention: permanent
          confidence_threshold: 0.9

      - performance_regressions: # What caused regressions
          retention: permanent
          confidence_threshold: 0.95

      - benchmark_baselines: # Reference numbers over time
          retention: permanent
          confidence_threshold: 1.0

    # Security patterns
    security:
      - threat_mitigations: # How threats were addressed
          retention: permanent
          confidence_threshold: 0.95

      - vulnerability_patterns: # Common vulnerability shapes
          retention: permanent
          confidence_threshold: 0.9

    # Failure patterns
    failures:
      - build_failures: # Why builds broke and how to fix
          retention: 90d
          confidence_threshold: 0.6

      - integration_failures: # Cross-context integration issues
          retention: 180d
          confidence_threshold: 0.7

      - design_mistakes: # Decisions that were reversed
          retention: permanent
          confidence_threshold: 0.8
```

## SONA Micro-LoRA Configuration

```yaml
sona:
  enabled: true
  adaptation_time_target: "<0.05ms"

  triggers:
    # Adapt when an agent completes a task successfully
    - event: task_completed
      action: reinforce_pattern
      weight: 0.1

    # Adapt when a test catches a bug
    - event: test_failure_fixed
      action: learn_error_pattern
      weight: 0.3

    # Adapt when a security issue is found
    - event: security_finding
      action: learn_threat_pattern
      weight: 0.5

    # Adapt when performance regression detected
    - event: benchmark_regression
      action: learn_perf_pattern
      weight: 0.4

  ewc_plus_plus:
    lambda: 5000
    fisher_samples: 200
    decay_rate: 0.999
    consolidation_interval: "2h"
```

## Hook-Driven Learning Triggers

```yaml
learning_hooks:
  # After every file edit
  post_edit:
    - action: record_edit_pattern
      data: [file_path, context, change_type, lines_changed]
      store_in: implementation.rust_patterns

  # After every task completion
  task_completed:
    - action: record_task_outcome
      data: [task_description, duration, agent, context, success]
      store_in: [implementation, testing, performance]

  # After every test run
  test_run:
    - action: record_test_results
      data: [test_suite, passed, failed, coverage_delta]
      store_in: testing.test_strategies

  # After every benchmark
  benchmark_run:
    - action: record_benchmark
      data: [suite, metrics, comparison_to_baseline]
      store_in: performance.benchmark_baselines

  # After every security scan
  security_scan:
    - action: record_findings
      data: [scanner, findings, severity, context]
      store_in: security.vulnerability_patterns

  # After every ADR decision
  adr_decision:
    - action: record_decision
      data: [adr_id, decision, rationale, votes, dissent]
      store_in: architecture.adr_evolution

  # On session end
  session_end:
    - action: consolidate_session_learnings
      data: [all_patterns_from_session]
      store_in: reasoning_bank (consolidated)
```

## Cross-Session Learning

```yaml
cross_session:
  # What to preserve between sessions
  persist:
    - all ReasoningBank patterns above threshold
    - benchmark baselines
    - ADR decisions
    - security findings
    - DDD boundary decisions

  # What to compress/summarize
  compress:
    - detailed edit histories → summary patterns
    - individual test results → coverage trends
    - raw metrics → statistical summaries

  # What to discard
  discard:
    - temporary debugging notes
    - superseded optimization attempts
    - resolved build failures (after 90d)

  # Storage location
  storage:
    primary: .claude-flow/data/reasoning-bank/
    backup: .claude-flow/data/reasoning-bank-backup/
    format: json_with_embeddings
    max_size: 100MB
    compression: lz4
```

## Learning Dashboard Metrics

```yaml
metrics:
  tracked:
    - patterns_captured_per_session
    - pattern_confidence_distribution
    - most_referenced_patterns (top-10)
    - learning_improvement_over_time
    - ewc_forgetting_prevention_rate
    - cross_context_pattern_reuse_rate
    - agent_specialization_depth

  alerts:
    - pattern_confidence_below_threshold: warn
    - reasoning_bank_size_exceeds_80MB: warn
    - ewc_forgetting_detected: critical
    - no_new_patterns_in_24h: info
```
