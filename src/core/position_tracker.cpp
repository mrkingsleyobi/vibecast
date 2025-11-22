/**
 * Position Tracker - Phase 1 Implementation
 *
 * Real-time position tracking and P&L calculation
 * Target: <2μs position update latency
 *
 * Agent: backend-agent
 * Based on: IMPLEMENTATION_PLAN.md Month 2, Week 1-2
 * Reference: plans/architecture/high-speed-low-latency.md
 */

#include <string>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <atomic>
#include <chrono>
#include <iostream>
#include <iomanip>
#include <functional>

/**
 * Position - Represents a trading position in a symbol
 */
struct Position {
    std::string symbol;
    std::string account_id;

    double quantity;          // Current position size (+ long, - short)
    double avg_price;         // Average entry price
    double market_price;      // Current market price

    double realized_pnl;      // Realized P&L from closed trades
    double unrealized_pnl;    // Unrealized P&L on open position
    double total_pnl;         // Total P&L (realized + unrealized)

    double market_value;      // Position market value
    double cost_basis;        // Original cost

    std::chrono::system_clock::time_point last_update;

    Position()
        : quantity(0.0)
        , avg_price(0.0)
        , market_price(0.0)
        , realized_pnl(0.0)
        , unrealized_pnl(0.0)
        , total_pnl(0.0)
        , market_value(0.0)
        , cost_basis(0.0)
        , last_update(std::chrono::system_clock::now())
    {}

    Position(const std::string& sym, const std::string& acct)
        : symbol(sym)
        , account_id(acct)
        , quantity(0.0)
        , avg_price(0.0)
        , market_price(0.0)
        , realized_pnl(0.0)
        , unrealized_pnl(0.0)
        , total_pnl(0.0)
        , market_value(0.0)
        , cost_basis(0.0)
        , last_update(std::chrono::system_clock::now())
    {}

    // Calculate unrealized P&L
    void calculate_unrealized_pnl() {
        if (std::abs(quantity) < 0.0001) {
            unrealized_pnl = 0.0;
        } else {
            unrealized_pnl = (market_price - avg_price) * quantity;
        }
        total_pnl = realized_pnl + unrealized_pnl;
    }

    // Calculate market value
    void calculate_market_value() {
        market_value = market_price * std::abs(quantity);
        cost_basis = avg_price * std::abs(quantity);
    }

    // Check if position is flat
    bool is_flat() const {
        return std::abs(quantity) < 0.0001;
    }

    // Check if position is long
    bool is_long() const {
        return quantity > 0.0001;
    }

    // Check if position is short
    bool is_short() const {
        return quantity < -0.0001;
    }
};

/**
 * Account Summary - Aggregate position info for an account
 */
struct AccountSummary {
    std::string account_id;

    double cash_balance;
    double total_market_value;
    double total_unrealized_pnl;
    double total_realized_pnl;
    double total_pnl;
    double equity;            // Cash + market value

    int long_positions;
    int short_positions;
    int total_positions;

    AccountSummary()
        : cash_balance(0.0)
        , total_market_value(0.0)
        , total_unrealized_pnl(0.0)
        , total_realized_pnl(0.0)
        , total_pnl(0.0)
        , equity(0.0)
        , long_positions(0)
        , short_positions(0)
        , total_positions(0)
    {}
};

/**
 * Position Update Event
 */
struct PositionEvent {
    enum class Type {
        PositionOpened,
        PositionIncreased,
        PositionDecreased,
        PositionClosed,
        PositionReversed,
        PriceUpdate
    };

    Type type;
    std::shared_ptr<Position> position;
    double change_quantity;
    double change_pnl;
};

/**
 * Position Tracker Metrics
 */
struct PositionTrackerMetrics {
    std::atomic<uint64_t> updates_processed{0};
    std::atomic<uint64_t> positions_opened{0};
    std::atomic<uint64_t> positions_closed{0};
    std::atomic<uint64_t> total_update_time_ns{0};

    double avg_update_time_us() const {
        return updates_processed > 0 ?
            (total_update_time_ns.load() / updates_processed.load()) / 1000.0 : 0.0;
    }

