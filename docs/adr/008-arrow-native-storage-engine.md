# ADR-008: Arrow-Native Storage Engine

## Status

Accepted

## Date

2026-02-26

## Context

The fusion engine needs a storage format that supports both relational OLTP workloads (row-oriented inserts/updates) and analytical vector operations (columnar scans, batch embedding comparisons). Apache Arrow provides a standardized columnar format with broad ecosystem support, making it the right choice for 20-year architectural longevity.

## Decision

Use **Apache Arrow** as the canonical in-memory and on-disk representation, with a custom write-ahead log (WAL) and MVCC layer.

### Storage Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Storage Engine                            │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Hot Tier (In-Memory)                                 │  │
│  │  ├── Arrow RecordBatches (current version)            │  │
│  │  ├── MVCC version chains (per-row timestamps)         │  │
│  │  ├── Write-ahead log buffer (pre-flush)               │  │
│  │  └── Column statistics (min/max/null_count/bloom)     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │ flush                             │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │  Warm Tier (SSD)                                      │  │
│  │  ├── Arrow IPC files (sorted, compressed: LZ4/ZSTD)  │  │
│  │  ├── WAL segments (sequential append)                 │  │
│  │  ├── USearch HNSW index files                         │  │
│  │  └── Tantivy full-text index segments                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │ archive                           │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │  Cold Tier (Object Storage)                           │  │
│  │  ├── Parquet files (columnar, high compression)       │  │
│  │  ├── Snapshot manifests (point-in-time metadata)      │  │
│  │  └── Archived WAL segments                            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### MVCC Implementation

```
Row Version Chain:
  ┌────────┐    ┌────────┐    ┌────────┐
  │ v3     │───►│ v2     │───►│ v1     │
  │ ts=105 │    │ ts=100 │    │ ts=95  │
  │ active │    │ visible│    │ gc     │
  └────────┘    └────────┘    └────────┘

Visibility Rules:
  - Transaction T sees version V if:
    V.commit_ts <= T.start_ts AND V.delete_ts > T.start_ts
  - Snapshot isolation by default
  - Serializable via write-write conflict detection

GC Policy:
  - Versions older than oldest active transaction are eligible
  - Background compaction merges versions into Arrow batches
  - Retain at least 2 versions for CRDT conflict resolution
```

### Embedding Storage

```
Table: documents
Columns:
  id:        UInt64 (Arrow)
  title:     Utf8 (Arrow)
  body:      LargeUtf8 (Arrow)
  embedding: FixedSizeList[Float32, 1536] (Arrow)
  created:   Timestamp[us] (Arrow)

Vector Index (USearch):
  Source column: embedding
  Metric: Cosine
  HNSW params: M=16, efConstruction=200
  Quantization: int8 (4x storage reduction)

Full-Text Index (Tantivy):
  Source columns: title, body
  Tokenizer: ICU (Unicode-aware)
  Stored fields: none (lookup via Arrow table)
```

## Consequences

### Positive
- Arrow format is a universal standard — ecosystem interop (Spark, DuckDB, Polars, DataFusion)
- Columnar layout accelerates batch vector operations (SIMD-friendly)
- Three-tier storage optimizes cost (hot=RAM, warm=SSD, cold=S3)
- MVCC enables snapshot isolation without blocking readers
- Parquet archival provides excellent long-term compression

### Negative
- Row-oriented OLTP operations are less efficient in columnar format
- MVCC version chains consume memory proportional to write rate
- Arrow IPC files require periodic compaction to reclaim space
- Three tiers add operational complexity (migration, monitoring)

## Related ADRs
- ADR-001: Fusion Architecture Foundation (Arrow-native principle)
- ADR-002: DDD Bounded Contexts (Storage domain)
- ADR-005: Consensus & CRDT Replication (WAL integration with Raft)
