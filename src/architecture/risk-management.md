# Risk Management System Architecture

**Agent:** architecture-agent
**Based on:** IMPLEMENTATION_PLAN.md Month 2
**Target:** <5μs risk check latency

## Overview

The Risk Management System provides pre-trade and post-trade risk controls to protect against excessive losses and ensure compliance with risk limits.

## Risk Checks

### Pre-Trade Checks (< 5μs)

```cpp
struct RiskLimits {
    // Position limits
    double max_position_size = 1000;          // Max shares per symbol
    double max_total_exposure = 500000;        // Max total dollar exposure
    double max_concentration = 0.25;           // Max 25% in single position

    // Loss limits
    double max_daily_loss = -5000;
    double max_weekly_loss = -15000;
    double max_total_loss = -50000;

    // Order limits
    double max_order_size = 500;
    double max_order_value = 100000;

    // Leverage
    double max_leverage = 2.0;
};

class RiskManager {
public:
    bool check_order(const OrderRequest& order) {
        // 1. Position limit check
        if (!check_position_limit(order)) return false;

        // 2. Loss limit check
        if (!check_loss_limits()) return false;

        // 3. Exposure check
        if (!check_exposure_limit(order)) return false;

        // 4. Order size check
        if (!check_order_size(order)) return false;

        return true;
    }

private:
    bool check_position_limit(const OrderRequest& order) {
        auto position = position_tracker_->get_position(order.account_id, order.symbol);
        double new_position = (position ? position->quantity : 0) + order.quantity;

        return std::abs(new_position) <= limits_.max_position_size;
    }

    bool check_loss_limits() {
        auto summary = position_tracker_->get_account_summary(account_id_);
        return summary.total_pnl >= limits_.max_daily_loss;
    }

    bool check_exposure_limit(const OrderRequest& order) {
        auto summary = position_tracker_->get_account_summary(order.account_id);
        double new_exposure = summary.total_market_value + (order.quantity * order.price);

        return new_exposure <= limits_.max_total_exposure;
    }

    bool check_order_size(const OrderRequest& order) {
        return order.quantity <= limits_.max_order_size &&
               (order.quantity * order.price) <= limits_.max_order_value;
    }
};
```

### Post-Trade Monitoring

- Monitor realized/unrealized P&L
- Alert on limit breaches
- Auto-liquidate if critical limits reached

## Circuit Breakers

```cpp
class CircuitBreaker {
public:
    enum class State { CLOSED, OPEN, HALF_OPEN };

    bool allow_trading() {
        if (state_ == State::OPEN) {
            // Check if cooldown period has passed
            auto now = std::chrono::steady_clock::now();
            if (now - trip_time_ > cooldown_period_) {
                state_ = State::HALF_OPEN;
            } else {
                return false;
            }
        }

        return state_ != State::OPEN;
    }

    void trip() {
        state_ = State::OPEN;
        trip_time_ = std::chrono::steady_clock::now();
        alert_manager_->send_critical_alert("Circuit breaker tripped!");
    }

private:
    State state_ = State::CLOSED;
    std::chrono::steady_clock::time_point trip_time_;
    std::chrono::seconds cooldown_period_{300};  // 5 minutes
};
```

## Alert Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| Daily loss > 80% of limit | Warning | Alert team |
| Daily loss = limit | Critical | Stop all trading |
| Position > 90% of limit | Warning | Alert team |
| Position = limit | Critical | Reject new orders |
| Consecutive losses > 10 | Warning | Review strategy |

## Based On

- Industry standard risk controls
- IMPLEMENTATION_PLAN.md Month 2
- <5μs latency target (Phase 1)
