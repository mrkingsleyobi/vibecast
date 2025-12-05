/**
 * DXP Agency Simulation - Main Entry Point
 * High-fidelity simulation of a next-generation open DXP agency system
 */

import dotenv from 'dotenv';
import { SimulationOrchestrator } from './simulation/orchestrator';
import { SimulationReporter } from './utils/reporter';
import { SimulationConfig } from './models/simulation-state';

// Load environment variables
dotenv.config();

/**
 * Main simulation runner
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DXP AGENCY SIMULATION SYSTEM');
  console.log('  Next-Generation Open DXP Agency Federated Simulation');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Verify E2B API key
  const e2bApiKey = process.env.E2B_API_KEY;
  if (!e2bApiKey) {
    console.warn('⚠️  E2B_API_KEY not found. Running in simulation mode.');
    console.warn('   Set E2B_API_KEY in .env file for full E2B integration.');
  } else {
    console.log('✓ E2B API key configured');
  }
  console.log('');

  // Configure simulation
  const config: SimulationConfig = {
    duration: 300000, // 5 minutes
    tickInterval: 100, // 100ms per tick
    agentCount: 5, // 5 federated agents
    initialClients: 3,
    marketDynamics: true,
    enableLearning: true,
    enableAdaptation: true,
    scenarios: []
  };

  console.log('Simulation Configuration:');
  console.log(`  - Duration: ${config.duration / 1000}s`);
  console.log(`  - Tick Interval: ${config.tickInterval}ms`);
  console.log(`  - Agent Count: ${config.agentCount}`);
  console.log(`  - Initial Clients: ${config.initialClients}`);
  console.log(`  - Market Dynamics: ${config.marketDynamics ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Learning: ${config.enableLearning ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Adaptation: ${config.enableAdaptation ? 'Enabled' : 'Disabled'}`);
  console.log('');

  // Create orchestrator
  console.log('Initializing simulation orchestrator...');
  const orchestrator = new SimulationOrchestrator(config);
  console.log('✓ Orchestrator initialized');
  console.log('');

  // Create reporter
  const reporter = new SimulationReporter('./reports');

  // Setup periodic reporting
  let reportCount = 0;
  const reportInterval = setInterval(async () => {
    reportCount++;
    const state = orchestrator.getState();

    console.log('');
    console.log(`─── Snapshot ${reportCount} ───`);
    console.log(`Iteration: ${state.iteration}`);
    console.log(`Active Agents: ${state.network.agents.filter(a => a.state.status !== 'OFFLINE').length}/${state.network.agents.length}`);
    console.log(`Busy Agents: ${state.network.agents.filter(a => a.state.status === 'BUSY').length}`);
    console.log(`Total Decisions: ${state.metrics.agent.totalDecisions}`);
    console.log(`Decision Quality: ${state.metrics.agent.decisionQuality.toFixed(2)}%`);
    console.log(`Network Trust: ${state.metrics.network.trust.toFixed(2)}%`);
    console.log(`Utilization: ${state.metrics.performance.utilizationRate.toFixed(2)}%`);

    // Save snapshot
    await reporter.generateSnapshot(state, state.iteration);
  }, 60000); // Every minute

  // Start simulation
  console.log('Starting simulation...');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    await orchestrator.start();

    // Stop reporting
    clearInterval(reportInterval);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Simulation completed successfully!');
    console.log('');

    // Generate final reports
    console.log('Generating final reports...');
    const finalState = orchestrator.getState();
    await reporter.generateFullReport(finalState);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SIMULATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total Iterations: ${finalState.iteration}`);
    console.log(`  Total Events: ${finalState.events.length}`);
    console.log(`  Total Decisions: ${finalState.metrics.agent.totalDecisions}`);
    console.log(`  Decision Quality: ${finalState.metrics.agent.decisionQuality.toFixed(2)}%`);
    console.log(`  Collaboration Level: ${finalState.metrics.agent.collaborationLevel.toFixed(1)}`);
    console.log(`  Network Trust: ${finalState.metrics.network.trust.toFixed(2)}%`);
    console.log(`  Network Connectivity: ${finalState.metrics.network.connectivity.toFixed(2)}%`);
    console.log(`  Final Utilization: ${finalState.metrics.performance.utilizationRate.toFixed(2)}%`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Reports saved to ./reports directory');
    console.log('');

  } catch (error) {
    clearInterval(reportInterval);
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('Simulation error:');
    console.error(error);
    console.error('═══════════════════════════════════════════════════════════');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run simulation
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
