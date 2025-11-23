-- AgentDB Schema for Trading Platform Learning & Optimization
-- This database tracks agent learnings, optimizations, and performance metrics

-- Core agent memory storage
CREATE TABLE IF NOT EXISTS agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    context TEXT,
    query TEXT,
    response TEXT,
    embedding BLOB,
    metadata JSON
);

CREATE INDEX idx_agent_memory_agent_id ON agent_memory(agent_id);
CREATE INDEX idx_agent_memory_timestamp ON agent_memory(timestamp);
CREATE INDEX idx_agent_memory_type ON agent_memory(agent_type);

-- Research findings and insights
CREATE TABLE IF NOT EXISTS research_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    category TEXT NOT NULL,
    insight TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    source TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    validated BOOLEAN DEFAULT 0,
    impact_score REAL DEFAULT 0.0,
    metadata JSON
);

CREATE INDEX idx_research_topic ON research_insights(topic);
CREATE INDEX idx_research_category ON research_insights(category);
CREATE INDEX idx_research_confidence ON research_insights(confidence);

-- Optimization experiments and results
CREATE TABLE IF NOT EXISTS optimization_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_name TEXT NOT NULL,
    strategy TEXT NOT NULL,
    parameters JSON,
    baseline_metric REAL,
    optimized_metric REAL,
    improvement_pct REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    notes TEXT
);

CREATE INDEX idx_optimization_strategy ON optimization_experiments(strategy);
CREATE INDEX idx_optimization_status ON optimization_experiments(status);

-- Performance benchmarks
CREATE TABLE IF NOT EXISTS performance_benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_name TEXT NOT NULL,
    category TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    target_value REAL,
    unit TEXT,
    competitor TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX idx_benchmark_category ON performance_benchmarks(category);
CREATE INDEX idx_benchmark_name ON performance_benchmarks(benchmark_name);

-- Agent learnings and patterns
CREATE TABLE IF NOT EXISTS agent_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    learning_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    context TEXT,
    frequency INTEGER DEFAULT 1,
    success_rate REAL DEFAULT 0.0,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    application_count INTEGER DEFAULT 0,
    embedding BLOB
);

CREATE INDEX idx_learning_type ON agent_learnings(learning_type);
CREATE INDEX idx_learning_frequency ON agent_learnings(frequency DESC);

-- Trade strategy performance
CREATE TABLE IF NOT EXISTS strategy_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_name TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    backtest_sharpe REAL,
    backtest_return REAL,
    backtest_drawdown REAL,
    live_sharpe REAL,
    live_return REAL,
    live_drawdown REAL,
    parameter_set JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE INDEX idx_strategy_name ON strategy_performance(strategy_name);
CREATE INDEX idx_strategy_sharpe ON strategy_performance(backtest_sharpe DESC);

-- Optimization recommendations
CREATE TABLE IF NOT EXISTS optimization_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component TEXT NOT NULL,
    current_state TEXT,
    recommended_action TEXT NOT NULL,
    expected_improvement TEXT,
    priority INTEGER DEFAULT 5,
    difficulty TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    actual_improvement TEXT
);

CREATE INDEX idx_recommendations_priority ON optimization_recommendations(priority DESC);
CREATE INDEX idx_recommendations_status ON optimization_recommendations(status);

-- Document embeddings and semantic search
CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_document_path ON document_chunks(document_path);

-- Agent collaboration history
CREATE TABLE IF NOT EXISTS agent_collaborations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    agent_from TEXT NOT NULL,
    agent_to TEXT NOT NULL,
    message TEXT,
    result TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collaboration_session ON agent_collaborations(session_id);

-- System metrics and telemetry
CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_type TEXT NOT NULL,
    component TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON system_metrics(timestamp);
