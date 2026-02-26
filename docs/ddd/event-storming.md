# Event Storming — SpacetimeDB × ruvector Fusion

## Big Picture Event Storming

This document captures all domain events, commands, aggregates, and policies identified through event storming for the fusion architecture.

---

## Timeline: Client Inserts a Document with Embedding

```
TIME ──────────────────────────────────────────────────────────────────────────────►

[Command]          [Event]              [Event]              [Event]
ConnectClient ──► ClientConnected ──► SessionCreated ──► ClaimsLoaded
                  (Integration)        (Subscription)       (Security)

[Command]          [Event]              [Event]              [Policy]
InvokeReducer ──► ReducerInvoked ──► FuelAllocated ──► EnforceResourceLimits
                  (Runtime)            (Runtime)           (Runtime)

[Command]          [Event]              [Event]              [Event]
InsertRow ──────► TransactionStarted ► RowInserted ──────► WALAppended
                  (Storage)            (Storage)            (Storage)

                  [Event]              [Event]              [Policy]
                  EmbeddingGenerated ► VectorInserted ──► PropagateViaCRDT
                  (Intelligence)       (Query Engine)      (Consensus)

[Command]          [Event]              [Event]
CommitTx ────────► RaftCommitted ──► TransactionCommitted
                   (Consensus)        (Storage)

                  [Policy]             [Event]              [Event]
                  EvaluateSubscriptions ► DeltaComputed ──► DeltaPushed
                                         (Subscription)     (Subscription)

                  [Policy]             [Event]
                  CollectFeedback ───► FeedbackRecorded
                                      (Intelligence)
```

---

## Event Catalog

### Storage Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `TableCreated` | DDL CREATE TABLE | table_id, schema, created_by | QueryEngine, Security |
| `TableDropped` | DDL DROP TABLE | table_id, dropped_by | QueryEngine, Subscription, Security |
| `RowInserted` | INSERT via Reducer | table_id, row_id, row_data, tx_id | QueryEngine, Subscription, Consensus |
| `RowUpdated` | UPDATE via Reducer | table_id, row_id, old_data, new_data, tx_id | QueryEngine, Subscription, Consensus |
| `RowDeleted` | DELETE via Reducer | table_id, row_id, tx_id | QueryEngine, Subscription, Consensus |
| `WALAppended` | Any write operation | segment_id, lsn, entry_data | Consensus (Raft replication) |
| `WALTruncated` | Snapshot completion | segment_id, truncated_before_lsn | Monitoring |
| `SnapshotCreated` | Compaction/Checkpoint | snapshot_id, tables, lsn | Consensus, Monitoring |
| `CompactionCompleted` | Background GC | table_id, rows_compacted, space_reclaimed | Monitoring |

### Query Engine Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `QueryParsed` | Client query | plan_id, sql, ast | Monitoring, Intelligence |
| `PlanOptimized` | Query planning | plan_id, logical_plan, physical_plan, cost | Monitoring |
| `VectorSearchExecuted` | Vector query | index_id, k, latency, results_count | Subscription, Intelligence, Monitoring |
| `HybridResultsMerged` | Hybrid query | plan_id, vector_count, filter_count, final_count | Monitoring |
| `IndexCreated` | CREATE INDEX | index_id, type, table_id, columns | Storage, Intelligence |
| `IndexRebuilt` | Maintenance | index_id, duration, vector_count | Monitoring |

### Subscription Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `ClientConnected` | New connection | session_id, principal_id, protocol | Security, Monitoring |
| `ClientDisconnected` | Connection close | session_id, reason, duration | Security, Monitoring |
| `SubscriptionCreated` | SUBSCRIBE query | sub_id, session_id, query_plan | QueryEngine, Monitoring |
| `SubscriptionCancelled` | UNSUBSCRIBE | sub_id, reason | Monitoring |
| `DeltaComputed` | Data change | sub_id, delta_type, added, removed, updated | Client (push) |
| `DeltaPushed` | Push to client | sub_id, session_id, delta_size, latency | Monitoring, Intelligence |
| `BackpressureActivated` | Slow client | session_id, level, reason | Monitoring |
| `BackpressureDeactivated` | Client caught up | session_id, recovery_time | Monitoring |

### Runtime Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `ModuleLoaded` | Module upload | module_id, hash, reducers | Security, Monitoring |
| `ModuleCompiled` | AOT compilation | module_id, compilation_time | Monitoring |
| `ReducerInvoked` | Client call | invocation_id, module_id, reducer, caller | Security, Monitoring |
| `ReducerCompleted` | Execution done | invocation_id, result, fuel_consumed, duration | Monitoring, Intelligence |
| `ResourceLimitExceeded` | Over budget | invocation_id, limit_type, value | Security, Monitoring |
| `ModuleRevoked` | Security action | module_id, reason, revoked_by | Security |

