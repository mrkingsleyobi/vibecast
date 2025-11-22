# Trading Engine Architecture

**Agent:** architecture-agent
**Based on:** IMPLEMENTATION_PLAN.md Month 2, Week 1-2
**Reference:** plans/architecture/high-speed-low-latency.md
**Target:** <50μs signal generation (Phase 1)

---

## Overview

The Trading Engine is the core decision-making system that generates trading signals, manages strategy execution, and coordinates order placement with risk management.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Trading Engine                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │   Market    │─────▶│   Strategy   │─────▶│    Signal    │   │
│  │    Data     │      │   Engine     │      │  Generator   │   │
│  │  Ingestion  │      │              │      │              │   │
│  └─────────────┘      └──────────────┘      └──────────────┘   │
│        │                     │                      │            │
│        │                     │                      │            │
│        ▼                     ▼                      ▼            │
│  ┌─────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │   Feature   │      │     Risk     │      │    Order     │   │
│  │   Store     │─────▶│  Management  │─────▶│   Router     │   │
│  │             │      │              │      │              │   │
│  └─────────────┘      └──────────────┘      └──────────────┘   │
│                              │                      │            │
│                              │                      │            │
│                              ▼                      ▼            │
│                       ┌──────────────┐      ┌──────────────┐   │
│                       │  Position    │      │    Order     │   │
│                       │   Tracker    │      │   Manager    │   │
│                       └──────────────┘      └──────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Market Data Ingestion

**Responsibility:** Receive, normalize, and distribute market data

**Implementation:**
- `MarketDataReceiver` (C++) - Already implemented
- `FIXParser` (C++) - Already implemented
- Redis cache for real-time data

**Data Flow:**
```
Exchange Feed → FIX Parser → Market Data Receiver → Redis Cache → Strategy Engine
                                                    ↓
                                              TimescaleDB
```

**Performance:**
- Latency: <100μs (Phase 1)
- Throughput: >10K messages/sec

---

### 2. Strategy Engine

**Responsibility:** Execute trading strategies and generate signals

**Interface:**
```cpp
class TradingStrategy {
public:
    virtual ~TradingStrategy() = default;

    // Initialize strategy with parameters
    virtual void initialize(const StrategyParams& params) = 0;

    // Process market data update
    virtual Signal on_market_data(const MarketData& data) = 0;

    // Process order fill
    virtual void on_fill(const Fill& fill) = 0;

    // Get strategy state
    virtual StrategyState get_state() const = 0;

    // Start/stop strategy
    virtual void start() = 0;
    virtual void stop() = 0;
};
```

**Built-in Strategies (Phase 1):**

1. **Moving Average Crossover**
   ```cpp
   class MACrossoverStrategy : public TradingStrategy {
   private:
       int fast_period_ = 10;
       int slow_period_ = 30;
       std::deque<double> prices_;

   public:
       Signal on_market_data(const MarketData& data) override {
           prices_.push_back(data.price);
           if (prices_.size() < slow_period_) return Signal::HOLD;

           double fast_ma = calculate_sma(prices_, fast_period_);
           double slow_ma = calculate_sma(prices_, slow_period_);

           if (fast_ma > slow_ma && !has_position()) {
               return Signal::BUY;
           } else if (fast_ma < slow_ma && has_position()) {
               return Signal::SELL;
           }

           return Signal::HOLD;
       }
   };
   ```

2. **Mean Reversion**
   ```cpp
   class MeanReversionStrategy : public TradingStrategy {
   private:
       double bollinger_std_ = 2.0;
       int lookback_period_ = 20;

   public:
       Signal on_market_data(const MarketData& data) override {
           // Calculate Bollinger Bands
           double mean = calculate_mean(prices_, lookback_period_);
           double std = calculate_std(prices_, lookback_period_);

           double upper_band = mean + (bollinger_std_ * std);
           double lower_band = mean - (bollinger_std_ * std);

           if (data.price < lower_band) return Signal::BUY;
           if (data.price > upper_band) return Signal::SELL;

           return Signal::HOLD;
       }
   };
   ```

3. **ML-Driven Strategy (DQN Agent)**
   ```cpp
   class MLStrategy : public TradingStrategy {
   private:
       std::unique_ptr<DQNAgent> agent_;

   public:
       Signal on_market_data(const MarketData& data) override {
           // Extract features
           auto features = feature_extractor_.extract(data);

           // Get action from ML agent
           int action = agent_->act(features, /*training=*/false);

           // Convert to signal
           if (action == 1) return Signal::BUY;
           if (action == 2) return Signal::SELL;
           return Signal::HOLD;
       }
   };
   ```

