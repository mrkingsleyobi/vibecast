import { Agent } from '../core/Agent.js';

/**
 * Race Simulation Agent
 * Runs Monte Carlo simulations to predict race outcomes
 */
export class RaceSimulationAgent extends Agent {
  constructor(config) {
    super(config);
    this.simulationIterations = config.config?.iterations || 10000;
    this.simulationHistory = [];
  }

  async setup() {
    console.log(`[RaceSimulationAgent] Initializing Monte Carlo simulation engine with ${this.simulationIterations} iterations...`);
  }

  async analyze(data) {
    const {
      currentLap,
      totalLaps,
      currentPosition,
      possibleStrategies,
      weatherData,
      competitorData,
      tireData
    } = data;

    // Run Monte Carlo simulation
    const simulationResults = await this.runMonteCarloSimulation(
      currentLap,
      totalLaps,
      possibleStrategies || this.generateDefaultStrategies(totalLaps - currentLap)
    );

    // Analyze best strategy
    const bestStrategy = this.findBestStrategy(simulationResults);

    // Calculate risk factors
    const riskAnalysis = this.analyzeRisk(simulationResults);

    // Generate probability distribution
    const probabilityDistribution = this.generateProbabilityDistribution(simulationResults);

    const confidence = this.calculateConfidence(data);

    const analysis = {
      simulatedScenarios: this.simulationIterations,
      bestStrategy,
      alternativeStrategies: this.getTopStrategies(simulationResults, 3),
      expectedPosition: bestStrategy.avgPosition,
      positionProbabilities: probabilityDistribution,
      riskFactors: riskAnalysis,
      winProbability: probabilityDistribution[1] || 0,
      podiumProbability: this.calculatePodiumProbability(probabilityDistribution),
      pointsProbability: this.calculatePointsProbability(probabilityDistribution),
      recommendation: this.generateRecommendation(bestStrategy, riskAnalysis)
    };

    return this.makeDecision(analysis, confidence);
  }

  async runMonteCarloSimulation(currentLap, totalLaps, strategies) {
    const results = [];

    for (const strategy of strategies) {
      const simulations = [];

      for (let i = 0; i < this.simulationIterations; i++) {
        const simulation = this.simulateSingleRace(
          currentLap,
          totalLaps,
          strategy,
          this.generateRandomFactors()
        );
        simulations.push(simulation);
      }

      results.push({
        strategy,
        simulations,
        avgPosition: this.calculateAverage(simulations.map(s => s.finalPosition)),
        avgTime: this.calculateAverage(simulations.map(s => s.totalTime)),
        successRate: simulations.filter(s => s.finalPosition <= 3).length / simulations.length,
        variance: this.calculateVariance(simulations.map(s => s.finalPosition))
      });
    }

    return results;
  }

  simulateSingleRace(currentLap, totalLaps, strategy, randomFactors) {
    let position = strategy.startPosition || 5;
    let totalTime = 0;
    let pitStops = 0;

    const remainingLaps = totalLaps - currentLap;

    for (let lap = currentLap; lap <= totalLaps; lap++) {
      // Base lap time
      let lapTime = 90 + Math.random() * 2; // 90-92 seconds

      // Tire degradation
      const tireAge = this.calculateTireAge(lap, strategy.pitLaps, currentLap);
      lapTime += tireAge * 0.05;

      // Weather impact
      if (randomFactors.rainLap && lap >= randomFactors.rainLap) {
        lapTime += 5;
      }

      // Safety car
      if (randomFactors.safetyCarLaps.includes(lap)) {
        lapTime = 120; // Slow lap under SC
      }

      // Pit stop
      if (strategy.pitLaps && strategy.pitLaps.includes(lap)) {
        lapTime += 22; // Pit stop time loss
        pitStops++;
        position += 2; // Lose positions in pit
      }

      // Overtaking/being overtaken
      if (Math.random() < 0.05) {
        position += Math.random() > 0.5 ? 1 : -1;
      }

      totalTime += lapTime;
    }

    return {
      finalPosition: Math.max(1, Math.min(20, position)),
      totalTime,
      pitStops,
      incidents: randomFactors.incidents
    };
  }

