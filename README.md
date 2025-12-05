# DXP Agency Simulation System

A high-fidelity simulation of a next-generation open Digital Experience Platform (DXP) agency system with federated multi-agent architecture.

## Overview

This simulation system models a modern DXP agency with 5 specialized federated agents working collaboratively to deliver digital transformation projects. The system uses cutting-edge technologies including:

- **ruvector** - High-performance vector operations with SIMD
- **agentic-flow** - Agent workflow orchestration
- **@ruvector/agentic-synth** - Agent synthesis and generation
- **@ruvector/ruvllm** - SIMD-optimized language model inference
- **E2B** - Sandboxed code execution environment

## Features

### Federated Agent System

The simulation includes 5 specialized agent types:

1. **Business Strategist** - Market analysis, strategy, and ROI optimization
2. **Technical Architect** - System design, technology selection, and architecture
3. **Project Manager** - Project planning, resource management, and delivery
4. **Client Advisor** - Client relationships, needs assessment, and change management
5. **Operations Manager** - Operational efficiency, resource optimization, and process improvement

### Simulation Capabilities

- Real-time federated decision making with consensus mechanisms
- Dynamic workflow orchestration
- E2B sandboxed agent execution
- Market dynamics simulation
- Network trust and collaboration modeling
- Comprehensive performance metrics
- Automated report generation

### Business Requirements Coverage

- Multi-criteria decision analysis
- Cost-benefit analysis
- Risk assessment and mitigation
- Resource allocation optimization
- Quality gate management
- Stakeholder communication
- Change management workflows

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure E2B API key in .env
# E2B_API_KEY=your_api_key_here
```

## Usage

### Run Simulation

```bash
# Using TypeScript directly
npx tsx src/index.ts

# Or compile and run
npm run build
node dist/index.js
```

### Configuration

Edit simulation parameters in `src/index.ts`:

```typescript
const config: SimulationConfig = {
  duration: 300000,        // 5 minutes
  tickInterval: 100,       // 100ms per tick
  agentCount: 5,          // 5 federated agents
  initialClients: 3,      // Starting clients
  marketDynamics: true,   // Enable market simulation
  enableLearning: true,   // Enable agent learning
  enableAdaptation: true  // Enable adaptive behavior
};
```

## Reports

The simulation generates comprehensive reports in the `/reports` directory:

- **Executive Summary** (`*-executive-summary.md`) - High-level KPIs and insights
- **Agent Performance** (`*-agent-performance.md`) - Individual agent metrics and analysis
- **Network Analysis** (`*-network-analysis.md`) - Federated network health and collaboration
- **Event Log** (`*-event-log.md`) - Chronological event history
- **Metrics Report** (`*-metrics.json`) - Machine-readable metrics
- **Full State Dump** (`*-full-state.json`) - Complete simulation state
- **Periodic Snapshots** (`snapshot-*.json`) - Real-time progress snapshots

## Architecture

### Core Components

```
src/
├── agents/              # Federated agent implementations
│   ├── base-agent.ts           # Base agent class with memory & learning
│   ├── business-strategist.ts  # Business strategy agent
│   ├── technical-architect.ts  # Technical architecture agent
│   ├── project-manager.ts      # Project management agent
│   ├── client-advisor.ts       # Client advisory agent
│   ├── operations-manager.ts   # Operations management agent
│   └── agent-factory.ts        # Agent creation and network setup
├── business/            # Business logic and workflows
│   ├── workflow-engine.ts      # Workflow orchestration
│   └── decision-framework.ts   # Decision-making algorithms
├── models/              # Type definitions and data models
│   ├── agent-types.ts          # Agent and network types
│   ├── business-requirements.ts # Business requirement models
│   ├── dxp-agency.ts           # DXP agency domain models
│   └── simulation-state.ts     # Simulation state management
├── simulation/          # Simulation engine
│   ├── orchestrator.ts         # Main simulation orchestrator
│   └── e2b-integration.ts      # E2B sandbox integration
└── utils/              # Utilities
    └── reporter.ts             # Report generation
```

### Technology Stack

- **TypeScript** - Type-safe development
- **RuVector** - SIMD-optimized vector operations
- **Agentic Flow** - Agent workflow management
- **E2B** - Secure code execution sandboxes
- **Node.js** - Runtime environment

## Key Metrics

The simulation tracks comprehensive metrics:

### Business Metrics
- Revenue, growth rate, profit margin
- Client satisfaction, market share
- Innovation index

### Agent Metrics
- Decision quality, collaboration level
- Learning rate, adaptability
- Task completion and success rates

### Network Metrics
- Connectivity, trust levels
- Knowledge flow, consensus efficiency
- Network resilience

### Performance Metrics
- Throughput, latency, error rates
- Resource utilization, efficiency

## License

ISC

---

**Built with cutting-edge agent technologies for next-generation DXP agencies**