**Performance Target:**
- Signal generation: <50μs
- Strategy state update: <10μs

---

### 3. Signal Generator

**Responsibility:** Convert strategy decisions into actionable orders

**Data Structure:**
```cpp
struct Signal {
    enum class Action {
        BUY,
        SELL,
        HOLD
    };

    Action action;
    std::string symbol;
    double quantity;
    double confidence;  // 0.0-1.0
    std::string strategy_id;
    std::chrono::system_clock::time_point timestamp;
};

struct OrderRequest {
    std::string symbol;
    Side side;
    OrderType order_type;
    double quantity;
    double price;  // For limit orders
    TimeInForce time_in_force;
    std::string strategy_id;
    std::string account_id;
};
```

**Signal to Order Conversion:**
```cpp
class SignalProcessor {
public:
    OrderRequest convert_signal_to_order(const Signal& signal) {
        OrderRequest order;
        order.symbol = signal.symbol;
        order.side = (signal.action == Signal::Action::BUY) ? Side::Buy : Side::Sell;
        order.quantity = signal.quantity;
        order.strategy_id = signal.strategy_id;

        // Determine order type based on urgency
        if (signal.confidence > 0.8) {
            order.order_type = OrderType::Market;  // High confidence = market order
        } else {
            order.order_type = OrderType::Limit;
            order.price = calculate_limit_price(signal);
        }

        return order;
    }
};
```

---

### 4. Feature Store

**Responsibility:** Provide fast access to calculated features for ML strategies

**Implementation:** See `src/ml/features/store.py`

**Key Features:**
- Price-based: SMA, EMA, RSI, MACD
- Volume-based: VWAP, OBV
- Volatility: Bollinger Bands, ATR
- Custom: ML-generated features

**Cache Structure:**
```python
{
    "AAPL": {
        "sma_10": 150.25,
        "sma_30": 148.50,
        "rsi_14": 65.3,
        "macd": 1.25,
        "bollinger_upper": 152.00,
        "bollinger_lower": 148.00,
        "timestamp": 1700000000
    }
}
```

---

### 5. Risk Management

**Responsibility:** Pre-trade and post-trade risk checks

See detailed design in `src/architecture/risk-management.md`

**Key Checks:**
- Position limits
- Loss limits (daily, weekly, total)
- Exposure limits
- Concentration limits
- Leverage limits

---

### 6. Order Router

**Responsibility:** Route orders to appropriate execution venue

**Implementation:**
```cpp
class OrderRouter {
public:
    void route_order(const OrderRequest& request) {
        // Pre-trade risk check
        if (!risk_manager_->check_order(request)) {
            reject_order(request, "Risk check failed");
            return;
        }

        // Route to execution venue
        if (request.symbol == "AAPL" || request.symbol == "MSFT") {
            // Route to TradeStation
            tradestation_client_->place_order(request);
        } else {
            // Route to other broker
            fallback_broker_->place_order(request);
        }

        // Record in order manager
        order_manager_->accept_order(request.client_order_id, "PENDING");
    }
};
```

---

## Data Flow

### Hot Path (Latency-Critical)

```
Market Data → Strategy Engine → Signal Generator → Risk Check → Order Router
   <100μs         <50μs             <10μs            <5μs         <20μs

Total: <185μs (within Phase 1 target of <200μs)
```

### Cold Path (Non-Latency-Critical)

```
Market Data → TimescaleDB
Fills → Position Tracker → TimescaleDB
Performance Metrics → Prometheus → Grafana
```

---

## Threading Model (Phase 1)

```cpp
// Single-threaded hot path for Phase 1 (simpler, predictable)
void trading_loop() {
    while (running_) {
        // 1. Receive market data (blocking with timeout)
        MarketData data = market_data_queue_.pop(100ms);

        // 2. Update feature store
        feature_store_.update(data);

        // 3. Run all active strategies
        for (auto& strategy : active_strategies_) {
            Signal signal = strategy->on_market_data(data);

            if (signal.action != Signal::Action::HOLD) {
                // 4. Generate order
                OrderRequest order = signal_processor_.convert(signal);

                // 5. Risk check
                if (risk_manager_.check_order(order)) {
                    // 6. Route order
                    order_router_.route_order(order);
                }
            }
        }

        // 7. Process fills (if any)
        process_pending_fills();

        // 8. Record metrics (async)
        metrics_recorder_.record_iteration();
    }
}
```

