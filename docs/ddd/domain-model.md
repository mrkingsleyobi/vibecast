# Domain Model — SpacetimeDB × ruvector Fusion

## Ubiquitous Language

| Term | Definition | Context |
|------|-----------|---------|
| **Reducer** | User-defined WASM function that mutates database state within a transaction | Runtime |
| **Embedding** | Dense vector representation of data (text, image, etc.) in N-dimensional space | Intelligence |
| **Subscription** | A persistent query registered by a client that triggers push updates on result changes | Subscription |
| **Delta** | The computed difference between consecutive subscription result sets | Subscription |
| **RecordBatch** | An Arrow-format columnar data chunk containing rows for one or more columns | Storage |
| **WAL Segment** | A sequential, append-only log of committed writes for crash recovery | Storage |
| **HNSW Graph** | Hierarchical Navigable Small World graph index for approximate nearest neighbor search | Query Engine |
| **Raft Log** | Ordered sequence of proposed state changes replicated across cluster nodes | Consensus |
| **CRDT** | Conflict-free Replicated Data Type — a data structure that merges without coordination | Consensus |
| **Principal** | An authenticated entity (user, service, module) with a claims set | Security |
| **Claims Set** | A collection of permissions granted to a principal for specific operations on resources | Security |
| **Wire Session** | A PostgreSQL wire protocol connection from an external client | Integration |
| **Learning Epoch** | A training cycle that updates GNN weights based on accumulated feedback | Intelligence |
| **Fuel** | A metering unit for WASM execution cost, consumed per instruction and host call | Runtime |
| **Backpressure** | Throttling mechanism that slows push delivery when clients can't keep up | Subscription |

---

## Bounded Context: Storage

### Aggregate: Table

```
Table (Aggregate Root)
├── TableId: UUID
├── Name: String (unique per database)
├── Schema: ArrowSchema
│   ├── columns: Vec<ColumnDef>
│   │   ├── name: String
│   │   ├── data_type: ArrowDataType
│   │   ├── nullable: bool
│   │   └── metadata: HashMap<String, String>
│   └── version: u64
├── Partitions: Vec<Partition>
│   ├── PartitionId: UUID
│   ├── RecordBatches: Vec<RecordBatch>  (Arrow format)
│   ├── RowCount: u64
│   └── Statistics: ColumnStats
├── Indices: Vec<IndexRef>
│   ├── IndexId: UUID
│   ├── Type: { BTree | HNSW | FullText }
│   └── Columns: Vec<ColumnName>
└── MVCCState
    ├── ActiveTransactions: BTreeSet<TxId>
    ├── VersionChains: HashMap<RowId, Vec<RowVersion>>
    └── GCWatermark: TxId
```

**Invariants:**
- Schema changes require no active transactions on the table
- MVCC versions are strictly ordered by commit timestamp
- GC watermark never advances past the oldest active transaction
- RowId is globally unique within a table

### Aggregate: WALSegment

```
WALSegment (Aggregate Root)
├── SegmentId: u64 (monotonically increasing)
├── Entries: Vec<WALEntry>
│   ├── LSN: u64 (log sequence number)
│   ├── TxId: TxId
│   ├── Operation: { Insert | Update | Delete | DDL | Checkpoint }
│   ├── TableId: UUID
│   ├── Payload: Bytes (Arrow IPC encoded)
│   └── Timestamp: HLCTimestamp
├── FirstLSN: u64
├── LastLSN: u64
├── Checksum: Blake3Hash
└── State: { Active | Sealed | Archived }
```

**Invariants:**
- LSN is strictly monotonic within a segment
- Sealed segments are immutable
- Checksum covers all entries (tamper detection)
- Only one Active segment at a time

---

## Bounded Context: Query Engine

### Aggregate: QueryPlan