  generateRandomFactors() {
    return {
      rainLap: Math.random() < 0.2 ? Math.floor(Math.random() * 40) + 20 : null,
      safetyCarLaps: Math.random() < 0.3 ? [Math.floor(Math.random() * 50) + 10] : [],
      incidents: Math.floor(Math.random() * 3)
    };
  }

  calculateTireAge(currentLap, pitLaps, startLap) {
    if (!pitLaps || pitLaps.length === 0) {
      return currentLap - startLap;
    }

    const lastPit = pitLaps.filter(p => p < currentLap).pop();
    return lastPit ? currentLap - lastPit : currentLap - startLap;
  }

  generateDefaultStrategies(remainingLaps) {
    return [
      {
        name: 'One-Stop',
        pitLaps: [Math.floor(remainingLaps / 2)],
        compounds: ['Medium', 'Hard']
      },
      {
        name: 'Two-Stop',
        pitLaps: [Math.floor(remainingLaps / 3), Math.floor(2 * remainingLaps / 3)],
        compounds: ['Soft', 'Medium', 'Soft']
      },
      {
        name: 'No-Stop',
        pitLaps: [],
        compounds: ['Hard']
      }
    ];
  }

  findBestStrategy(results) {
    return results.reduce((best, current) => {
      if (current.avgPosition < best.avgPosition) {
        return current;
      }
      return best;
    });
  }

  getTopStrategies(results, count) {
    return results
      .sort((a, b) => a.avgPosition - b.avgPosition)
      .slice(0, count)
      .map(r => ({
        name: r.strategy.name,
        avgPosition: r.avgPosition.toFixed(2),
        successRate: (r.successRate * 100).toFixed(1) + '%'
      }));
  }

  analyzeRisk(results) {
    const risks = [];

    results.forEach(result => {
      if (result.variance > 4) {
        risks.push({
          strategy: result.strategy.name,
          risk: 'high-variance',
          description: 'Inconsistent results across simulations'
        });
      }

      if (result.successRate < 0.3) {
        risks.push({
          strategy: result.strategy.name,
          risk: 'low-success-rate',
          description: 'Less than 30% chance of top-3 finish'
        });
      }
    });

    return risks;
  }

  generateProbabilityDistribution(results) {
    const bestStrategy = this.findBestStrategy(results);
    const distribution = {};

    bestStrategy.simulations.forEach(sim => {
      const pos = Math.round(sim.finalPosition);
      distribution[pos] = (distribution[pos] || 0) + 1;
    });

    // Convert to probabilities
    Object.keys(distribution).forEach(pos => {
      distribution[pos] = distribution[pos] / this.simulationIterations;
    });

    return distribution;
  }

  calculatePodiumProbability(distribution) {
    return (distribution[1] || 0) + (distribution[2] || 0) + (distribution[3] || 0);
  }

  calculatePointsProbability(distribution) {
    let prob = 0;
    for (let i = 1; i <= 10; i++) {
      prob += distribution[i] || 0;
    }
    return prob;
  }

  calculateAverage(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  calculateVariance(values) {
    const avg = this.calculateAverage(values);
    const squareDiffs = values.map(val => Math.pow(val - avg, 2));
    return this.calculateAverage(squareDiffs);
  }

  calculateConfidence(data) {
    let confidence = 0.7;

    if (data.competitorData) confidence += 0.1;
    if (data.weatherData) confidence += 0.1;
    if (data.possibleStrategies) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(bestStrategy, riskAnalysis) {
    const riskLevel = riskAnalysis.length > 0 ? 'MEDIUM-HIGH' : 'LOW';

    return `SIMULATION: Best strategy is "${bestStrategy.strategy.name}" with expected position ${bestStrategy.avgPosition.toFixed(2)}. Success rate: ${(bestStrategy.successRate * 100).toFixed(1)}%. Risk level: ${riskLevel}.`;
  }
}

export default RaceSimulationAgent;