**Phase 2 Upgrade:** Multi-threaded with lock-free queues
- Thread 1: Market data ingestion
- Thread 2: Strategy execution
- Thread 3: Order routing
- Lock-free SPSC queues between threads

---

## Strategy Lifecycle

```
        [Initialized]
             │
             ▼
        [Started] ◄──┐
             │        │
             ▼        │
  ┌─── [Running] ────┘
  │         │
  │         ▼
  │    [Stopped]
  │         │
  │         ▼
  └──▶ [Paused]
            │
            ▼
       [Terminated]
```

**State Management:**
```cpp
enum class StrategyState {
    Initialized,  // Created but not started
    Running,      // Actively trading
    Stopped,      // Temporarily stopped
    Paused,       // Paused (can be resumed)
    Terminated    // Permanently stopped
};

class StrategyManager {
public:
    void start_strategy(const std::string& strategy_id);
    void stop_strategy(const std::string& strategy_id);
    void pause_strategy(const std::string& strategy_id);
    void resume_strategy(const std::string& strategy_id);
    void terminate_strategy(const std::string& strategy_id);
};
```

---

## Configuration

**Strategy Configuration (YAML):**
```yaml
strategies:
  - id: "ma_crossover_aapl"
    type: "moving_average_crossover"
    symbol: "AAPL"
    account: "ACC001"
    enabled: true
    parameters:
      fast_period: 10
      slow_period: 30
      quantity: 100
    risk_limits:
      max_position: 1000
      max_daily_loss: 5000

  - id: "ml_strategy_spy"
    type: "ml_dqn"
    symbol: "SPY"
    account: "ACC001"
    enabled: true
    parameters:
      model_path: "models/dqn_agent.pkl"
      confidence_threshold: 0.7
```

---

## Performance Monitoring

**Key Metrics:**
```cpp
struct TradingEngineMetrics {
    // Latency
    double avg_signal_latency_us;
    double p99_signal_latency_us;

    // Throughput
    uint64_t signals_generated;
    uint64_t orders_placed;
    uint64_t orders_rejected;

    // Strategy performance
    double total_pnl;
    double win_rate;
    double sharpe_ratio;

    // Errors
    uint64_t strategy_errors;
    uint64_t risk_rejections;
};
```

**Prometheus Metrics:**
- `trading_engine_signal_latency_microseconds`
- `trading_engine_signals_generated_total`
- `trading_engine_orders_placed_total`
- `trading_engine_strategy_pnl{strategy_id="..."}`
- `trading_engine_strategy_win_rate{strategy_id="..."}`

---

## Integration with Other Components

### Market Data Receiver
```cpp
market_data_receiver_->register_callback([this](const MarketData& data) {
    trading_engine_->process_market_data(data);
});
```

### Order Manager
```cpp
order_manager_->register_callback([this](const OrderEvent& event) {
    if (event.type == OrderEvent::Type::OrderFilled) {
        trading_engine_->on_fill(event.order);
    }
});
```

### Position Tracker
```cpp
position_tracker_->register_callback([this](const PositionEvent& event) {
    trading_engine_->on_position_update(event.position);
});
```

---

## Error Handling

```cpp
try {
    Signal signal = strategy->on_market_data(data);
} catch (const StrategyException& e) {
    // Log error
    logger_->error("Strategy error: {}", e.what());

    // Increment error counter
    metrics_.strategy_errors++;

    // Pause strategy if too many errors
    if (strategy->error_count() > 10) {
        strategy_manager_->pause_strategy(strategy->id());
        alert_manager_->send_alert("Strategy paused due to errors");
    }
}
```

---

## Testing Strategy

See `tests/unit/test_framework.cpp` for unit tests

**Test Coverage:**
- Strategy signal generation
- Order creation from signals
- Risk limit enforcement
- Error handling
- Performance benchmarks

---

## Future Enhancements (Phase 2+)

- **Lock-free queues** between components (90% latency reduction)
- **DPDK networking** for market data (96% latency reduction)
- **FPGA signal processing** for ultra-low latency (99% improvement)
- **Multi-strategy portfolio optimization**
- **Real-time backtesting**

---

## Based On

- IMPLEMENTATION_PLAN.md Month 2, Week 1-2
- AgentDB Learning: Hot/cold path separation (92% success rate)
- plans/research/self-learning-platforms.md
- Phase 1 performance targets
