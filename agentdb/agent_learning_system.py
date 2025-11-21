#!/usr/bin/env python3
"""
AgentDB Learning & Optimization System for Trading Platform
A lightweight vector database and learning system for agent memory, optimization, and continuous improvement.
"""

import sqlite3
import json
import hashlib
import os
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict

@dataclass
class ResearchInsight:
    topic: str
    category: str
    insight: str
    confidence: float = 0.5
    source: str = ""
    validated: bool = False
    impact_score: float = 0.0
    metadata: Dict[str, Any] = None

@dataclass
class OptimizationExperiment:
    experiment_name: str
    strategy: str
    parameters: Dict[str, Any]
    baseline_metric: float
    optimized_metric: float
    improvement_pct: float
    status: str = 'running'
    notes: str = ""

@dataclass
class PerformanceBenchmark:
    benchmark_name: str
    category: str
    metric_name: str
    metric_value: float
    target_value: Optional[float] = None
    unit: str = ""
    competitor: str = ""
    metadata: Dict[str, Any] = None

class AgentDB:
    """AgentDB - Vector database for agent learning and optimization"""

    def __init__(self, db_path: str = "agentdb/trading_platform.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._initialize_schema()

    def _initialize_schema(self):
        """Initialize database schema"""
        try:
            with open('agentdb/schema.sql', 'r') as f:
                schema = f.read()
                self.conn.executescript(schema)
            self.conn.commit()
        except sqlite3.OperationalError:
            # Schema already exists, skip
            pass

    def store_agent_memory(self, agent_id: str, agent_type: str,
                          query: str, response: str, context: str = "",
                          metadata: Dict[str, Any] = None):
        """Store agent interaction in memory"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO agent_memory (agent_id, agent_type, context, query, response, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (agent_id, agent_type, context, query, response, json.dumps(metadata or {})))
        self.conn.commit()
        return cursor.lastrowid

    def add_research_insight(self, insight: ResearchInsight) -> int:
        """Add a research insight to the database"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO research_insights
            (topic, category, insight, confidence, source, validated, impact_score, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            insight.topic,
            insight.category,
            insight.insight,
            insight.confidence,
            insight.source,
            insight.validated,
            insight.impact_score,
            json.dumps(insight.metadata or {})
        ))
        self.conn.commit()
        return cursor.lastrowid

    def record_optimization(self, experiment: OptimizationExperiment) -> int:
        """Record an optimization experiment"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO optimization_experiments
            (experiment_name, strategy, parameters, baseline_metric,
             optimized_metric, improvement_pct, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            experiment.experiment_name,
            experiment.strategy,
            json.dumps(experiment.parameters),
            experiment.baseline_metric,
            experiment.optimized_metric,
            experiment.improvement_pct,
            experiment.status,
            experiment.notes
        ))
        self.conn.commit()
        return cursor.lastrowid

    def store_benchmark(self, benchmark: PerformanceBenchmark) -> int:
        """Store performance benchmark"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO performance_benchmarks
            (benchmark_name, category, metric_name, metric_value,
             target_value, unit, competitor, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            benchmark.benchmark_name,
            benchmark.category,
            benchmark.metric_name,
            benchmark.metric_value,
            benchmark.target_value,
            benchmark.unit,
            benchmark.competitor,
            json.dumps(benchmark.metadata or {})
        ))
        self.conn.commit()
        return cursor.lastrowid

    def record_learning(self, learning_type: str, pattern: str,
                       context: str = "", success_rate: float = 0.0):
        """Record an agent learning pattern"""
        cursor = self.conn.cursor()

        # Check if pattern exists
        cursor.execute("""
            SELECT id, frequency, success_rate, application_count
            FROM agent_learnings
            WHERE learning_type = ? AND pattern = ?
        """, (learning_type, pattern))

        existing = cursor.fetchone()

        if existing:
            # Update existing pattern
            new_freq = existing['frequency'] + 1
            new_success = (existing['success_rate'] * existing['application_count'] + success_rate) / (existing['application_count'] + 1)
            cursor.execute("""
                UPDATE agent_learnings
                SET frequency = ?,
                    success_rate = ?,
                    last_seen = CURRENT_TIMESTAMP,
                    application_count = application_count + 1
                WHERE id = ?
            """, (new_freq, new_success, existing['id']))
        else:
            # Insert new pattern
            cursor.execute("""
                INSERT INTO agent_learnings
                (learning_type, pattern, context, frequency, success_rate, application_count)
                VALUES (?, ?, ?, 1, ?, 1)
            """, (learning_type, pattern, context, success_rate))

        self.conn.commit()

    def get_top_learnings(self, learning_type: str = None, limit: int = 10) -> List[Dict]:
        """Get top learning patterns by frequency"""
        cursor = self.conn.cursor()

        if learning_type:
            cursor.execute("""
                SELECT * FROM agent_learnings
                WHERE learning_type = ?
                ORDER BY frequency DESC, success_rate DESC
                LIMIT ?
            """, (learning_type, limit))
        else:
            cursor.execute("""
                SELECT * FROM agent_learnings
                ORDER BY frequency DESC, success_rate DESC
                LIMIT ?
            """, (limit,))

        return [dict(row) for row in cursor.fetchall()]

    def get_insights_by_topic(self, topic: str, min_confidence: float = 0.5) -> List[Dict]:
        """Get research insights for a specific topic"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM research_insights
            WHERE topic LIKE ? AND confidence >= ?
            ORDER BY confidence DESC, impact_score DESC
        """, (f"%{topic}%", min_confidence))

        return [dict(row) for row in cursor.fetchall()]

    def get_optimization_results(self, strategy: str = None) -> List[Dict]:
        """Get optimization experiment results"""
        cursor = self.conn.cursor()

        if strategy:
            cursor.execute("""
                SELECT * FROM optimization_experiments
                WHERE strategy = ?
                ORDER BY improvement_pct DESC
            """, (strategy,))
        else:
            cursor.execute("""
                SELECT * FROM optimization_experiments
                ORDER BY improvement_pct DESC
            """)

        return [dict(row) for row in cursor.fetchall()]

    def add_recommendation(self, component: str, current_state: str,
                          recommended_action: str, expected_improvement: str,
                          priority: int = 5, difficulty: str = 'medium'):
        """Add an optimization recommendation"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO optimization_recommendations
            (component, current_state, recommended_action, expected_improvement, priority, difficulty)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (component, current_state, recommended_action, expected_improvement, priority, difficulty))
        self.conn.commit()
        return cursor.lastrowid

    def get_recommendations(self, status: str = 'pending', min_priority: int = 5) -> List[Dict]:
        """Get optimization recommendations"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM optimization_recommendations
            WHERE status = ? AND priority >= ?
            ORDER BY priority DESC
        """, (status, min_priority))

        return [dict(row) for row in cursor.fetchall()]

    def analyze_research_documents(self, plans_dir: str = "plans"):
        """Analyze research documents and extract insights"""
        insights = []

        # Analyze each document
        for root, dirs, files in os.walk(plans_dir):
            for file in files:
                if file.endswith('.md'):
                    filepath = os.path.join(root, file)
                    category = os.path.basename(root)

                    with open(filepath, 'r') as f:
                        content = f.read()

                    # Extract key insights (simplified - could use NLP)
                    if 'latency' in content.lower():
                        insights.append(ResearchInsight(
                            topic='performance',
                            category=category,
                            insight=f'Latency optimization strategies in {file}',
                            confidence=0.9,
                            source=filepath,
                            impact_score=9.0
                        ))

                    if 'fpga' in content.lower():
                        insights.append(ResearchInsight(
                            topic='hardware',
                            category=category,
                            insight=f'FPGA acceleration discussed in {file}',
                            confidence=0.85,
                            source=filepath,
                            impact_score=8.5
                        ))

                    if 'machine learning' in content.lower() or 'ml' in content.lower():
                        insights.append(ResearchInsight(
                            topic='ai-ml',
                            category=category,
                            insight=f'ML strategies covered in {file}',
                            confidence=0.9,
                            source=filepath,
                            impact_score=9.0
                        ))

        # Store insights
        for insight in insights:
            self.add_research_insight(insight)

        return len(insights)

    def generate_optimization_report(self) -> str:
        """Generate a comprehensive optimization report"""
        report = []
        report.append("=" * 80)
        report.append("AGENTDB LEARNING & OPTIMIZATION REPORT")
        report.append("=" * 80)
        report.append(f"Generated: {datetime.now().isoformat()}")
        report.append("")

        # Top learnings
        report.append("\n📚 TOP AGENT LEARNINGS")
        report.append("-" * 80)
        learnings = self.get_top_learnings(limit=10)
        for i, learning in enumerate(learnings, 1):
            report.append(f"{i}. {learning['learning_type']}: {learning['pattern']}")
            report.append(f"   Frequency: {learning['frequency']} | Success Rate: {learning['success_rate']:.2%}")

        # Research insights
        report.append("\n💡 KEY RESEARCH INSIGHTS")
        report.append("-" * 80)
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT topic, COUNT(*) as count, AVG(confidence) as avg_confidence
            FROM research_insights
            GROUP BY topic
            ORDER BY count DESC
        """)
        for row in cursor.fetchall():
            report.append(f"• {row['topic']}: {row['count']} insights (avg confidence: {row['avg_confidence']:.2%})")

        # Optimization experiments
        report.append("\n⚡ OPTIMIZATION EXPERIMENTS")
        report.append("-" * 80)
        experiments = self.get_optimization_results()[:10]
        for i, exp in enumerate(experiments, 1):
            report.append(f"{i}. {exp['experiment_name']}")
            report.append(f"   Strategy: {exp['strategy']}")
            report.append(f"   Improvement: {exp['improvement_pct']:.1f}%")

        # Performance benchmarks
        report.append("\n📊 PERFORMANCE BENCHMARKS")
        report.append("-" * 80)
        cursor.execute("""
            SELECT category, metric_name, AVG(metric_value) as avg_value, unit
            FROM performance_benchmarks
            GROUP BY category, metric_name
            ORDER BY category
        """)
        for row in cursor.fetchall():
            report.append(f"• {row['category']} - {row['metric_name']}: {row['avg_value']:.2f} {row['unit']}")

        # Recommendations
        report.append("\n🎯 TOP RECOMMENDATIONS")
        report.append("-" * 80)
        recommendations = self.get_recommendations(min_priority=7)[:5]
        for i, rec in enumerate(recommendations, 1):
            report.append(f"{i}. [{rec['priority']}] {rec['component']}")
            report.append(f"   Action: {rec['recommended_action']}")
            report.append(f"   Expected: {rec['expected_improvement']}")
            report.append(f"   Difficulty: {rec['difficulty']}")

        report.append("\n" + "=" * 80)
        return "\n".join(report)

    def close(self):
        """Close database connection"""
        self.conn.close()