    void print() const {
        std::cout << "\n=== Position Tracker Metrics ===\n";
        std::cout << "Updates Processed: " << updates_processed << "\n";
        std::cout << "Positions Opened: " << positions_opened << "\n";
        std::cout << "Positions Closed: " << positions_closed << "\n";
        std::cout << "Avg Update Time: " << avg_update_time_us() << " μs\n";
        std::cout << "================================\n\n";
    }
};

/**
 * Position Tracker - High-performance position and P&L tracking
 *
 * AgentDB Learning: Lock-based tracking for Phase 1, lock-free for Phase 2
 * Target: <2μs position update latency
 */
class PositionTracker {
public:
    using PositionCallback = std::function<void(const PositionEvent&)>;

private:
    // Position storage: account_id -> symbol -> Position
    std::unordered_map<std::string,
        std::unordered_map<std::string, std::shared_ptr<Position>>> positions_;

    // Account cash balances
    std::unordered_map<std::string, double> cash_balances_;

    // Thread safety (Phase 1 - will be lock-free in Phase 2)
    mutable std::mutex mutex_;

    // Callbacks
    std::vector<PositionCallback> callbacks_;

    // Metrics
    PositionTrackerMetrics metrics_;

    void notify_callbacks(const PositionEvent& event) {
        for (const auto& callback : callbacks_) {
            try {
                callback(event);
            } catch (const std::exception& e) {
                std::cerr << "[PositionTracker] Callback error: " << e.what() << "\n";
            }
        }
    }

    void record_update_time(uint64_t ns) {
        metrics_.total_update_time_ns += ns;
        metrics_.updates_processed++;
    }

public:
    PositionTracker() = default;

    /**
     * Initialize account with cash balance
     */
    void initialize_account(const std::string& account_id, double initial_cash) {
        std::lock_guard<std::mutex> lock(mutex_);
        cash_balances_[account_id] = initial_cash;
        std::cout << "[PositionTracker] Account " << account_id
                  << " initialized with $" << std::fixed << std::setprecision(2)
                  << initial_cash << "\n";
    }

    /**
     * Process fill (trade execution)
     */
    void process_fill(
        const std::string& account_id,
        const std::string& symbol,
        double quantity,     // + for buy, - for sell
        double price,
        double commission = 0.0
    ) {
        auto start = std::chrono::high_resolution_clock::now();

        std::lock_guard<std::mutex> lock(mutex_);

        // Get or create position
        auto& account_positions = positions_[account_id];
        auto it = account_positions.find(symbol);

        std::shared_ptr<Position> position;
        bool is_new = false;

        if (it == account_positions.end()) {
            position = std::make_shared<Position>(symbol, account_id);
            account_positions[symbol] = position;
            is_new = true;
        } else {
            position = it->second;
        }

        // Track the change
        double old_quantity = position->quantity;
        PositionEvent::Type event_type;

        // Update position
        if (std::abs(old_quantity) < 0.0001) {
            // Opening new position
            position->quantity = quantity;
            position->avg_price = price;
            event_type = PositionEvent::Type::PositionOpened;
            metrics_.positions_opened++;
        } else if ((old_quantity > 0 && quantity > 0) || (old_quantity < 0 && quantity < 0)) {
            // Increasing position (same direction)
            double total_cost = (position->avg_price * std::abs(old_quantity)) +
                               (price * std::abs(quantity));
            double total_quantity = std::abs(old_quantity) + std::abs(quantity);
            position->avg_price = total_cost / total_quantity;
            position->quantity += quantity;
            event_type = PositionEvent::Type::PositionIncreased;
        } else {
            // Closing or reducing position (opposite direction)
            double close_quantity = std::min(std::abs(quantity), std::abs(old_quantity));
            double pnl_per_share = (old_quantity > 0) ?
                (price - position->avg_price) : (position->avg_price - price);
            double realized = pnl_per_share * close_quantity;

            position->realized_pnl += realized;
            position->quantity += quantity;

            if (std::abs(position->quantity) < 0.0001) {
                // Position closed
                event_type = PositionEvent::Type::PositionClosed;
                metrics_.positions_closed++;
            } else if ((old_quantity > 0 && position->quantity < 0) ||
                      (old_quantity < 0 && position->quantity > 0)) {
                // Position reversed
                double remaining_quantity = std::abs(position->quantity);
                position->avg_price = price;
                event_type = PositionEvent::Type::PositionReversed;
            } else {
                // Position reduced
                event_type = PositionEvent::Type::PositionDecreased;
            }
        }

        // Update cash balance
        cash_balances_[account_id] -= (quantity * price + commission);

        // Update calculations
        position->calculate_market_value();
        position->calculate_unrealized_pnl();
        position->last_update = std::chrono::system_clock::now();

        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
        record_update_time(duration);

        // Notify callbacks
        PositionEvent event;
        event.type = event_type;
        event.position = position;
        event.change_quantity = quantity;
        notify_callbacks(event);

        std::cout << "[PositionTracker] " << account_id << " " << symbol
                  << ": " << (quantity > 0 ? "BUY" : "SELL") << " "
                  << std::abs(quantity) << " @ $" << price
                  << " | Position: " << position->quantity
                  << " | Unrealized P&L: $" << position->unrealized_pnl << "\n";
    }

