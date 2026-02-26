# ADR-009: PostgreSQL Wire Protocol Compatibility

## Status

Accepted

## Date

2026-02-26

## Context

Enterprise adoption requires compatibility with existing tooling. PostgreSQL's wire protocol (v3) is the de facto standard for SQL databases. Supporting it means every PostgreSQL client library, ORM, BI tool, and migration framework works out-of-the-box. This dramatically reduces adoption friction.

## Decision

Implement a **PostgreSQL wire protocol (v3) frontend** as an anti-corruption layer in the Integration bounded context.

### Protocol Architecture

```
Client (psql/pgAdmin/Prisma/etc.)
    │
    │  PostgreSQL Wire Protocol v3
    │  (TLS 1.3)
    ▼
┌─────────────────────────────────────────────┐
│  Wire Protocol Frontend                      │
│  ├── StartupMessage / SSLRequest handling   │
│  ├── SimpleQuery / ExtendedQuery protocol   │
│  ├── COPY protocol (bulk loading)           │
│  ├── Notification protocol (LISTEN/NOTIFY)  │
│  └── Cancellation protocol                  │
├─────────────────────────────────────────────┤
│  SQL Translation Layer (ACL)                 │
│  ├── pg_catalog emulation (minimal subset)  │
│  ├── Type OID mapping (Arrow ↔ PG types)    │
│  ├── Function translation (pg_* → internal) │
│  └── Vector extension syntax (pgvector SQL) │
├─────────────────────────────────────────────┤
│  Internal Query Engine                       │
└─────────────────────────────────────────────┘
```

### pgvector Compatibility

```sql
-- These pgvector-compatible queries work through the wire protocol:
CREATE TABLE items (embedding vector(1536));
SELECT * FROM items ORDER BY embedding <-> '[0.1, 0.2, ...]' LIMIT 10;
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops);

-- Extension: reactive subscriptions via LISTEN/NOTIFY
LISTEN vector_updates;
-- Client receives NOTIFY when subscribed vector results change
```

### Type Mapping

| PostgreSQL Type | Arrow Type | Notes |
|----------------|------------|-------|
| INT4/INT8 | Int32/Int64 | Direct mapping |
| FLOAT4/FLOAT8 | Float32/Float64 | Direct mapping |
| TEXT/VARCHAR | Utf8 | Length limits enforced at ACL |
| BYTEA | Binary | Direct mapping |
| TIMESTAMP | Timestamp[us] | UTC normalization |
| JSONB | Utf8 (validated) | Stored as JSON string, indexed |
| VECTOR(n) | FixedSizeList[Float32, n] | pgvector compatibility |
| UUID | FixedSizeBinary[16] | Direct mapping |

## Consequences

### Positive
- Every PostgreSQL client library works immediately (40+ languages)
- ORMs (Prisma, SQLAlchemy, ActiveRecord) work with minimal config
- BI tools (Metabase, Grafana, Tableau) can connect directly
- pgvector SQL syntax provides familiar vector query interface
- Migration tooling (pg_dump, Flyway) can be adapted

### Negative
- pg_catalog emulation is complex and incomplete (only minimal subset)
- PostgreSQL-specific SQL features not all translatable (CTEs, window functions: phased)
- Wire protocol overhead vs. native binary protocol (~5-10% latency increase)
- Must track PostgreSQL protocol version changes

## Related ADRs
- ADR-001: Fusion Architecture Foundation
- ADR-002: DDD Bounded Contexts (Integration domain)
- ADR-003: Real-Time Reactive Vector Search (LISTEN/NOTIFY bridge)