```
QueryPlan (Aggregate Root)
├── PlanId: UUID
├── OriginalSQL: String
├── AST: ParsedStatement
├── LogicalPlan: LogicalPlanNode
│   ├── Scan | Filter | Project | Join | Sort | Limit
│   ├── VectorSearch { index, query_vec, k, metric }
│   └── FullTextSearch { index, query, config }
├── PhysicalPlan: PhysicalPlanNode
│   ├── Cost: f64 (estimated)
│   ├── Cardinality: u64 (estimated)
│   └── ExecutionStrategy: { Sequential | Parallel | Hybrid }
├── SecurityContext: ClaimsSet
└── Subscriptions: Vec<SubscriptionRef>  (if reactive)
```

### Aggregate: VectorIndex

```
VectorIndex (Aggregate Root)
├── IndexId: UUID
├── TableId: UUID
├── ColumnName: String
├── Dimensions: u32
├── Metric: { Cosine | L2 | InnerProduct }
├── HNSWParams
│   ├── M: u32 (default: 16)
│   ├── EfConstruction: u32 (default: 200)
│   └── EfSearch: u32 (default: 100)
├── Quantization: { None | Int8 | Int4 | Float16 }
├── VectorCount: u64
├── GNNWeights: Option<ModelRef>  (if learning enabled)
└── Version: u64 (CRDT-compatible)
```

---

## Bounded Context: Subscription

### Aggregate: ClientSession

```
ClientSession (Aggregate Root)
├── SessionId: UUID
├── PrincipalId: UUID
├── Protocol: { Native | WebSocket | WireProtocol }
├── ConnectedAt: Timestamp
├── State: { Active | Paused | Draining | Disconnected }
├── Subscriptions: Vec<Subscription>
│   ├── SubscriptionId: UUID
│   ├── Query: QueryPlan
│   ├── CurrentResults: ResultSet (cached)
│   ├── BoundaryDistance: f32  (k-th result distance)
│   ├── LastPushAt: Timestamp
│   └── BackpressureState: { Normal | Batched | Polling | Paused }
├── PendingDeltas: VecDeque<Delta>
└── ReconnectGracePeriod: Duration (default: 30s)
```

**Invariants:**
- Each session has at most 100 active subscriptions (configurable)
- Deltas are delivered in causal order (vector clocks)
- Paused subscriptions accumulate deltas but don't push
- Disconnected sessions enter grace period before cleanup

### Value Object: Delta

```
Delta (Value Object)
├── DeltaType: { Initial | Incremental | Full }
├── Added: Vec<Row>
├── Removed: Vec<RowId>
├── Updated: Vec<(RowId, Row)>
├── VectorClock: VectorClock
└── ComputedAt: Timestamp
```

---

## Bounded Context: Runtime

### Aggregate: WasmModule

```
WasmModule (Aggregate Root)
├── ModuleId: UUID
├── ContentHash: Blake3Hash
├── Source: { Upload | Registry }
├── Reducers: Vec<ReducerDef>
│   ├── Name: String
│   ├── Params: Vec<(String, WasmType)>
│   ├── ReturnType: WasmType
│   ├── Permissions: Vec<Permission>
│   └── FuelBudget: u64
├── CompiledArtifact: Option<CachedNativeCode>
├── ResourceLimits
│   ├── MaxMemory: u64 (default: 256MB)
│   ├── MaxCPU: Duration (default: 10s)
│   ├── MaxHostCalls: u32 (default: 1000)
│   └── AllowedHostFunctions: HashSet<String>
└── State: { Pending | Compiled | Active | Suspended | Revoked }
```

### Entity: ReducerInvocation

```
ReducerInvocation (Entity)
├── InvocationId: UUID
├── ModuleId: UUID
├── ReducerName: String
├── Caller: PrincipalId
├── Arguments: Vec<Value>
├── FuelConsumed: u64
├── HostCallsExecuted: Vec<HostCallRecord>
├── Result: { Success(Value) | Error(String) | Timeout | FuelExhausted }
├── StartedAt: Timestamp
├── CompletedAt: Option<Timestamp>
└── TransactionId: TxId
```

---

## Bounded Context: Consensus

### Aggregate: RaftNode