### Consensus Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `LeaderElected` | Election | node_id, term, voters | All (leadership change) |
| `LogAppended` | Raft proposal | term, index, command_type | Storage (WAL) |
| `LogCommitted` | Majority ACK | term, index | Storage (apply) |
| `SnapshotInstalled` | Snapshot transfer | node_id, last_index, last_term | Storage |
| `MemberJoined` | Cluster expansion | node_id, role | Monitoring |
| `MemberLeft` | Cluster shrink | node_id, reason | Monitoring |
| `CRDTMerged` | Replica sync | document_id, from_node, ops_count | QueryEngine (index update) |
| `CRDTPropagated` | Broadcast done | document_id, to_nodes, latency | Monitoring |

### Intelligence Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `EmbeddingGenerated` | Text/image input | model_id, input_hash, dimensions, latency | Storage, QueryEngine |
| `ModelLoaded` | Startup/update | model_id, version, format | Monitoring |
| `ModelUpdated` | Training complete | model_id, old_version, new_version, improvement | Monitoring |
| `GNNEnhanced` | Query enhancement | query_id, improvement_score | Monitoring |
| `LearningEpochStarted` | Scheduled training | epoch_id, model_id, data_size | Monitoring |
| `LearningEpochCompleted` | Training done | epoch_id, recall_improvement, duration | Monitoring |
| `SONAAdapted` | Real-time feedback | adaptation_id, latency, pattern_type | Monitoring |
| `FeedbackRecorded` | User interaction | feedback_type, query_id, signal | Intelligence (training) |

### Security Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `PrincipalCreated` | Registration | principal_id, type | Monitoring |
| `PrincipalAuthenticated` | Login/token | principal_id, method, ip | Monitoring |
| `AuthenticationFailed` | Bad credentials | principal_id, method, ip, reason | Monitoring, Security (lockout) |
| `ClaimsIssued` | Authorization | claims_set_id, principal_id, permissions | Monitoring |
| `AccessDenied` | Unauthorized op | principal_id, operation, resource, reason | Monitoring, Security (alert) |
| `AuditRecorded` | Any auditable op | entry_id, principal_id, action, resource | Compliance |

### Integration Domain Events

| Event | Trigger | Data | Consumers |
|-------|---------|------|-----------|
| `WireSessionOpened` | PG client connect | session_id, client_info | Security, Monitoring |
| `WireSessionClosed` | PG client disconnect | session_id, queries_executed | Monitoring |
| `QueryTranslated` | PG SQL → Internal | session_id, pg_sql, internal_ast | Monitoring |
| `TranslationFailed` | Unsupported SQL | session_id, pg_sql, reason | Monitoring |
| `ResultSerialized` | Internal → PG format | session_id, rows, serialization_time | Monitoring |

---

## Policies (Event → Command Triggers)

| Policy | Triggered By | Produces Command | Context |
|--------|-------------|-----------------|---------|
| EnforceResourceLimits | ReducerInvoked | TerminateReducer (if over budget) | Runtime |
| PropagateViaCRDT | VectorInserted | BroadcastCRDTDelta | Consensus |
| EvaluateSubscriptions | RowInserted/Updated/Deleted, CRDTMerged | ComputeDelta | Subscription |
| CollectFeedback | DeltaPushed | RecordImplicitFeedback | Intelligence |
| DetectAnomaly | AuthenticationFailed (3x) | SuspendPrincipal | Security |
| TriggerCompaction | WALAppended (threshold) | CreateSnapshot | Storage |
| RebalanceLeader | MemberJoined/Left | ProposeLeaderTransfer | Consensus |
| ScheduleTraining | FeedbackRecorded (batch full) | StartLearningEpoch | Intelligence |
| ActivateBackpressure | DeltaPushed (slow ACK) | PauseSubscription | Subscription |
| RevokeOnViolation | ResourceLimitExceeded (3x) | RevokeModule | Security |

---

## Read Models (CQRS Projections)

| Read Model | Source Events | Purpose | Refresh |
|------------|--------------|---------|---------|
| TableStats | RowInserted/Updated/Deleted | Row counts, size estimates | Real-time |
| IndexStats | VectorSearchExecuted | Search latency, hit rates | 1-minute aggregate |
| SessionDashboard | ClientConnected/Disconnected | Active sessions, protocols | Real-time |
| SubscriptionMap | SubscriptionCreated/Cancelled | Active subscriptions per index | Real-time |
| SecurityDashboard | All Security events | Auth attempts, denials, anomalies | Real-time |
| PerformanceReport | All latency events | P50/P99 latencies, throughput | 5-minute aggregate |
| LearningProgress | LearningEpoch*, SONA* | Model quality over time | Per-epoch |
| ClusterHealth | All Consensus events | Node status, replication lag | Real-time |
