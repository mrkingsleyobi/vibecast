-- TimescaleDB Initialization Script for Trading Platform
-- Time-series database for market data, trades, and performance metrics
--
-- Agent: infrastructure-agent
-- Based on: IMPLEMENTATION_PLAN.md Month 1, Week 1-2
-- Reference: plans/architecture/high-speed-low-latency.md

-- Create extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- Market Data Tables
-- ============================================

-- Quotes (tick data)
CREATE TABLE IF NOT EXISTS quotes (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    bid DECIMAL(12, 4) NOT NULL,
    ask DECIMAL(12, 4) NOT NULL,
    bid_size INTEGER NOT NULL,
    ask_size INTEGER NOT NULL,
    exchange VARCHAR(10),
    PRIMARY KEY (time, symbol)
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('quotes', 'time', if_not_exists => TRUE);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_quotes_symbol_time ON quotes (symbol, time DESC);

-- Compression policy (compress data older than 7 days)
ALTER TABLE quotes SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('quotes', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep data for 1 year)
SELECT add_retention_policy('quotes', INTERVAL '365 days', if_not_exists => TRUE);


-- Trades (executed trades)
CREATE TABLE IF NOT EXISTS trades (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(12, 4) NOT NULL,
    quantity INTEGER NOT NULL,
    side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
    trade_id VARCHAR(50),
    exchange VARCHAR(10),
    PRIMARY KEY (time, symbol, trade_id)
);

SELECT create_hypertable('trades', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_time ON trades (symbol, time DESC);

ALTER TABLE trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('trades', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('trades', INTERVAL '365 days', if_not_exists => TRUE);


-- OHLCV bars (aggregated candles)
CREATE TABLE IF NOT EXISTS ohlcv_bars (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    interval VARCHAR(10) NOT NULL, -- '1min', '5min', '1hour', etc.
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume BIGINT NOT NULL,
    trade_count INTEGER,
    PRIMARY KEY (time, symbol, interval)
);

SELECT create_hypertable('ohlcv_bars', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval_time ON ohlcv_bars (symbol, interval, time DESC);

ALTER TABLE ohlcv_bars SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol, interval',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('ohlcv_bars', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('ohlcv_bars', INTERVAL '730 days', if_not_exists => TRUE);


-- ============================================
-- Trading Activity Tables
-- ============================================

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    time TIMESTAMPTZ NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    client_order_id VARCHAR(50) NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    price DECIMAL(12, 4),
    status VARCHAR(20) NOT NULL,
    filled_quantity DECIMAL(12, 4) DEFAULT 0,
    avg_fill_price DECIMAL(12, 4),
    created_time TIMESTAMPTZ NOT NULL,
    updated_time TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (time, order_id)
);

SELECT create_hypertable('orders', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_orders_account_time ON orders (account_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_orders_symbol_time ON orders (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, time DESC);

ALTER TABLE orders SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'account_id, symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('orders', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('orders', INTERVAL '2555 days', if_not_exists => TRUE); -- 7 years for compliance


-- Fills (executions)
CREATE TABLE IF NOT EXISTS fills (
    time TIMESTAMPTZ NOT NULL,
    fill_id VARCHAR(50) NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    price DECIMAL(12, 4) NOT NULL,
    commission DECIMAL(12, 4) DEFAULT 0,
    exchange VARCHAR(10),
    PRIMARY KEY (time, fill_id)
);

SELECT create_hypertable('fills', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills (order_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_fills_account_time ON fills (account_id, time DESC);

ALTER TABLE fills SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'account_id, symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('fills', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('fills', INTERVAL '2555 days', if_not_exists => TRUE);


-- Positions snapshot
CREATE TABLE IF NOT EXISTS positions (
    time TIMESTAMPTZ NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    avg_price DECIMAL(12, 4) NOT NULL,
    market_value DECIMAL(12, 2),
    unrealized_pnl DECIMAL(12, 2),
    realized_pnl DECIMAL(12, 2),
    PRIMARY KEY (time, account_id, symbol)
);

SELECT create_hypertable('positions', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_positions_account_time ON positions (account_id, time DESC);

ALTER TABLE positions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'account_id, symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('positions', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('positions', INTERVAL '730 days', if_not_exists => TRUE);


-- ============================================
-- Performance Metrics Tables
-- ============================================

-- System performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    time TIMESTAMPTZ NOT NULL,
    component VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12, 4) NOT NULL,
    unit VARCHAR(20),
    PRIMARY KEY (time, component, metric_name)
);

SELECT create_hypertable('performance_metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_perf_component_metric ON performance_metrics (component, metric_name, time DESC);

ALTER TABLE performance_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'component, metric_name',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('performance_metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('performance_metrics', INTERVAL '365 days', if_not_exists => TRUE);


-- Trading strategy performance
CREATE TABLE IF NOT EXISTS strategy_performance (
    time TIMESTAMPTZ NOT NULL,
    strategy_id VARCHAR(50) NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    total_pnl DECIMAL(12, 2) NOT NULL,
    daily_pnl DECIMAL(12, 2) NOT NULL,
    trades_count INTEGER NOT NULL,
    win_rate DECIMAL(5, 4),
    sharpe_ratio DECIMAL(8, 4),
    max_drawdown DECIMAL(12, 2),
    PRIMARY KEY (time, strategy_id, account_id)
);

SELECT create_hypertable('strategy_performance', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_strategy_perf_id ON strategy_performance (strategy_id, time DESC);

ALTER TABLE strategy_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'strategy_id, account_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('strategy_performance', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('strategy_performance', INTERVAL '1095 days', if_not_exists => TRUE);


-- ============================================
-- Continuous Aggregates (Materialized Views)
-- ============================================

-- 1-minute OHLCV from tick data
CREATE MATERIALIZED VIEW IF NOT EXISTS quotes_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    symbol,
    first(bid, time) AS open_bid,
    max(bid) AS high_bid,
    min(bid) AS low_bid,
    last(bid, time) AS close_bid,
    first(ask, time) AS open_ask,
    max(ask) AS high_ask,
    min(ask) AS low_ask,
    last(ask, time) AS close_ask,
    count(*) AS tick_count
FROM quotes
GROUP BY bucket, symbol;

-- Add refresh policy (refresh every 1 minute)
SELECT add_continuous_aggregate_policy('quotes_1min',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);


-- Hourly strategy performance rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS strategy_performance_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    strategy_id,
    account_id,
    last(total_pnl, time) AS total_pnl,
    sum(daily_pnl) AS hourly_pnl,
    sum(trades_count) AS trades_count,
    avg(win_rate) AS avg_win_rate,
    avg(sharpe_ratio) AS avg_sharpe_ratio,
    min(max_drawdown) AS max_drawdown
FROM strategy_performance
GROUP BY bucket, strategy_id, account_id;

SELECT add_continuous_aggregate_policy('strategy_performance_hourly',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);


-- ============================================
-- Utility Functions
-- ============================================

-- Calculate VWAP (Volume Weighted Average Price)
CREATE OR REPLACE FUNCTION calculate_vwap(
    p_symbol VARCHAR,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS DECIMAL(12, 4) AS $$
DECLARE
    vwap DECIMAL(12, 4);
BEGIN
    SELECT
        SUM(price * quantity) / NULLIF(SUM(quantity), 0)
    INTO vwap
    FROM trades
    WHERE symbol = p_symbol
        AND time >= p_start_time
        AND time <= p_end_time;

    RETURN COALESCE(vwap, 0);
END;
$$ LANGUAGE plpgsql;


-- Get latest quote for symbol
CREATE OR REPLACE FUNCTION get_latest_quote(p_symbol VARCHAR)
RETURNS TABLE (
    time TIMESTAMPTZ,
    bid DECIMAL(12, 4),
    ask DECIMAL(12, 4),
    spread DECIMAL(12, 4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.time,
        q.bid,
        q.ask,
        (q.ask - q.bid) AS spread
    FROM quotes q
    WHERE q.symbol = p_symbol
    ORDER BY q.time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Grants and Permissions
-- ============================================

-- Create trading application user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'trading_app') THEN
        CREATE USER trading_app WITH PASSWORD 'change_me_in_production';
    END IF;
END
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO trading_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trading_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO trading_app;


-- ============================================
-- Monitoring and Statistics
-- ============================================

-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create function to get table sizes
CREATE OR REPLACE FUNCTION get_table_sizes()
RETURNS TABLE (
    table_name TEXT,
    total_size TEXT,
    table_size TEXT,
    indexes_size TEXT,
    row_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        schemaname || '.' || tablename AS table_name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
        (SELECT COUNT(*) FROM (SELECT 1 FROM ONLY (schemaname||'.'||tablename)::regclass LIMIT 1000000) x) AS row_count
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Sample Data (for testing)
-- ============================================

-- Insert sample quote
INSERT INTO quotes (time, symbol, bid, ask, bid_size, ask_size, exchange)
VALUES (NOW(), 'AAPL', 150.00, 150.05, 100, 100, 'NASDAQ')
ON CONFLICT DO NOTHING;

-- Insert sample trade
INSERT INTO trades (time, symbol, price, quantity, side, trade_id, exchange)
VALUES (NOW(), 'AAPL', 150.02, 50, 'BUY', 'T001', 'NASDAQ')
ON CONFLICT DO NOTHING;


-- Print success message
DO $$
BEGIN
    RAISE NOTICE 'TimescaleDB initialization complete!';
    RAISE NOTICE 'Created tables: quotes, trades, ohlcv_bars, orders, fills, positions, performance_metrics, strategy_performance';
    RAISE NOTICE 'Created continuous aggregates: quotes_1min, strategy_performance_hourly';
    RAISE NOTICE 'Compression policies: 7-30 days';
    RAISE NOTICE 'Retention policies: 1-7 years';
    RAISE NOTICE 'User created: trading_app (remember to change password in production)';
END $$;