```
RaftNode (Aggregate Root)
├── NodeId: u64
├── Role: { Leader | Follower | Candidate | Learner }
├── CurrentTerm: u64
├── VotedFor: Option<u64>
├── Log: Vec<RaftEntry>
│   ├── Term: u64
│   ├── Index: u64
│   ├── Command: { Write | Config | Snapshot }
│   └── Data: Bytes
├── CommitIndex: u64
├── LastApplied: u64
├── Membership: ClusterMembership
│   ├── Voters: HashSet<u64>
│   ├── Learners: HashSet<u64>
│   └── JointConsensus: Option<(HashSet<u64>, HashSet<u64>)>
└── SnapshotState
    ├── LastIncludedIndex: u64
    ├── LastIncludedTerm: u64
    └── SnapshotData: Option<Bytes>
```

### Aggregate: CRDTDocument

```
CRDTDocument (Aggregate Root)
├── DocumentId: UUID
├── Type: { ORSet | LWWRegister | GCounter | PNCounter }
├── State: CRDTState (type-specific)
├── VectorClock: HashMap<NodeId, u64>
├── Tombstones: Vec<(OperationId, Timestamp)>
├── MergeHistory: Vec<MergeEvent>
│   ├── FromNode: u64
│   ├── Operations: u32
│   ├── MergedAt: Timestamp
│   └── ConflictsResolved: u32
└── CompactionState
    ├── LastCompactedAt: Timestamp
    ├── TombstonesGCd: u64
    └── SizeBeforeCompaction: u64
```

---

## Bounded Context: Intelligence

### Aggregate: EmbeddingModel

```
EmbeddingModel (Aggregate Root)
├── ModelId: UUID
├── Name: String
├── Format: ONNX
├── Dimensions: u32
├── TokenizerConfig: TokenizerType
├── Version: SemanticVersion
├── Signature: Ed25519Signature  (tamper protection)
├── Performance
│   ├── AvgLatency: Duration
│   ├── Throughput: f32 (embeddings/sec)
│   └── QualityScore: f32 (recall@10)
└── State: { Loading | Ready | Degraded | Retired }
```

### Aggregate: LearningEpoch

```
LearningEpoch (Aggregate Root)
├── EpochId: UUID
├── ModelId: UUID
├── TrainingData
│   ├── QueryPatterns: u64
│   ├── ClickFeedback: u64
│   ├── ImplicitSignals: u64
│   └── TimeRange: (Timestamp, Timestamp)
├── EWCState
│   ├── FisherMatrix: SparseMatrix
│   ├── PreviousWeights: ModelWeights
│   ├── Lambda: f64
│   └── DecayRate: f64
├── Results
│   ├── RecallImprovement: f32
│   ├── LatencyImpact: Duration
│   ├── WeightsUpdated: u64
│   └── ForgettingPrevented: u64 (EWC++ saves)
└── State: { Collecting | Training | Validating | Applied | Rolled Back }
```

---

## Bounded Context: Security

### Aggregate: Principal

```
Principal (Aggregate Root)
├── PrincipalId: UUID
├── Type: { User | Service | Module | System }
├── Credentials
│   ├── PasswordHash: Argon2idHash (for User)
│   ├── APIKeyHash: HMACSHA256 (for Service)
│   ├── Certificate: X509Cert (for mTLS)
│   └── ModuleHash: Blake3Hash (for Module)
├── ClaimsSets: Vec<ClaimsSet>
│   ├── ClaimsSetId: UUID
│   ├── Database: String
│   ├── Tables: Vec<TablePermission>
│   │   ├── TableName: String
│   │   ├── Operations: HashSet<{ Read | Write | Delete | Admin }>
│   │   └── RowLevelPolicy: Option<PredicateFn>
│   ├── VectorIndices: Vec<IndexPermission>
│   ├── Reducers: Vec<ReducerPermission>
│   ├── IssuedAt: Timestamp
│   └── ExpiresAt: Timestamp
├── AuditTrail: Vec<AuditEntry>
└── State: { Active | Suspended | Revoked }
```

