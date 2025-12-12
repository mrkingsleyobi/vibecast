import { SwarmOrchestrator } from './index.js';

/**
 * F1 Race Simulation
 * Demonstrates the swarm system with simulated race data
 */

async function simulateRace() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   F1 STRATEGY OPTIMIZER SWARM - RACE SIMULATION          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Initialize orchestrator
  const orchestrator = new SwarmOrchestrator();

  try {
    await orchestrator.initialize();

    // Simulate race scenario
    const raceScenario = generateRaceScenario();

    console.log('\n📊 Race Scenario:');
    console.log(`   Track: ${raceScenario.track}`);
    console.log(`   Current Lap: ${raceScenario.currentLap}/${raceScenario.totalLaps}`);
    console.log(`   Current Position: P${raceScenario.position}`);
    console.log(`   Tire Age: ${raceScenario.tireAge} laps`);
    console.log(`   Current Compound: ${raceScenario.currentCompound}`);

    // Process through swarm
    const strategy = await orchestrator.processRaceData(raceScenario);

    // Display results
    displayStrategy(strategy);

    // Simulate multiple laps
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('🏁 MULTI-LAP SIMULATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (let lap = raceScenario.currentLap; lap <= Math.min(raceScenario.currentLap + 5, raceScenario.totalLaps); lap++) {
      console.log(`\n--- Lap ${lap} ---`);

      const lapData = generateLapData(lap, raceScenario.totalLaps);
      const lapStrategy = await orchestrator.processRaceData(lapData);

      console.log(`Primary Recommendation: ${lapStrategy.primaryRecommendation.recommendation}`);
      console.log(`Confidence: ${(lapStrategy.consensus.confidence * 100).toFixed(1)}%`);

      // Simulate lap time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Show final status
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📈 SWARM STATUS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const status = orchestrator.getStatus();
    console.log(JSON.stringify(status, null, 2));

    // Shutdown
    await orchestrator.shutdown();

    console.log('\n✅ Simulation complete!\n');

  } catch (error) {
    console.error('❌ Simulation failed:', error);
    await orchestrator.shutdown();
    process.exit(1);
  }
}

function generateRaceScenario() {
  return {
    // Race info
    track: 'Silverstone Circuit',
    currentLap: 15,
    totalLaps: 52,
    position: 5,

    // Car state
    tireAge: 14,
    currentCompound: 'C3',

    // Gaps
    gapToCarAhead: 3.2,
    gapToCarBehind: 1.8,

    // Weather
    currentWeather: 'cloudy',
    temperature: 22,
    humidity: 65,
    windSpeed: 15,
    windDirection: 'SW',
    pressure: 1013,
    trackTemp: 38,

    // Track
    trackPosition: 'mid-field',
    trackCondition: 'dry',

    // Telemetry
    engineTemp: 98,
    brakeTemps: {
      frontLeft: 450,
      frontRight: 460,
      rearLeft: 380,
      rearRight: 375
    },
    tireTemps: {
      frontLeft: 92,
      frontRight: 91,
      rearLeft: 88,
      rearRight: 89
    },
    tirePressures: {
      frontLeft: 23.5,
      frontRight: 23.6,
      rearLeft: 21.0,
      rearRight: 21.1
    },
    fuelRemaining: 65,
    ersCharge: 3200000,

    // Competitors
    competitorData: [
      {
        driverId: 'VER',
        team: 'Red Bull',
        position: 1,
        gap: -18.5,
        tireCompound: 'C2',
        tireAge: 15,
        likelyToPit: false
      },
      {
        driverId: 'HAM',
        team: 'Mercedes',
        position: 4,
        gap: -3.2,
        tireCompound: 'C3',
        tireAge: 12,
        likelyToPit: false
      },
      {
        driverId: 'NOR',
        team: 'McLaren',
        position: 6,
        gap: 1.8,
        tireCompound: 'C4',
        tireAge: 10,
        likelyToPit: true
      }
    ],

    competitorLapTimes: {
      VER: [89.5, 89.3, 89.4, 89.6, 89.4],
      HAM: [90.1, 90.0, 89.9, 90.2, 90.0],
      NOR: [90.8, 91.0, 91.2, 91.5, 91.8]
    },

    competitorTireData: {
      VER: { compound: 'C2', age: 15, stintNumber: 1, degradation: 0.4 },
      HAM: { compound: 'C3', age: 12, stintNumber: 1, degradation: 0.5 },
      NOR: { compound: 'C4', age: 10, stintNumber: 1, degradation: 0.7 }
    },

    // Current performance
    speed: 285,
    gear: 7,
    throttle: 0.85,
    brake: 0,
    drs: true,
    lapTime: 90.5,
    targetLapTime: 89.8,
    sector: 2,

    // Flags
    safetyCarOut: false,
    virtualSafetyCar: false,
    yellowFlag: false,

    // Strategy options
    possibleStrategies: [
      {
        name: 'One-Stop Medium-Hard',
        pitLaps: [25],
        compounds: ['Medium', 'Hard'],
        startPosition: 5
      },
      {
        name: 'Two-Stop Aggressive',
        pitLaps: [20, 38],
        compounds: ['Soft', 'Medium', 'Soft'],
        startPosition: 5
      },
      {
        name: 'One-Stop Extended',
        pitLaps: [32],
        compounds: ['Medium', 'Medium'],
        startPosition: 5
      }
    ]
  };
}

