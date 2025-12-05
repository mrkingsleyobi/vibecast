/**
 * DXP Agency Innovation Simulation - Enhanced Entry Point
 * Discovering breakthrough opportunities 50 years ahead with today's tech
 */

import dotenv from 'dotenv';
import { SimulationOrchestrator } from './simulation/orchestrator';
import { SimulationReporter } from './utils/reporter';
import { InnovationReporter } from './utils/innovation-reporter';
import { generateInnovationScenarios } from './simulation/innovation-scenarios';
import { SimulationConfig } from './models/simulation-state';

// Load environment variables
dotenv.config();

/**
 * Innovation-focused simulation runner
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🚀 DXP AGENCY INNOVATION SIMULATION');
  console.log('  Discovering Breakthrough Opportunities 50 Years Ahead');
  console.log('  Using Technology Available Today');
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

  // Generate innovation scenarios
  console.log('🔬 Generating future-forward innovation scenarios...');
  const innovationScenarios = generateInnovationScenarios();
  console.log(`✓ Generated ${innovationScenarios.length} breakthrough innovation scenarios`);
  console.log('');

  // Enhanced configuration for innovation discovery
  const config: SimulationConfig = {
    duration: 180000, // 3 minutes - longer for deeper insights
    tickInterval: 100, // 100ms per tick
    agentCount: 5, // 5 federated agents
    initialClients: 5, // More clients for richer simulation
    marketDynamics: true,
    enableLearning: true,
    enableAdaptation: true,
    scenarios: innovationScenarios.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      triggers: [{
        condition: `breakthroughPotential > ${s.breakthroughPotential}`,
        timestamp: new Date(Date.now() + Math.random() * 60000),
        actions: ['evaluate', 'collaborate', 'innovate']
      }],
      parameters: {
        futureVision: s.futureVision,
        technologies: s.currentTech,
        breakthroughPotential: s.breakthroughPotential
      },
      expectedOutcomes: s.expectedOutcomes
    }))
  };

  console.log('Innovation Simulation Configuration:');
  console.log(`  - Duration: ${config.duration / 1000}s (extended for deep analysis)`);
  console.log(`  - Tick Interval: ${config.tickInterval}ms`);
  console.log(`  - Agent Count: ${config.agentCount} (federated network)`);
  console.log(`  - Innovation Scenarios: ${config.scenarios.length}`);
  console.log(`  - Market Dynamics: ${config.marketDynamics ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Learning: ${config.enableLearning ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Adaptation: ${config.enableAdaptation ? 'Enabled' : 'Disabled'}`);
  console.log('');

  console.log('🌟 Innovation Focus Areas:');
  const topScenarios = innovationScenarios
    .sort((a, b) => b.breakthroughPotential - a.breakthroughPotential)
    .slice(0, 5);

  topScenarios.forEach((scenario, index) => {
    console.log(`  ${index + 1}. ${scenario.name} (${scenario.breakthroughPotential}% breakthrough potential)`);
  });
  console.log('');

  // Create orchestrator
  console.log('Initializing innovation simulation orchestrator...');
  const orchestrator = new SimulationOrchestrator(config);
  console.log('✓ Orchestrator initialized with innovation scenarios');
  console.log('');

  // Create reporters
  const reporter = new SimulationReporter('./reports');
  const innovationReporter = new InnovationReporter('./reports');

  // Setup periodic reporting with innovation tracking
  let reportCount = 0;
  const reportInterval = setInterval(async () => {
    reportCount++;
    const state = orchestrator.getState();

    console.log('');
    console.log(`─── Innovation Snapshot ${reportCount} ───`);
    console.log(`Iteration: ${state.iteration}`);
    console.log(`Active Agents: ${state.network.agents.filter(a => a.state.status !== 'OFFLINE').length}/${state.network.agents.length}`);
    console.log(`Collaboration Events: ${state.network.agents.reduce((sum, a) => sum + a.communicationLog.length, 0)}`);
    console.log(`Total Decisions: ${state.metrics.agent.totalDecisions}`);
    console.log(`Decision Quality: ${state.metrics.agent.decisionQuality.toFixed(2)}%`);
    console.log(`Innovation Rate: ${state.network.networkMetrics.innovationRate.toFixed(2)}`);
    console.log(`Knowledge Growth: ${state.network.networkMetrics.knowledgeGrowth.toFixed(2)}`);

    // Save snapshot
    await reporter.generateSnapshot(state, state.iteration);
  }, 40000); // Every 40 seconds for faster updates

  // Start simulation
  console.log('🚀 Starting innovation discovery simulation...');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    await orchestrator.start();

    // Stop reporting
    clearInterval(reportInterval);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Innovation simulation completed successfully!');
    console.log('');

    // Generate final reports
    console.log('📊 Generating comprehensive reports...');
    const finalState = orchestrator.getState();
    await reporter.generateFullReport(finalState);

    console.log('');
    console.log('🔬 Generating innovation breakthrough analysis...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportId = `innovation-${timestamp}`;

    await innovationReporter.generateInnovationReport(innovationScenarios, finalState, reportId);
    await innovationReporter.generateInnovationMetrics(innovationScenarios, reportId);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📈 INNOVATION SIMULATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total Iterations: ${finalState.iteration}`);
    console.log(`  Total Events: ${finalState.events.length}`);
    console.log(`  Total Decisions: ${finalState.metrics.agent.totalDecisions}`);
    console.log(`  Decision Quality: ${finalState.metrics.agent.decisionQuality.toFixed(2)}%`);
    console.log(`  Collaboration Level: ${finalState.metrics.agent.collaborationLevel.toFixed(1)}`);
    console.log(`  Network Trust: ${finalState.metrics.network.trust.toFixed(2)}%`);
    console.log(`  Knowledge Growth: ${finalState.network.networkMetrics.knowledgeGrowth.toFixed(2)}`);
    console.log(`  Innovation Rate: ${finalState.network.networkMetrics.innovationRate.toFixed(2)}`);
    console.log('');
    console.log('  🚀 Innovation Scenarios Analyzed: ${innovationScenarios.length}');

    const avgBreakthrough = innovationScenarios.reduce((sum, s) => sum + s.breakthroughPotential, 0) / innovationScenarios.length;
    console.log(`  💡 Average Breakthrough Potential: ${avgBreakthrough.toFixed(1)}%`);

    const readyNow = innovationScenarios.filter(s => s.currentTech.length >= 4);
    console.log(`  ⚡ Ready for Implementation: ${readyNow.length} scenarios`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📁 Reports saved to ./reports directory:');
    console.log(`  - Standard simulation reports`);
    console.log(`  - ${reportId}-innovation-breakthroughs.md`);
    console.log(`  - ${reportId}-innovation-metrics.json`);
    console.log('');
    console.log('🎉 Breakthrough opportunities discovered!');
    console.log('   Read the innovation report for detailed analysis.');
    console.log('');

  } catch (error) {
    clearInterval(reportInterval);
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Simulation error:');
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

// Run innovation simulation
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