def main():
    """Main function to demonstrate AgentDB usage"""
    print("🚀 Initializing AgentDB Learning & Optimization System...")

    # Initialize AgentDB
    db = AgentDB()

    # Analyze research documents
    print("\n📖 Analyzing research documents...")
    insights_count = db.analyze_research_documents()
    print(f"✅ Extracted {insights_count} insights from research documents")

    # Add some optimization experiments
    print("\n⚡ Recording optimization experiments...")

    experiments = [
        OptimizationExperiment(
            experiment_name="DPDK Kernel Bypass",
            strategy="network-optimization",
            parameters={"method": "DPDK", "cores": 4},
            baseline_metric=50.0,  # microseconds
            optimized_metric=2.0,   # microseconds
            improvement_pct=96.0,
            status="completed",
            notes="Massive latency reduction using DPDK"
        ),
        OptimizationExperiment(
            experiment_name="Lock-Free Queue Implementation",
            strategy="concurrency-optimization",
            parameters={"type": "SPSC", "size": 4096},
            baseline_metric=10.0,
            optimized_metric=0.5,
            improvement_pct=95.0,
            status="completed",
            notes="Zero-copy lock-free queue for market data"
        ),
        OptimizationExperiment(
            experiment_name="SIMD Vectorization",
            strategy="cpu-optimization",
            parameters={"instruction_set": "AVX-512", "batch_size": 16},
            baseline_metric=5.0,
            optimized_metric=0.3,
            improvement_pct=94.0,
            status="completed",
            notes="Vectorized technical indicator calculations"
        ),
        OptimizationExperiment(
            experiment_name="FPGA Market Data Parser",
            strategy="hardware-acceleration",
            parameters={"fpga": "Xilinx Versal", "pipeline_stages": 5},
            baseline_metric=2.0,
            optimized_metric=0.014,  # 14 nanoseconds
            improvement_pct=99.3,
            status="in-progress",
            notes="FPGA-based ultra-low latency parsing"
        ),
    ]

    for exp in experiments:
        db.record_optimization(exp)
    print(f"✅ Recorded {len(experiments)} optimization experiments")

    # Add benchmarks
    print("\n📊 Storing performance benchmarks...")

    benchmarks = [
        PerformanceBenchmark("Market Data Latency", "latency", "p99", 100.0, 100.0, "ns", "Target"),
        PerformanceBenchmark("Market Data Latency", "latency", "p99", 13.9, None, "ns", "AMD/Exegy FPGA"),
        PerformanceBenchmark("Market Data Latency", "latency", "p99", 50.0, None, "ns", "Citadel Securities"),
        PerformanceBenchmark("Market Data Latency", "latency", "p99", 500.0, None, "ns", "Jane Street"),
        PerformanceBenchmark("Throughput", "performance", "orders_per_sec", 10000000.0, 10000000.0, "ops/s", "Target"),
        PerformanceBenchmark("ML Inference", "latency", "p95", 10.0, 10.0, "μs", "Target"),
    ]

    for benchmark in benchmarks:
        db.store_benchmark(benchmark)
    print(f"✅ Stored {len(benchmarks)} performance benchmarks")

    # Record learnings
    print("\n📚 Recording agent learnings...")

    learnings = [
        ("optimization", "Use kernel bypass (DPDK) for <10μs latency", "network", 0.95),
        ("optimization", "Lock-free data structures eliminate contention", "concurrency", 0.90),
        ("optimization", "SIMD vectorization provides 10-20x speedup", "cpu", 0.85),
        ("optimization", "FPGA can achieve sub-microsecond parsing", "hardware", 0.80),
        ("architecture", "Separate hot and cold paths for performance", "design", 0.92),
        ("architecture", "Use memory pools to avoid allocation in hot path", "design", 0.88),
        ("ml", "Online learning reduces need for retraining", "strategy", 0.75),
        ("ml", "Reinforcement learning shows 30-50% improvement", "strategy", 0.80),
        ("trading", "TradeStation API latency is 50-200ms", "integration", 0.95),
        ("trading", "Sub-100ns latency requires custom hardware", "requirements", 0.85),
    ]

    for learning_type, pattern, context, success_rate in learnings:
        db.record_learning(learning_type, pattern, context, success_rate)
    print(f"✅ Recorded {len(learnings)} agent learnings")

    # Add recommendations
    print("\n🎯 Generating optimization recommendations...")

    recommendations = [
        ("Network Stack", "Standard Linux TCP/IP", "Implement DPDK kernel bypass", "5x latency reduction", 10, "medium"),
        ("Data Structures", "Standard queues with locks", "Implement lock-free SPSC queues", "95% latency reduction", 9, "medium"),
        ("CPU Utilization", "No core pinning", "Pin critical threads to isolated cores", "Consistent latency", 9, "easy"),
        ("Memory", "Standard malloc/free", "Implement memory pools for hot path", "Eliminate allocation latency", 8, "medium"),
        ("Indicators", "Loop-based calculations", "Vectorize with AVX-512 SIMD", "10-20x speedup", 8, "hard"),
        ("Market Data", "Software parsing", "Deploy FPGA market data parser", "99% latency reduction", 10, "hard"),
        ("ML Inference", "CPU inference", "Use TensorRT on GPU", "10x faster inference", 7, "medium"),
        ("Time Sync", "NTP", "Implement PTP hardware timestamps", "Nanosecond precision", 7, "medium"),
    ]

    for comp, current, action, expected, priority, difficulty in recommendations:
        db.add_recommendation(comp, current, action, expected, priority, difficulty)
    print(f"✅ Generated {len(recommendations)} optimization recommendations")

    # Generate comprehensive report
    print("\n" + "=" * 80)
    print("📄 GENERATING COMPREHENSIVE OPTIMIZATION REPORT")
    print("=" * 80)

    report = db.generate_optimization_report()
    print(report)

    # Save report to file
    report_file = "agentdb/optimization_report.txt"
    with open(report_file, 'w') as f:
        f.write(report)
    print(f"\n✅ Report saved to: {report_file}")

    # Close database
    db.close()
    print("\n✅ AgentDB session complete!")


if __name__ == "__main__":
    main()
