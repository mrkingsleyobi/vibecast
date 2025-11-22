# Monitoring Stack for Trading Platform

Complete monitoring solution with Prometheus, Grafana, and Alertmanager.

## Components

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization dashboards
- **Alertmanager**: Alert routing and notifications
- **Node Exporter**: System metrics
- **Redis Exporter**: Redis cluster metrics
- **PostgreSQL Exporter**: TimescaleDB metrics
- **cAdvisor**: Container metrics

## Quick Start

### Start Monitoring Stack

```bash
# Create network first (if not exists)
docker network create trading-network

# Start all monitoring services
cd infrastructure/monitoring
docker-compose up -d
```

### Access Services

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### View Dashboards

1. Open Grafana at http://localhost:3000
2. Navigate to Dashboards → Trading Platform
3. Select "Trading Platform Overview"

## Metrics Collected

### Performance Metrics (Phase 1 Targets)

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| FIX Parser P99 Latency | <10μs | >10μs (warning), >20μs (critical) |
| Order Manager P99 Latency | <5μs | >5μs (warning) |
| Market Data P99 Latency | <100μs | >100μs (warning) |
| Market Data Throughput | >1000 msg/s | <1000 msg/s (warning) |

### System Metrics

- CPU usage per core
- Memory usage (total, available, cached)
- Disk I/O (read/write rates, latency)
- Network I/O (packets, bytes, errors)
- Disk space utilization

### Application Metrics

- Request rates and latency distributions
- Error rates and types
- Active connections
- Queue depths
- Cache hit/miss rates

### Trading Metrics

- Orders per second
- Fill rates
- Daily P&L
- Position sizes
- ML agent win rate
- Strategy performance

## Custom Metrics Export

### Python (using prometheus_client)

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import time

# Define metrics
fix_parser_latency = Histogram(
    'fix_parser_latency_microseconds',
    'FIX parser latency in microseconds',
    buckets=[1, 2, 5, 10, 20, 50, 100]
)

orders_processed = Counter(
    'orders_processed_total',
    'Total orders processed'
)

ml_agent_win_rate = Gauge(
    'ml_agent_win_rate',
    'ML agent win rate (0.0-1.0)'
)

# Start metrics server
start_http_server(9200)  # Expose on port 9200

# Record metrics
with fix_parser_latency.time():
    # ... parse FIX message
    pass

orders_processed.inc()
ml_agent_win_rate.set(0.65)
```

### C++ (using prometheus-cpp)

```cpp
#include <prometheus/counter.h>
#include <prometheus/histogram.h>
#include <prometheus/registry.h>
#include <prometheus/exposer.h>

// Create registry
auto registry = std::make_shared<prometheus::Registry>();

// Create exposer
prometheus::Exposer exposer{"0.0.0.0:9201"};
exposer.RegisterCollectable(registry);

// Define metrics
auto& order_counter = prometheus::BuildCounter()
    .Name("orders_processed_total")
    .Help("Total orders processed")
    .Register(*registry);

auto& order_family = order_counter.Add({{"component", "order_manager"}});

auto& latency_histogram = prometheus::BuildHistogram()
    .Name("order_manager_latency_microseconds")
    .Help("Order manager latency")
    .Register(*registry);

auto& latency_family = latency_histogram.Add(
    {{"component", "order_manager"}},
    prometheus::Histogram::BucketBoundaries{1, 2, 5, 10, 20, 50}
);

// Record metrics
order_family.Increment();
latency_family.Observe(3.5);  // 3.5 microseconds
```

## Alerting

### Alert Rules

Alerts are defined in `alerts/trading-platform.yml`:

- **Latency alerts**: FIX parser, Order manager, Market data
- **Error rate alerts**: All components
- **System health**: Redis, TimescaleDB, CPU, Memory, Disk
- **Trading alerts**: Daily loss limit, Position limits, Rate limiting
- **ML alerts**: Win rate, Inference latency

### Configure Notifications

Edit `alertmanager.yml` to add:

1. **Slack notifications**:
```yaml
slack_configs:
  - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
    channel: '#trading-alerts'
```

2. **Email notifications**:
```yaml
email_configs:
  - to: 'team@trading-platform.com'
    from: 'alerts@trading-platform.com'
    smarthost: 'smtp.gmail.com:587'
    auth_username: 'alerts@trading-platform.com'
    auth_password: 'your-password'
```

3. **PagerDuty** (for critical alerts):
```yaml
pagerduty_configs:
  - service_key: 'YOUR-PAGERDUTY-KEY'
```

## Dashboards

### Pre-configured Dashboards

1. **Trading Platform Overview**
   - Component latency (FIX parser, Order manager, Market data)
   - Throughput and error rates
   - System health (Redis, TimescaleDB, CPU, Memory)
   - ML agent performance
   - Daily P&L

2. **System Resources** (via Node Exporter)
   - CPU usage per core
   - Memory breakdown
   - Disk I/O
   - Network traffic

3. **Redis Cluster** (via Redis Exporter)
   - Commands per second
   - Hit/miss ratio
   - Memory usage
   - Connected clients

4. **TimescaleDB** (via PostgreSQL Exporter)
   - Query performance
   - Connection pool usage
   - Table sizes
   - Compression ratios

### Create Custom Dashboard

1. Open Grafana → Create → Dashboard
2. Add Panel → Query Prometheus
3. Example query:
```promql
rate(orders_processed_total[5m])
```
4. Save dashboard to `grafana/dashboards/`

## Queries

### Useful PromQL Queries

```promql
# Average latency over 5 minutes
rate(fix_parser_latency_microseconds_sum[5m]) / rate(fix_parser_latency_microseconds_count[5m])

# 99th percentile latency
histogram_quantile(0.99, rate(order_manager_latency_microseconds_bucket[5m]))

# Error rate percentage
rate(fix_parser_errors_total[5m]) / rate(fix_parser_messages_total[5m]) * 100

# Top 5 symbols by trade volume
topk(5, sum by (symbol) (rate(trades_total[1h])))

# Daily P&L trend
sum(increase(strategy_daily_pnl[1d]))
```

## Performance Targets Monitoring

Monitor Phase 1 targets:

```promql
# Alert if FIX parser exceeds 10μs P99
ALERTS FOR fix_parser_p99_latency_microseconds > 10

# Alert if order manager exceeds 5μs P99
ALERTS FOR order_manager_p99_latency_microseconds > 5

# Alert if market data exceeds 100μs P99
ALERTS FOR market_data_p99_latency_microseconds > 100

# Alert if ML win rate drops below 65%
ALERTS FOR ml_agent_win_rate < 0.65
```

## Maintenance

### View Logs

```bash
# Prometheus logs
docker logs trading-prometheus

# Grafana logs
docker logs trading-grafana

# Alertmanager logs
docker logs trading-alertmanager
```

### Reload Configuration

```bash
# Reload Prometheus config (without restart)
curl -X POST http://localhost:9090/-/reload

# Restart Grafana to reload dashboards
docker restart trading-grafana
```

### Backup

```bash
# Backup Prometheus data
docker run --rm -v prometheus-data:/data -v $(pwd):/backup alpine tar czf /backup/prometheus-backup.tar.gz /data

# Backup Grafana dashboards
docker run --rm -v grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-backup.tar.gz /data
```

## Based On

- AgentDB Learning: Real-time monitoring improves response time by 90% (Success Rate: 95%)
- IMPLEMENTATION_PLAN.md Month 1, Week 1-2
- Phase 1 performance targets from research