    /**
     * Update market price for position
     */
    void update_market_price(
        const std::string& account_id,
        const std::string& symbol,
        double market_price
    ) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = positions_.find(account_id);
        if (it == positions_.end()) return;

        auto pos_it = it->second.find(symbol);
        if (pos_it == it->second.end()) return;

        auto position = pos_it->second;
        position->market_price = market_price;
        position->calculate_market_value();
        position->calculate_unrealized_pnl();
        position->last_update = std::chrono::system_clock::now();

        // Notify callbacks
        PositionEvent event;
        event.type = PositionEvent::Type::PriceUpdate;
        event.position = position;
        notify_callbacks(event);
    }

    /**
     * Get position for symbol
     */
    std::shared_ptr<Position> get_position(
        const std::string& account_id,
        const std::string& symbol
    ) const {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = positions_.find(account_id);
        if (it == positions_.end()) return nullptr;

        auto pos_it = it->second.find(symbol);
        if (pos_it == it->second.end()) return nullptr;

        return pos_it->second;
    }

    /**
     * Get all positions for account
     */
    std::vector<std::shared_ptr<Position>> get_positions(
        const std::string& account_id
    ) const {
        std::lock_guard<std::mutex> lock(mutex_);

        std::vector<std::shared_ptr<Position>> result;

        auto it = positions_.find(account_id);
        if (it == positions_.end()) return result;

        for (const auto& [symbol, position] : it->second) {
            if (!position->is_flat()) {  // Only return non-zero positions
                result.push_back(position);
            }
        }

        return result;
    }

    /**
     * Get account summary
     */
    AccountSummary get_account_summary(const std::string& account_id) const {
        std::lock_guard<std::mutex> lock(mutex_);

        AccountSummary summary;
        summary.account_id = account_id;

        // Get cash balance
        auto cash_it = cash_balances_.find(account_id);
        if (cash_it != cash_balances_.end()) {
            summary.cash_balance = cash_it->second;
        }

        // Aggregate position data
        auto it = positions_.find(account_id);
        if (it != positions_.end()) {
            for (const auto& [symbol, position] : it->second) {
                if (!position->is_flat()) {
                    summary.total_positions++;
                    summary.total_market_value += position->market_value;
                    summary.total_unrealized_pnl += position->unrealized_pnl;
                    summary.total_realized_pnl += position->realized_pnl;

                    if (position->is_long()) summary.long_positions++;
                    if (position->is_short()) summary.short_positions++;
                }
            }
        }

        summary.total_pnl = summary.total_realized_pnl + summary.total_unrealized_pnl;
        summary.equity = summary.cash_balance + summary.total_market_value;

        return summary;
    }

    /**
     * Register callback
     */
    void register_callback(PositionCallback callback) {
        callbacks_.push_back(callback);
    }

    /**
     * Get metrics
     */
    const PositionTrackerMetrics& metrics() const {
        return metrics_;
    }

    void print_metrics() const {
        metrics_.print();
    }

    /**
     * Print account summary
     */
    void print_account_summary(const std::string& account_id) const {
        auto summary = get_account_summary(account_id);

        std::cout << "\n=== Account Summary: " << account_id << " ===\n";
        std::cout << std::fixed << std::setprecision(2);
        std::cout << "Cash Balance:        $" << summary.cash_balance << "\n";
        std::cout << "Market Value:        $" << summary.total_market_value << "\n";
        std::cout << "Equity:              $" << summary.equity << "\n";
        std::cout << "Unrealized P&L:      $" << summary.total_unrealized_pnl << "\n";
        std::cout << "Realized P&L:        $" << summary.total_realized_pnl << "\n";
        std::cout << "Total P&L:           $" << summary.total_pnl << "\n";
        std::cout << "Long Positions:      " << summary.long_positions << "\n";
        std::cout << "Short Positions:     " << summary.short_positions << "\n";
        std::cout << "Total Positions:     " << summary.total_positions << "\n";
        std::cout << "=====================================\n\n";
    }
};