---

## Bounded Context: Integration

### Aggregate: WireSession

```
WireSession (Aggregate Root)
├── SessionId: UUID
├── PrincipalId: UUID
├── ProtocolVersion: u32 (PostgreSQL v3 = 196608)
├── Parameters: HashMap<String, String>
│   ├── client_encoding: UTF8
│   ├── server_version: "driftbase-1.0"
│   ├── standard_conforming_strings: "on"
│   └── application_name: String
├── State: { Startup | Authenticated | Ready | InQuery | InCopy | Closing }
├── PreparedStatements: HashMap<String, PreparedStatement>
├── Portals: HashMap<String, Portal>
├── TransactionState: { Idle | InTransaction | Failed }
└── TypeMap: TypeOIDMapping
```

---

## Domain Event Flows

### Write Path (OLTP + Vector)

```
Client INSERT
    │
    ▼
ReducerInvoked ──► TransactionStarted ──► RowInserted ──► EmbeddingGenerated
    │                                          │                    │
    ▼                                          ▼                    ▼
FuelConsumed                             WALAppended          VectorInserted
                                               │                    │
                                               ▼                    ▼
                                         RaftCommitted       CRDTBroadcasted
                                               │                    │
                                               ▼                    ▼
                                     TransactionCommitted    IndexUpdated
                                               │                    │
                                               └────────┬───────────┘
                                                        ▼
                                              SubscriptionDeltaComputed
                                                        │
                                                        ▼
                                                  DeltaPushed (to all affected clients)
```

### Query Path (Hybrid)

```
Client SELECT ... ORDER BY embedding <-> $vec WHERE category = 'x' LIMIT 10
    │
    ▼
QueryParsed ──► PlanOptimized ──► VectorSearchExecuted + FilterApplied
    │                                        │
    ▼                                        ▼
SecurityChecked                    HybridResultsMerged
    │                                        │
    ▼                                        ▼
ClaimsValidated                     ResultSerialized ──► DeltaPushed (if subscription)
                                             │
                                             ▼
                                     GNNEnhanced (if learning enabled)
                                             │
                                             ▼
                                     FeedbackCollected (implicit: latency, result count)
```

---

## Anti-Corruption Layer Contracts

### Runtime → Query Engine ACL

```rust
// Runtime produces ReducerResult, ACL translates to query-compatible types
trait ReducerResultTranslator {
    fn translate_insert(&self, result: WasmValue) -> Result<ArrowRecordBatch>;
    fn translate_query(&self, result: WasmValue) -> Result<QueryResult>;
    fn validate_types(&self, wasm_types: &[WasmType], arrow_schema: &Schema) -> Result<()>;
}
```

### Integration → Query Engine ACL

```rust
// Wire protocol produces PostgreSQL AST, ACL translates to internal query types
trait WireQueryTranslator {
    fn translate_simple(&self, sql: &str) -> Result<InternalQuery>;
    fn translate_extended(&self, stmt: &PreparedStatement, params: &[PgValue]) -> Result<InternalQuery>;
    fn map_types_pg_to_arrow(&self, pg_type: PgType) -> Result<ArrowDataType>;
    fn map_types_arrow_to_pg(&self, arrow_type: &ArrowDataType) -> Result<PgType>;
}
```

### Intelligence → Query Engine OHS (Open Host Service)

```rust
// Intelligence exposes vector operations as a published API
trait VectorSearchService {
    async fn search(&self, index: &IndexId, query: &[f32], k: usize) -> Result<Vec<SearchResult>>;
    async fn search_filtered(&self, index: &IndexId, query: &[f32], k: usize, filter: &Predicate) -> Result<Vec<SearchResult>>;
    async fn enhance_with_gnn(&self, results: Vec<SearchResult>) -> Result<Vec<SearchResult>>;
    async fn generate_embedding(&self, model: &ModelId, input: &str) -> Result<Vec<f32>>;
}
```
