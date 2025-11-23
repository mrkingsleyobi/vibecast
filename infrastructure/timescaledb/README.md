# TimescaleDB for Trading Platform

Time-series database optimized for market data, trading activity, and performance metrics.

## Features

- **Automatic compression**: 90% storage reduction for older data
- **Continuous aggregates**: Real-time OHLCV bars and performance rollups
- **Retention policies**: Automatic data cleanup (1-7 years based on compliance)
- **High performance**: Optimized for time-series queries

## Tables

### Market Data
- `quotes` - Real-time tick data (bid/ask)
- `trades` - Executed trades
- `ohlcv_bars` - Candlestick data (1min, 5min, 1hour, etc.)

### Trading Activity
- `orders` - Order lifecycle tracking
- `fills` - Trade executions
- `positions` - Position snapshots

### Performance
- `performance_metrics` - System latency/throughput metrics
- `strategy_performance` - Trading strategy P&L and statistics

## Usage

### Start Database

```bash
cd infrastructure/timescaledb
docker-compose up -d
```

### Connect to Database

```bash
# Command line
docker exec -it trading-timescaledb psql -U postgres -d trading_platform

# Python
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="trading_platform",
    user="trading_app",
    password="change_me_in_production"
)
```

### Insert Market Data

```sql
-- Insert quote
INSERT INTO quotes (time, symbol, bid, ask, bid_size, ask_size, exchange)
VALUES (NOW(), 'AAPL', 150.00, 150.05, 100, 100, 'NASDAQ');

-- Insert trade
INSERT INTO trades (time, symbol, price, quantity, side, trade_id, exchange)
VALUES (NOW(), 'AAPL', 150.02, 50, 'BUY', 'T001', 'NASDAQ');
```

### Query Market Data

```sql
-- Get latest quote
SELECT * FROM get_latest_quote('AAPL');

-- Get 1-minute bars (from continuous aggregate)
SELECT * FROM quotes_1min
WHERE symbol = 'AAPL'
  AND bucket >= NOW() - INTERVAL '1 hour'
ORDER BY bucket DESC;

-- Calculate VWAP
SELECT calculate_vwap('AAPL', NOW() - INTERVAL '1 hour', NOW());

-- Get top traded symbols today
SELECT
    symbol,
    COUNT(*) as trade_count,
    SUM(quantity) as total_volume,
    AVG(price) as avg_price
FROM trades
WHERE time >= DATE_TRUNC('day', NOW())
GROUP BY symbol
ORDER BY total_volume DESC
LIMIT 10;
```

### Insert Trading Activity

```python
import psycopg2
from datetime import datetime

conn = psycopg2.connect(...)
cur = conn.cursor()

# Record order
cur.execute("""
    INSERT INTO orders (
        time, order_id, client_order_id, account_id, symbol,
        side, order_type, quantity, price, status,
        created_time, updated_time
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
""", (
    datetime.now(), 'ORD001', 'CLT001', 'ACC001', 'AAPL',
    'BUY', 'LIMIT', 100, 150.00, 'NEW',
    datetime.now(), datetime.now()
))

# Record fill
cur.execute("""
    INSERT INTO fills (
        time, fill_id, order_id, account_id, symbol,
        side, quantity, price, commission, exchange
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
""", (
    datetime.now(), 'FILL001', 'ORD001', 'ACC001', 'AAPL',
    'BUY', 100, 150.02, 1.00, 'NASDAQ'
))

# Record position snapshot
cur.execute("""
    INSERT INTO positions (
        time, account_id, symbol, quantity, avg_price,
        market_value, unrealized_pnl, realized_pnl
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
""", (
    datetime.now(), 'ACC001', 'AAPL', 100, 150.02,
    15002.00, 0.00, 0.00
))

conn.commit()
```

### Record Performance Metrics

```python
# Record system latency
cur.execute("""
    INSERT INTO performance_metrics (
        time, component, metric_name, metric_value, unit
    ) VALUES (%s, %s, %s, %s, %s)
""", (
    datetime.now(), 'fix_parser', 'p99_latency', 8.5, 'microseconds'
))

# Record strategy performance
cur.execute("""
    INSERT INTO strategy_performance (
        time, strategy_id, account_id, total_pnl, daily_pnl,
        trades_count, win_rate, sharpe_ratio, max_drawdown
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
""", (
    datetime.now(), 'DQN_V1', 'ACC001', 5000.00, 250.00,
    50, 0.65, 1.8, -500.00
))

conn.commit()
```

## Maintenance

### Check Database Size

```sql
SELECT * FROM get_table_sizes();
```

### Manual Compression

```sql
SELECT compress_chunk(i) FROM show_chunks('quotes') i;
```

### View Compression Stats

```sql
SELECT
    hypertable_name,
    total_chunks,
    number_compressed_chunks,
    pg_size_pretty(before_compression_total_bytes) AS before_compression,
    pg_size_pretty(after_compression_total_bytes) AS after_compression,
    ROUND((1 - after_compression_total_bytes::numeric / before_compression_total_bytes::numeric) * 100, 2) AS compression_ratio
FROM timescaledb_information.compression_settings cs
JOIN timescaledb_information.hypertables h ON cs.hypertable_schema = h.hypertable_schema
    AND cs.hypertable_name = h.hypertable_name;
```

### Backup and Restore

```bash
# Backup
docker exec trading-timescaledb pg_dump -U postgres trading_platform > backup.sql

# Restore
docker exec -i trading-timescaledb psql -U postgres trading_platform < backup.sql
```

## Performance Tuning

### Query Performance

```sql
-- Enable query timing
\timing on

-- Analyze query plan
EXPLAIN ANALYZE
SELECT * FROM quotes
WHERE symbol = 'AAPL'
  AND time >= NOW() - INTERVAL '1 hour';
```

### Index Usage

```sql
-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## Monitoring

Key metrics exposed to Prometheus:
- Query latency (p50, p95, p99)
- Table sizes and row counts
- Compression ratios
- Index hit rates

## Based On

- AgentDB Learning: TimescaleDB reduces query time by 85% for time-series data (Success Rate: 90%)
- IMPLEMENTATION_PLAN.md Month 1, Week 1-2
- Retention policies based on compliance requirements
