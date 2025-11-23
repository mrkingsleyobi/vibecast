# Redis Cluster for Trading Platform

High-availability Redis cluster with 6 nodes (3 masters, 3 replicas) for market data caching and session management.

## Architecture

- **3 Master Nodes**: Ports 7001-7003 (2GB RAM each)
- **3 Replica Nodes**: Ports 7004-7006 (2GB RAM each)
- **Persistence**: AOF (Append-Only File) + RDB snapshots
- **Eviction**: LRU (Least Recently Used) when maxmemory reached

## Usage

### Start Cluster

```bash
cd infrastructure/redis
docker-compose -f cluster-config.yml up -d
```

### Check Cluster Status

```bash
docker exec -it trading-redis-master-1 redis-cli -p 7001 cluster info
docker exec -it trading-redis-master-1 redis-cli -p 7001 cluster nodes
```

### Connect to Cluster

```bash
# From command line
redis-cli -c -p 7001

# From Python
import redis
from redis.cluster import RedisCluster

cluster = RedisCluster(
    startup_nodes=[
        {"host": "localhost", "port": "7001"},
        {"host": "localhost", "port": "7002"},
        {"host": "localhost", "port": "7003"}
    ],
    decode_responses=True
)

# Cache market data
cluster.set("quote:AAPL", json.dumps({"bid": 150.00, "ask": 150.05}))
cluster.expire("quote:AAPL", 60)  # TTL 60 seconds
```

### Stop Cluster

```bash
docker-compose -f cluster-config.yml down
```

### Clean All Data

```bash
docker-compose -f cluster-config.yml down -v
```

## Data Usage Patterns

### Market Data Cache (TTL: 60s)

```python
# Cache real-time quotes
cluster.setex(f"quote:{symbol}", 60, json.dumps(quote_data))

# Cache order book
cluster.setex(f"orderbook:{symbol}", 60, json.dumps(orderbook))

# Cache trade history
cluster.lpush(f"trades:{symbol}", json.dumps(trade))
cluster.ltrim(f"trades:{symbol}", 0, 999)  # Keep last 1000
```

### Session Management (TTL: 3600s)

```python
# Store user session
cluster.setex(f"session:{user_id}", 3600, json.dumps(session_data))

# Store TradeStation OAuth token
cluster.setex(f"oauth:{user_id}", 3600, access_token)
```

### Position Tracking (Persistent)

```python
# Store current positions
cluster.hset(f"positions:{account_id}", symbol, quantity)

# Get all positions
positions = cluster.hgetall(f"positions:{account_id}")
```

## Performance Targets

- **Latency**: <1ms for GET/SET operations
- **Throughput**: >100K ops/sec
- **Availability**: 99.9% uptime with automatic failover

## Monitoring

See `infrastructure/monitoring/prometheus.yml` for Redis metrics collection.

Key metrics:
- `redis_commands_processed_total`
- `redis_connected_clients`
- `redis_memory_used_bytes`
- `redis_keyspace_hits_total`
- `redis_keyspace_misses_total`

## Based On

- AgentDB Learning: In-memory caching reduces latency by 90% (Success Rate: 92%)
- IMPLEMENTATION_PLAN.md Month 1, Week 3-4