function generateLapData(currentLap, totalLaps) {
  const baseScenario = generateRaceScenario();

  return {
    ...baseScenario,
    currentLap,
    tireAge: currentLap - 1,

    // Simulate tire degradation
    tireTemps: {
      frontLeft: 92 + (currentLap - 15) * 0.3,
      frontRight: 91 + (currentLap - 15) * 0.3,
      rearLeft: 88 + (currentLap - 15) * 0.2,
      rearRight: 89 + (currentLap - 15) * 0.2
    },

    // Simulate fuel consumption
    fuelRemaining: 110 - (currentLap * 1.8),

    // Add some randomness to weather
    humidity: 65 + Math.random() * 5,
    temperature: 22 + Math.random() * 2
  };
}

function displayStrategy(strategy) {
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('🎯 SWARM CONSENSUS STRATEGY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`✓ Consensus Achieved: ${strategy.consensus.achieved ? 'Yes' : 'No'}`);
  console.log(`✓ Overall Confidence: ${(strategy.consensus.confidence * 100).toFixed(1)}%`);
  console.log(`✓ Contributing Agents: ${strategy.consensus.participatingAgents}`);

  console.log('\n📋 PRIMARY RECOMMENDATION:');
  console.log(`   Agent: ${strategy.primaryRecommendation.agent}`);
  console.log(`   Recommendation: ${strategy.primaryRecommendation.recommendation}`);
  console.log(`   Confidence: ${(strategy.primaryRecommendation.confidence * 100).toFixed(1)}%`);

  if (strategy.strategicActions.length > 0) {
    console.log('\n⚡ STRATEGIC ACTIONS:');
    strategy.strategicActions.forEach((action, i) => {
      console.log(`   ${i + 1}. [${action.type}] ${action.action || `Lap ${action.lap}`}`);
      if (action.compound) console.log(`      → Compound: ${action.compound}`);
      if (action.window) console.log(`      → Window: ${action.window}`);
    });
  }

  console.log('\n📊 STRATEGY SUMMARY:');

  if (strategy.summary.tireStrategy) {
    console.log('\n   🏎️  Tire Strategy:');
    console.log(`      • Recommended: ${strategy.summary.tireStrategy.recommendedCompound}`);
    console.log(`      • Pit Lap: ${strategy.summary.tireStrategy.recommendedPitLap || 'TBD'}`);
    console.log(`      • Current Degradation: ${strategy.summary.tireStrategy.degradation || 'N/A'}`);
  }

  if (strategy.summary.pitStrategy) {
    console.log('\n   ⏱️  Pit Strategy:');
    console.log(`      • Type: ${strategy.summary.pitStrategy.strategy}`);
    console.log(`      • Optimal Lap: ${strategy.summary.pitStrategy.optimalLap || 'N/A'}`);
    console.log(`      • Window: ${strategy.summary.pitStrategy.window}`);
  }

  if (strategy.summary.weatherOutlook) {
    console.log('\n   ☁️  Weather Outlook:');
    console.log(`      • Rain Probability: ${strategy.summary.weatherOutlook.rainProbability}`);
    console.log(`      • Expected Rain Lap: ${strategy.summary.weatherOutlook.estimatedRainLap}`);
    console.log(`      • Track Condition: ${strategy.summary.weatherOutlook.trackCondition}`);
  }

  if (strategy.summary.competitorThreats) {
    console.log('\n   🏁 Competitor Analysis:');
    console.log(`      • Threats: ${strategy.summary.competitorThreats.threatsCount}`);
    console.log(`      • Opportunities: ${strategy.summary.competitorThreats.opportunitiesCount}`);
    console.log(`      • Top Threat: ${strategy.summary.competitorThreats.topThreat}`);
  }

  if (strategy.summary.riskAssessment) {
    console.log('\n   📈 Race Simulation:');
    console.log(`      • Expected Position: P${strategy.summary.riskAssessment.expectedPosition}`);
    console.log(`      • Win Probability: ${strategy.summary.riskAssessment.winProbability}`);
    console.log(`      • Podium Probability: ${strategy.summary.riskAssessment.podiumProbability}`);
  }

  console.log('\n\n🤖 ALL AGENT RECOMMENDATIONS:');
  strategy.allRecommendations.forEach((rec, i) => {
    console.log(`\n   ${i + 1}. ${rec.agent}`);
    console.log(`      ${rec.recommendation}`);
    console.log(`      (Confidence: ${(rec.confidence * 100).toFixed(1)}%, Priority: ${rec.priority})`);
  });
}

// Run simulation
simulateRace().catch(console.error);
