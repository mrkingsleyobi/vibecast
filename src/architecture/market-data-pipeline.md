# Market Data Pipeline Architecture

**Agent:** architecture-agent
**Status:** Phase 1 - Month 1
**Target Latency:** <100μs (Month 1), <50μs (Month 3)

## Overview

High-performance market data pipeline for ingesting, parsing, and distributing real-time market data from multiple exchanges.

## Architecture Diagram

```
┌─────────────────┐
│   Exchanges     │
│  NYSE, NASDAQ   │
└────────┬────────┘
         │ FIX 4.2 / FAST
         ▼
┌─────────────────┐
│  Network Layer  │
│  (TCP Sockets)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  FIX Parser     │
│  <50μs latency  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Normalizer     │
│  Protocol       │
│  Agnostic       │
└────────┬────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Redis Cache  │ │ TimescaleDB  │ │ Subscribers  │
│ (Real-time)  │ │ (Historical) │ │ (Strategies) │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Components

### 1. Network Receiver
**Responsibility:** Receive raw market data packets
**Technology:** C++ with Boost.Asio (Phase 1), DPDK (Phase 2)
**Latency Target:** <20μs

```cpp
class NetworkReceiver {
    boost::asio::io_context io_context_;
    boost::asio::ip::tcp::socket socket_;

public:
    void connect(const std::string& host, int port);
    void start_receive(MessageCallback callback);
    void stop();
};
```

### 2. FIX Parser
**Responsibility:** Parse FIX 4.2 messages
**Technology:** C++ with custom parser (zero-copy)
**Latency Target:** <30μs

```cpp
class FIXParser {
    // Zero-copy parsing
    MarketData parse(const char* buffer, size_t length);

private:
    // Pre-allocated structures
    MemoryPool<MarketData, 10000> pool_;
};
```

### 3. Message Normalizer
**Responsibility:** Convert to protocol-agnostic format
**Technology:** C++
**Latency Target:** <10μs

```cpp
struct NormalizedMarketData {
    uint64_t timestamp_ns;
    uint32_t symbol_id;
    double bid_price;
    double ask_price;
    uint32_t bid_size;
    uint32_t ask_size;
    double last_price;
    uint64_t volume;
};
```

### 4. Distribution Layer
**Responsibility:** Distribute to multiple consumers
**Technology:** Lock-free SPSC queues (Phase 2)
**Latency Target:** <5μs

## Data Flow

### Normal Operation
1. Packet arrives at NIC
2. Network receiver reads packet (<20μs)
3. FIX parser processes message (<30μs)
4. Normalizer converts format (<10μs)
5. Distribution to subscribers (<5μs)
6. Async write to Redis (non-blocking)
7. Async write to TimescaleDB (non-blocking)

**Total Critical Path:** <65μs

### Phase 2 Optimization (Month 4-6)
- Replace Boost.Asio with DPDK
- Implement zero-copy throughout pipeline
- Target: <5μs total latency

## Error Handling

### Connection Loss
```cpp
void on_connection_lost() {
    // Log error
    logger.error("Connection lost to exchange");

    // Trigger reconnection with exponential backoff
    reconnect_with_backoff();

    // Record in AgentDB
    agentdb.record_event("connection_lost", details);
}
```

### Message Gap Detection
```cpp
void check_sequence_gap(uint64_t seq_num) {
    if (seq_num != expected_seq_ + 1) {
        // Gap detected - request retransmission
        request_retransmit(expected_seq_, seq_num);

        // Record in AgentDB
        agentdb.record_learning(
            "market-data",
            "Gap detection triggered retransmit",
            context,
            1.0  // success
        );
    }
    expected_seq_ = seq_num;
}
```

## Performance Monitoring

```cpp
struct PerformanceMetrics {
    LatencyHistogram receive_latency;
    LatencyHistogram parse_latency;
    LatencyHistogram normalize_latency;
    LatencyHistogram total_latency;

    uint64_t messages_received;
    uint64_t messages_dropped;
    uint64_t reconnections;
};
```

## AgentDB Integration

Track all performance metrics:
```python
# Record performance experiment
db.record_optimization(OptimizationExperiment(
    experiment_name="Market Data Pipeline - Phase 1",
    strategy="baseline",
    parameters={"protocol": "FIX 4.2", "transport": "TCP"},
    baseline_metric=0,
    optimized_metric=65.0,  # microseconds
    improvement_pct=0,
    status="completed"
))
```

## Testing Strategy

### Unit Tests
- FIX parser correctness
- Message normalization
- Error handling

### Integration Tests
- End-to-end with mock exchange
- Gap handling
- Reconnection logic

### Performance Tests
- Latency benchmarks (P50, P95, P99)
- Throughput tests (messages/sec)
- Load tests

## Future Optimizations (Roadmap)

### Month 4-6: DPDK Integration
- Expected: 65μs → 2-5μs (96% improvement)
- AgentDB Success Rate: 95%

### Month 13-18: FPGA Offload
- Expected: 2μs → 14ns (99.3% improvement)
- AgentDB Success Rate: 80%

## References

- Implementation Plan: IMPLEMENTATION_PLAN.md (Month 1, Week 3-4)
- AgentDB Learnings: Hardware acceleration (95% success)
- Research: plans/architecture/high-speed-low-latency.md
