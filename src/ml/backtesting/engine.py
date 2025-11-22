"""
Backtesting Framework - Phase 1 Implementation

Historical strategy testing with performance metrics
Target: Test 1M data points in <10 seconds

Agent: ml-agent
Based on: IMPLEMENTATION_PLAN.md Month 3, Week 1-2
Reference: plans/research/self-learning-platforms.md
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class OrderSide(Enum):
    BUY = "BUY"
    SELL = "SELL"


@dataclass
class BacktestOrder:
    """Order in backtest"""
    symbol: str
    side: OrderSide
    quantity: float
    price: float
    timestamp: datetime
    filled: bool = False
    fill_price: Optional[float] = None
    fill_timestamp: Optional[datetime] = None


@dataclass
class BacktestPosition:
    """Position in backtest"""
    symbol: str
    quantity: float = 0.0
    avg_price: float = 0.0
    market_price: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0


@dataclass
class BacktestResults:
    """Backtest performance results"""
    # P&L
    total_pnl: float = 0.0
    total_return: float = 0.0
    total_return_pct: float = 0.0

    # Trade statistics
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0

    # Risk metrics
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0

    # Performance over time
    equity_curve: List[float] = field(default_factory=list)
    daily_returns: List[float] = field(default_factory=list)
    timestamps: List[datetime] = field(default_factory=list)

    # Trade history
    trades: List[Dict] = field(default_factory=list)


class BacktestEngine:
    """
    Backtesting engine for strategy evaluation

    Features:
    - Historical data replay
    - Realistic order filling (slippage, commission)
    - Performance metrics calculation
    - Risk analytics
    """

    def __init__(
        self,
        initial_capital: float = 100000.0,
        commission: float = 1.0,
        slippage_pct: float = 0.001  # 0.1% slippage
    ):
        self.initial_capital = initial_capital
        self.commission = commission
        self.slippage_pct = slippage_pct

        self.cash = initial_capital
        self.positions: Dict[str, BacktestPosition] = {}
        self.orders: List[BacktestOrder] = []
        self.equity_curve: List[float] = []
        self.timestamps: List[datetime] = []

    def run(
        self,
        strategy: Callable,
        data: pd.DataFrame,
        symbols: List[str]
    ) -> BacktestResults:
        """
        Run backtest on historical data

        Args:
            strategy: Strategy function(data_row) -> (action, quantity)
                     action: 'BUY', 'SELL', or 'HOLD'
            data: Historical OHLCV data with columns: timestamp, symbol, open, high, low, close, volume
            symbols: List of symbols to trade

        Returns:
            Backtest results with performance metrics
        """
        print(f"[Backtest] Starting backtest with ${self.initial_capital:,.2f}")
        print(f"[Backtest] Data points: {len(data)}")
        print(f"[Backtest] Symbols: {symbols}")

        # Group data by timestamp
        data_by_time = data.groupby('timestamp')

        for timestamp, group in data_by_time:
            # Update market prices
            for _, row in group.iterrows():
                symbol = row['symbol']
                close_price = row['close']

                if symbol in self.positions:
                    self.positions[symbol].market_price = close_price
                    self._update_unrealized_pnl(symbol)

            # Run strategy for each symbol
            for symbol in symbols:
                symbol_data = group[group['symbol'] == symbol]
                if symbol_data.empty:
                    continue

                row = symbol_data.iloc[0]

                # Call strategy
                action, quantity = strategy(row)

                if action == 'BUY':
                    self._execute_buy(symbol, quantity, row['close'], timestamp)
                elif action == 'SELL':
                    self._execute_sell(symbol, quantity, row['close'], timestamp)

            # Record equity
            equity = self._calculate_equity()
            self.equity_curve.append(equity)
            self.timestamps.append(timestamp)

        # Calculate results
        results = self._calculate_results()

        print(f"\n[Backtest] Complete!")
        print(f"  Total P&L: ${results.total_pnl:,.2f}")
        print(f"  Total Return: {results.total_return_pct:.2f}%")
        print(f"  Win Rate: {results.win_rate:.2%}")
        print(f"  Sharpe Ratio: {results.sharpe_ratio:.2f}")
        print(f"  Max Drawdown: {results.max_drawdown_pct:.2%}")

        return results

    def _execute_buy(self, symbol: str, quantity: float, price: float, timestamp: datetime):
        """Execute buy order"""
        if quantity <= 0:
            return

        # Apply slippage (buy at slightly higher price)
        fill_price = price * (1 + self.slippage_pct)

        # Calculate cost
        cost = quantity * fill_price + self.commission

        # Check if enough cash
        if cost > self.cash:
            print(f"[Backtest] Insufficient cash for {symbol} buy (need ${cost:.2f}, have ${self.cash:.2f})")
            return

        # Update position
        if symbol not in self.positions:
            self.positions[symbol] = BacktestPosition(symbol)

        position = self.positions[symbol]

        # Update average price
        total_cost = (position.avg_price * position.quantity) + (fill_price * quantity)
        total_quantity = position.quantity + quantity
        position.avg_price = total_cost / total_quantity if total_quantity > 0 else 0

        position.quantity += quantity
        position.market_price = price

        # Update cash
        self.cash -= cost

        # Record order
        order = BacktestOrder(
            symbol=symbol,
            side=OrderSide.BUY,
            quantity=quantity,
            price=price,
            timestamp=timestamp,
            filled=True,
            fill_price=fill_price,
            fill_timestamp=timestamp
        )
        self.orders.append(order)

        print(f"[Backtest] BUY {quantity} {symbol} @ ${fill_price:.2f}")

    def _execute_sell(self, symbol: str, quantity: float, price: float, timestamp: datetime):
        """Execute sell order"""
        if quantity <= 0:
            return

        # Check if have position
        if symbol not in self.positions or self.positions[symbol].quantity < quantity:
            print(f"[Backtest] Insufficient position for {symbol} sell")
            return

        position = self.positions[symbol]

        # Apply slippage (sell at slightly lower price)
        fill_price = price * (1 - self.slippage_pct)

        # Calculate proceeds
        proceeds = quantity * fill_price - self.commission

        # Calculate realized P&L
        realized_pnl = (fill_price - position.avg_price) * quantity
        position.realized_pnl += realized_pnl

        # Update position
        position.quantity -= quantity

        # Update cash
        self.cash += proceeds

        # Record order
        order = BacktestOrder(
            symbol=symbol,
            side=OrderSide.SELL,
            quantity=quantity,
            price=price,
            timestamp=timestamp,
            filled=True,
            fill_price=fill_price,
            fill_timestamp=timestamp
        )
        self.orders.append(order)

        print(f"[Backtest] SELL {quantity} {symbol} @ ${fill_price:.2f} (P&L: ${realized_pnl:.2f})")

    def _update_unrealized_pnl(self, symbol: str):
        """Update unrealized P&L for position"""
        position = self.positions[symbol]
        position.unrealized_pnl = (position.market_price - position.avg_price) * position.quantity

    def _calculate_equity(self) -> float:
        """Calculate total equity (cash + positions)"""
        equity = self.cash

        for position in self.positions.values():
            equity += position.market_price * position.quantity

        return equity

    def _calculate_results(self) -> BacktestResults:
        """Calculate backtest performance metrics"""
        results = BacktestResults()

        # P&L
        final_equity = self._calculate_equity()
        results.total_pnl = final_equity - self.initial_capital
        results.total_return = results.total_pnl
        results.total_return_pct = (results.total_pnl / self.initial_capital) * 100

        # Trade statistics
        results.total_trades = len(self.orders) // 2  # Buy + Sell = 1 trade

        # Count winning/losing trades
        for position in self.positions.values():
            if position.realized_pnl > 0:
                results.winning_trades += 1
            elif position.realized_pnl < 0:
                results.losing_trades += 1

        if results.total_trades > 0:
            results.win_rate = results.winning_trades / results.total_trades

        # Daily returns
        if len(self.equity_curve) > 1:
            returns = np.diff(self.equity_curve) / self.equity_curve[:-1]
            results.daily_returns = returns.tolist()

            # Sharpe ratio (assuming 252 trading days, 0% risk-free rate)
            if len(returns) > 0 and np.std(returns) > 0:
                results.sharpe_ratio = (np.mean(returns) / np.std(returns)) * np.sqrt(252)

        # Max drawdown
        if self.equity_curve:
            equity_array = np.array(self.equity_curve)
            running_max = np.maximum.accumulate(equity_array)
            drawdown = (equity_array - running_max) / running_max
            results.max_drawdown_pct = np.min(drawdown) * 100
            results.max_drawdown = np.min(equity_array - running_max)

        # Store equity curve
        results.equity_curve = self.equity_curve
        results.timestamps = self.timestamps

        # Store trade history
        for order in self.orders:
            results.trades.append({
                'symbol': order.symbol,
                'side': order.side.value,
                'quantity': order.quantity,
                'price': order.fill_price,
                'timestamp': order.fill_timestamp
            })

        return results


# Example usage
if __name__ == "__main__":
    print("[Demo] Backtesting Framework\n")

    # Create sample data
    dates = pd.date_range('2023-01-01', periods=100, freq='D')
    data = []

    for date in dates:
        # Simulate price movement (random walk)
        price = 100 + np.random.randn() * 5
        data.append({
            'timestamp': date,
            'symbol': 'AAPL',
            'open': price,
            'high': price + abs(np.random.randn()),
            'low': price - abs(np.random.randn()),
            'close': price + np.random.randn(),
            'volume': 1000000
        })

    df = pd.DataFrame(data)

    # Simple moving average crossover strategy
    def ma_crossover_strategy(row):
        # In real strategy, you'd calculate SMA from historical data
        # For demo, just buy/sell randomly
        action = np.random.choice(['BUY', 'SELL', 'HOLD'], p=[0.1, 0.1, 0.8])
        quantity = 100 if action != 'HOLD' else 0
        return action, quantity

    # Run backtest
    engine = BacktestEngine(initial_capital=100000.0)
    results = engine.run(ma_crossover_strategy, df, ['AAPL'])

    print("\n[Demo] Features implemented:")
    print("  ✓ Historical data replay")
    print("  ✓ Realistic order filling (slippage + commission)")
    print("  ✓ P&L tracking (realized + unrealized)")
    print("  ✓ Performance metrics (Sharpe, drawdown, win rate)")
    print("  ✓ Equity curve generation")
    print("\n[Demo] Target: 1M data points in <10 seconds")
    print("[Demo] Ready for strategy evaluation!")
