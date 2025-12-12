import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import agents
import { TireStrategyAgent } from '../agents/TireStrategyAgent.js';
import { WeatherAnalysisAgent } from '../agents/WeatherAnalysisAgent.js';
import { PitStopTimingAgent } from '../agents/PitStopTimingAgent.js';
import { RaceSimulationAgent } from '../agents/RaceSimulationAgent.js';
import { CompetitorAnalysisAgent } from '../agents/CompetitorAnalysisAgent.js';
import { TelemetryAgent } from '../agents/TelemetryAgent.js';

/**
 * Swarm Orchestrator
 * Coordinates all agents and makes final strategy decisions
 */
export class SwarmOrchestrator extends EventEmitter {
  constructor(configPath) {
    super();
    this.agents = new Map();
    this.config = this.loadConfig(configPath);
    this.decisions = [];
    this.state = 'idle';
  }

  loadConfig(configPath) {
    const defaultConfigPath = path.join(__dirname, '../config/swarm.config.json');
    const finalPath = configPath || defaultConfigPath;

    try {
      const configData = fs.readFileSync(finalPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('Error loading config:', error.message);
      throw error;
    }
  }

  /**
   * Initialize the swarm
   */
  async initialize() {
    console.log('\n=== Initializing F1 Strategy Optimizer Swarm ===\n');
    this.state = 'initializing';

    // Create agent instances
    await this.createAgents();

    // Initialize all agents
    await this.initializeAgents();

    // Set up communication channels
    this.setupCommunication();

    this.state = 'ready';
    console.log('\n=== Swarm Ready ===\n');
  }

  async createAgents() {
    const agentClasses = {
      TireStrategyAgent,
      WeatherAnalysisAgent,
      PitStopTimingAgent,
      RaceSimulationAgent,
      CompetitorAnalysisAgent,
      TelemetryAgent
    };

    for (const agentConfig of this.config.agents) {
      if (!agentConfig.enabled) {
        console.log(`[Orchestrator] Skipping disabled agent: ${agentConfig.id}`);
        continue;
      }

      const AgentClass = agentClasses[agentConfig.type];
      if (!AgentClass) {
        console.warn(`[Orchestrator] Unknown agent type: ${agentConfig.type}`);
        continue;
      }

      const agent = new AgentClass(agentConfig);
      this.agents.set(agentConfig.id, agent);
      console.log(`[Orchestrator] Created agent: ${agentConfig.id} (${agentConfig.type})`);
    }
  }

  async initializeAgents() {
    const initPromises = Array.from(this.agents.values()).map(agent =>
      agent.initialize()
    );

    await Promise.all(initPromises);
  }

  setupCommunication() {
    // Set up event listeners for agent communications
    this.agents.forEach((agent, agentId) => {
      agent.on('decision', (decision) => {
        this.handleAgentDecision(agentId, decision);
      });

      agent.on('message', (message) => {
        this.broadcastMessage(message);
      });

      agent.on('error', (error) => {
        console.error(`[Orchestrator] Agent ${agentId} error:`, error);
      });
    });
  }

  handleAgentDecision(agentId, decision) {
    console.log(`[Orchestrator] Decision from ${agentId}:`, {
      confidence: decision.confidence,
      priority: decision.priority
    });

    this.decisions.push(decision);
    this.emit('agent-decision', { agentId, decision });
  }

  broadcastMessage(message) {
    // Broadcast to all agents except sender
    this.agents.forEach((agent, agentId) => {
      if (agent.id !== message.from) {
        agent.receiveMessage(message);
      }
    });
  }

  /**
   * Process race data and get strategy recommendations
   */
  async processRaceData(raceData) {
    console.log(`\n[Orchestrator] Processing race data for Lap ${raceData.currentLap}/${raceData.totalLaps}`);

    this.state = 'processing';
    this.decisions = [];

    // Process data through all agents in parallel
    const agentPromises = [];

    this.agents.forEach((agent, agentId) => {
      // Prepare agent-specific data
      const agentData = this.prepareAgentData(agentId, raceData);

      // Process data
      agentPromises.push(
        agent.process(agentData)
          .then(result => ({ agentId, result }))
          .catch(error => {
            console.error(`[Orchestrator] Agent ${agentId} failed:`, error.message);
            return null;
          })
      );
    });

    // Wait for all agents to complete
    const results = await Promise.all(agentPromises);
    const validResults = results.filter(r => r !== null);

    console.log(`[Orchestrator] Received ${validResults.length} agent decisions`);

    // Achieve consensus
    const consensus = this.achieveConsensus(validResults);

    this.state = 'ready';

    return consensus;
  }

  prepareAgentData(agentId, raceData) {
    // Each agent gets full race data
    // In a real system, this could be filtered/transformed per agent
    return raceData;
  }

  /**
   * Achieve consensus among agents
   */
  achieveConsensus(results) {
    console.log('\n[Orchestrator] Achieving consensus...');

    // Sort by priority and confidence
    const sortedResults = results
      .filter(r => r.result)
      .sort((a, b) => {
        const aPriority = a.result.priority || 2;
        const bPriority = b.result.priority || 2;
        const aConfidence = a.result.confidence || 0.5;
        const bConfidence = b.result.confidence || 0.5;

        // Higher priority first, then higher confidence
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return bConfidence - aConfidence;
      });

    // Extract recommendations
    const recommendations = sortedResults.map(r => ({
      agent: r.agentId,
      recommendation: r.result.analysis?.recommendation,
      confidence: r.result.confidence,
      priority: r.result.priority
    }));

    // Build consolidated strategy
    const strategy = {
      timestamp: new Date(),
      consensus: {
        achieved: true,
        confidence: this.calculateOverallConfidence(sortedResults),
        participatingAgents: sortedResults.length
      },
      primaryRecommendation: recommendations[0],
      allRecommendations: recommendations,
      strategicActions: this.extractStrategicActions(sortedResults),
      summary: this.generateStrategySummary(sortedResults)
    };

    console.log(`[Orchestrator] Consensus achieved with ${strategy.consensus.confidence.toFixed(2)} confidence`);

    return strategy;
  }

  calculateOverallConfidence(results) {
    if (results.length === 0) return 0;

    // Weighted average of confidence scores
    const totalWeight = results.reduce((sum, r) => sum + (r.result.priority || 2), 0);
    const weightedSum = results.reduce((sum, r) => {
      const confidence = r.result.confidence || 0.5;
      const weight = r.result.priority || 2;
      return sum + (confidence * weight);
    }, 0);

    return weightedSum / totalWeight;
  }

  extractStrategicActions(results) {
    const actions = [];

    results.forEach(result => {
      const analysis = result.result?.analysis;
      if (!analysis) return;

      // Tire strategy actions
      if (result.agentId === 'tire-strategy-agent' && analysis.recommendedPitLap) {
        actions.push({
          type: 'pit-stop',
          lap: analysis.recommendedPitLap,
          compound: analysis.recommendedCompound,
          priority: result.result.priority
        });
      }

      // Weather-related actions
      if (result.agentId === 'weather-analysis-agent' && analysis.strategyImpact) {
        analysis.strategyImpact.forEach(impact => {
          if (impact.urgency === 'high') {
            actions.push({
              type: 'weather-response',
              action: impact.recommendation,
              urgency: impact.urgency,
              priority: result.result.priority
            });
          }
        });
      }

      // Pit timing actions
      if (result.agentId === 'pitstop-timing-agent' && analysis.optimalPitLap) {
        actions.push({
          type: 'pit-timing',
          optimalLap: analysis.optimalPitLap,
          window: `${analysis.pitWindowStart}-${analysis.pitWindowEnd}`,
          strategy: analysis.undercutViable ? 'undercut' : 'standard',
          priority: result.result.priority
        });
      }
    });

    return actions;
  }

  generateStrategySummary(results) {
    const summary = {
      tireStrategy: null,
      pitStrategy: null,
      weatherOutlook: null,
      competitorThreats: null,
      riskAssessment: null
    };

    results.forEach(result => {
      const analysis = result.result?.analysis;
      if (!analysis) return;

      switch (result.agentId) {
        case 'tire-strategy-agent':
          summary.tireStrategy = {
            recommendedCompound: analysis.recommendedCompound,
            recommendedPitLap: analysis.recommendedPitLap,
            degradation: analysis.currentDegradation?.toFixed(2)
          };
          break;

        case 'pitstop-timing-agent':
          summary.pitStrategy = {
            optimalLap: analysis.optimalPitLap,
            strategy: analysis.undercutViable ? 'Undercut' : (analysis.overcutViable ? 'Overcut' : 'Standard'),
            window: `Lap ${analysis.pitWindowStart}-${analysis.pitWindowEnd}`
          };
          break;

        case 'weather-analysis-agent':
          summary.weatherOutlook = {
            rainProbability: (analysis.rainProbability * 100).toFixed(0) + '%',
            estimatedRainLap: analysis.estimatedRainLap || 'N/A',
            trackCondition: analysis.currentConditions?.condition
          };
          break;

        case 'competitor-analysis-agent':
          summary.competitorThreats = {
            threatsCount: analysis.threats?.length || 0,
            opportunitiesCount: analysis.opportunities?.length || 0,
            topThreat: analysis.threats?.[0]?.description || 'None'
          };
          break;

        case 'race-simulation-agent':
          summary.riskAssessment = {
            expectedPosition: analysis.expectedPosition?.toFixed(1),
            winProbability: (analysis.winProbability * 100).toFixed(1) + '%',
            podiumProbability: (analysis.podiumProbability * 100).toFixed(1) + '%'
          };
          break;
      }
    });

    return summary;
  }

  /**
   * Get swarm status
   */
  getStatus() {
    const agentStatuses = {};

    this.agents.forEach((agent, agentId) => {
      agentStatuses[agentId] = agent.getStatus();
    });

    return {
      orchestrator: {
        state: this.state,
        activeAgents: this.agents.size,
        decisionsProcessed: this.decisions.length
      },
      agents: agentStatuses
    };
  }

  /**
   * Shutdown the swarm
   */
  async shutdown() {
    console.log('\n[Orchestrator] Shutting down swarm...');
    this.state = 'shutdown';

    const shutdownPromises = Array.from(this.agents.values()).map(agent =>
      agent.shutdown()
    );

    await Promise.all(shutdownPromises);

    console.log('[Orchestrator] Swarm shutdown complete');
  }
}

export default SwarmOrchestrator;
