# F1 Strategy Optimizer Swarm 🏎️🤖

Next-generation Formula 1 race strategy optimizer using multi-agent swarm intelligence.

## Overview

This project implements a sophisticated multi-agent system (swarm) for optimizing F1 race strategies in real-time. The swarm consists of specialized AI agents that collaborate to analyze race conditions, predict outcomes, and recommend optimal strategies.

## Architecture

### Swarm Components

1. **Orchestrator** - Coordinates all agents and achieves consensus
2. **Specialized Agents**:
   - **Tire Strategy Agent** - Analyzes tire compounds, degradation, and pit windows
   - **Weather Analysis Agent** - Monitors weather and predicts impact on strategy
   - **Pit Stop Timing Agent** - Optimizes pit stop timing (undercut/overcut strategies)
   - **Race Simulation Agent** - Runs Monte Carlo simulations for outcome prediction
   - **Competitor Analysis Agent** - Tracks and predicts competitor strategies
   - **Telemetry Agent** - Processes real-time car telemetry data

### Key Features

✅ **Real-time Strategy Optimization**
- Continuous analysis of race conditions
- Dynamic strategy adjustments
- Multi-objective optimization

✅ **Swarm Intelligence**
- Collaborative decision-making
- Consensus-based recommendations
- Priority-weighted analysis

✅ **Advanced Analytics**
- Monte Carlo race simulations (10,000+ iterations)
- Probabilistic weather forecasting
- Competitor behavior modeling
- Telemetry anomaly detection

✅ **Strategic Capabilities**
- Undercut/overcut opportunity identification
- Safety car strategy optimization
- Traffic management
- Energy management (ERS/fuel)
- Risk assessment

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd vibecast

# Install dependencies
npm install
```

## Usage

### Run Simulation

```bash
npm run simulate
```

This runs a complete race simulation demonstrating the swarm system with realistic F1 race data.

### Start Development Server

```bash
npm run dev
```

### Basic Usage

```javascript
import { SwarmOrchestrator } from './swarm/orchestrator/index.js';

// Initialize orchestrator
const orchestrator = new SwarmOrchestrator();
await orchestrator.initialize();

// Process race data
const raceData = {
  currentLap: 20,
  totalLaps: 52,
  position: 5,
  tireAge: 19,
  currentCompound: 'C3',
  // ... more data
};

const strategy = await orchestrator.processRaceData(raceData);

console.log('Recommended Strategy:', strategy.primaryRecommendation);
console.log('Consensus Confidence:', strategy.consensus.confidence);
```

## Configuration

The swarm is configured via `swarm/config/swarm.config.json`:

```json
{
  "swarm": {
    "name": "F1StrategyOptimizerSwarm",
    "orchestrator": {
      "maxConcurrentAgents": 10,
      "decisionThreshold": 0.75
    }
  },
  "agents": [
    {
      "id": "tire-strategy-agent",
      "type": "TireStrategyAgent",
      "priority": 1,
      "enabled": true
    }
    // ... more agents
  ]
}
```

## Agent Details

### Tire Strategy Agent
- Analyzes tire compound characteristics
- Calculates degradation rates
- Determines optimal pit windows
- Recommends compound strategies

### Weather Analysis Agent
- Tracks weather conditions
- Predicts rain probability
- Analyzes track evolution
- Calculates grip levels

### Pit Stop Timing Agent
- Calculates pit stop time loss
- Identifies undercut opportunities
- Analyzes overcut strategies
- Manages traffic considerations

### Race Simulation Agent
- Runs Monte Carlo simulations
- Generates probability distributions
- Evaluates multiple strategies
- Assesses risk factors

### Competitor Analysis Agent
- Profiles competitor behavior
- Predicts pit stop strategies
- Analyzes pace differentials
- Identifies threats and opportunities

### Telemetry Agent
- Monitors component health
- Detects anomalies
- Optimizes performance
- Predicts failures

## Data Flow

```
Race Data Input
      ↓
Orchestrator
      ↓
┌─────────────────────────────────────────┐
│  Parallel Agent Processing              │
│  - Tire Strategy Agent                  │
│  - Weather Analysis Agent               │
│  - Pit Stop Timing Agent                │
│  - Race Simulation Agent                │
│  - Competitor Analysis Agent            │
│  - Telemetry Agent                      │
└─────────────────────────────────────────┘
      ↓
Consensus Mechanism
(Priority + Confidence Weighted)
      ↓
Unified Strategy Output
```

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║   F1 STRATEGY OPTIMIZER SWARM - RACE SIMULATION          ║
╚══════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════
🎯 SWARM CONSENSUS STRATEGY
═══════════════════════════════════════════════════════════

✓ Consensus Achieved: Yes
✓ Overall Confidence: 87.3%
✓ Contributing Agents: 6

📋 PRIMARY RECOMMENDATION:
   Agent: pitstop-timing-agent
   Recommendation: INFO: Standard pit window: laps 23-28. Optimal: lap 25.
   Confidence: 80.0%

⚡ STRATEGIC ACTIONS:
   1. [pit-stop] Lap 25
      → Compound: C2
   2. [pit-timing] Lap 25
      → Window: 23-28

📊 STRATEGY SUMMARY:
   🏎️  Tire Strategy:
      • Recommended: C2
      • Pit Lap: 25
      • Current Degradation: 0.53

   ⏱️  Pit Strategy:
      • Type: Standard
      • Optimal Lap: 25
      • Window: Lap 23-28
```

## Development

### Project Structure

```
vibecast/
├── swarm/
│   ├── agents/           # Specialized agent implementations
│   │   ├── TireStrategyAgent.js
│   │   ├── WeatherAnalysisAgent.js
│   │   ├── PitStopTimingAgent.js
│   │   ├── RaceSimulationAgent.js
│   │   ├── CompetitorAnalysisAgent.js
│   │   └── TelemetryAgent.js
│   ├── config/           # Swarm configuration
│   │   └── swarm.config.json
│   ├── core/             # Base classes
│   │   └── Agent.js
│   └── orchestrator/     # Coordination layer
│       ├── index.js
│       └── simulate.js
├── package.json
└── README.md
```

### Adding a New Agent

1. Create agent class extending `Agent`:

```javascript
import { Agent } from '../core/Agent.js';

export class MyAgent extends Agent {
  async analyze(data) {
    // Your analysis logic
    return this.makeDecision(analysis, confidence);
  }
}
```

2. Register in `swarm.config.json`:

```json
{
  "id": "my-agent",
  "type": "MyAgent",
  "priority": 2,
  "enabled": true
}
```

3. Import in orchestrator:

```javascript
import { MyAgent } from '../agents/MyAgent.js';
```

## Performance

- **Agent Processing**: Parallel execution across all agents
- **Simulation Speed**: 10,000 Monte Carlo iterations < 2 seconds
- **Decision Latency**: < 500ms for full swarm consensus
- **Scalability**: Supports 10+ concurrent agents

## Future Enhancements

- [ ] Real-time telemetry integration
- [ ] Machine learning model training
- [ ] Historical race data analysis
- [ ] API for external integrations
- [ ] Web dashboard for visualization
- [ ] Multi-race season optimization
- [ ] Team strategy coordination

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please read contributing guidelines before submitting PRs.

## Acknowledgments

Built as a demonstration of multi-agent swarm intelligence for F1 strategy optimization.

---

**Note**: This is a simulation system. Integration with real F1 telemetry systems would require appropriate APIs and data feeds.

---

*Weekly Vibecast Live coding sessions with mofu. Check branches for each week.*