// Example usage and testing
int main() {
    std::cout << "[Demo] Position Tracker\n";
    std::cout << "[Demo] Real-time position and P&L tracking\n\n";

    // Create position tracker
    PositionTracker tracker;

    // Register callback
    tracker.register_callback([](const PositionEvent& event) {
        std::string type_str;
        switch (event.type) {
            case PositionEvent::Type::PositionOpened:
                type_str = "Position Opened";
                break;
            case PositionEvent::Type::PositionIncreased:
                type_str = "Position Increased";
                break;
            case PositionEvent::Type::PositionDecreased:
                type_str = "Position Decreased";
                break;
            case PositionEvent::Type::PositionClosed:
                type_str = "Position Closed";
                break;
            case PositionEvent::Type::PositionReversed:
                type_str = "Position Reversed";
                break;
            case PositionEvent::Type::PriceUpdate:
                return;  // Skip price updates in demo
        }

        std::cout << "  [Event] " << type_str << ": "
                  << event.position->symbol << " ("
                  << event.position->quantity << " shares)\n";
    });

    // Initialize account
    tracker.initialize_account("ACC001", 100000.0);

    // Simulate trades
    std::cout << "\n=== Trading Simulation ===\n";

    // Buy 100 AAPL at $150
    tracker.process_fill("ACC001", "AAPL", 100, 150.00, 1.0);

    // Buy 50 more AAPL at $152
    tracker.process_fill("ACC001", "AAPL", 50, 152.00, 0.5);

    // Update market price
    tracker.update_market_price("ACC001", "AAPL", 155.00);

    // Buy 100 MSFT at $325
    tracker.process_fill("ACC001", "MSFT", 100, 325.00, 1.0);

    // Update MSFT price
    tracker.update_market_price("ACC001", "MSFT", 330.00);

    // Partial sell of AAPL
    tracker.process_fill("ACC001", "AAPL", -75, 156.00, 0.75);

    // Update prices
    tracker.update_market_price("ACC001", "AAPL", 157.00);

    // Print account summary
    tracker.print_account_summary("ACC001");

    // Print metrics
    tracker.print_metrics();

    // Get individual position
    auto aapl_pos = tracker.get_position("ACC001", "AAPL");
    if (aapl_pos) {
        std::cout << "AAPL Position Details:\n";
        std::cout << "  Quantity: " << aapl_pos->quantity << "\n";
        std::cout << "  Avg Price: $" << aapl_pos->avg_price << "\n";
        std::cout << "  Market Price: $" << aapl_pos->market_price << "\n";
        std::cout << "  Unrealized P&L: $" << aapl_pos->unrealized_pnl << "\n";
        std::cout << "  Realized P&L: $" << aapl_pos->realized_pnl << "\n";
    }

    std::cout << "\n[Demo] Features implemented:\n";
    std::cout << "  ✓ Real-time position tracking\n";
    std::cout << "  ✓ Automatic P&L calculation (realized + unrealized)\n";
    std::cout << "  ✓ Average price calculation\n";
    std::cout << "  ✓ Account summary aggregation\n";
    std::cout << "  ✓ Event callbacks for position changes\n";
    std::cout << "  ✓ Performance metrics tracking\n";
    std::cout << "\n[Demo] Target: <2μs position update latency\n";
    std::cout << "[Demo] Ready for integration with order manager!\n";

    return 0;
}
