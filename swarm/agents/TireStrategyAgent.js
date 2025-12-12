import { Agent } from '../core/Agent.js';

/**
 * Tire Strategy Agent
 * Analyzes tire compounds, degradation, and optimal pit windows
 */
export class TireStrategyAgent extends Agent {
  constructor(config) {
    super(config);
    this.tireData = {
      compounds: ['C1', 'C2', 'C3', 'C4', 'C5', 'Intermediate', 'Wet'],
      degradationRates: {},
      optimalWindows: {},
      currentCompound: null
    };
  }

  async setup() {
    console.log(`[TireStrategyAgent] Setting up tire compound analysis...`);
    // Initialize tire compound characteristics
    this.initializeTireCompounds();
  }

  initializeTireCompounds() {
    this.tireData.degradationRates = {
      C1: { hardness: 'Hard', degradation: 0.05, optimalLaps: 35 },
      C2: { hardness: 'Hard', degradation: 0.06, optimalLaps: 32 },
      C3: { hardness: 'Medium', degradation: 0.08, optimalLaps: 28 },
      C4: { hardness: 'Medium', degradation: 0.10, optimalLaps: 24 },
      C5: { hardness: 'Soft', degradation: 0.15, optimalLaps: 18 },
      Intermediate: { hardness: 'Wet', degradation: 0.12, optimalLaps: 25 },
      Wet: { hardness: 'Wet', degradation: 0.10, optimalLaps: 30 }
    };
  }

  async analyze(data) {
    const {
      currentLap,
      totalLaps,
      tireAge,
      currentCompound,
      trackTemp,
      trackCondition,
      lapTime,
      targetLapTime
    } = data;

    // Calculate tire degradation
    const degradation = this.calculateDegradation(tireAge, currentCompound, trackTemp);

    // Determine optimal pit window
    const pitWindow = this.calculatePitWindow(currentLap, totalLaps, tireAge, degradation);

    // Recommend compound strategy
    const compoundStrategy = this.recommendCompoundStrategy(
      totalLaps - currentLap,
      trackCondition,
      trackTemp
    );

    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(data);

    const analysis = {
      currentDegradation: degradation,
      recommendedPitLap: pitWindow.optimal,
      pitWindowStart: pitWindow.earliest,
      pitWindowEnd: pitWindow.latest,
      recommendedCompound: compoundStrategy.nextCompound,
      strategyType: compoundStrategy.strategy,
      expectedLapTimeLoss: this.calculateLapTimeLoss(degradation),
      remainingPerformance: this.calculateRemainingPerformance(tireAge, currentCompound),
      recommendation: this.generateRecommendation(pitWindow, compoundStrategy, degradation)
    };

    return this.makeDecision(analysis, confidence);
  }

  calculateDegradation(tireAge, compound, trackTemp) {
    const baseRate = this.tireData.degradationRates[compound]?.degradation || 0.08;
    const tempFactor = (trackTemp - 30) / 20; // Temperature impact
    const ageFactor = Math.pow(tireAge / 10, 1.5); // Non-linear degradation

    return Math.min(baseRate * ageFactor * (1 + tempFactor * 0.2), 1.0);
  }

  calculatePitWindow(currentLap, totalLaps, tireAge, degradation) {
    const remainingLaps = totalLaps - currentLap;
    const degradationThreshold = 0.75;

    let optimal = currentLap + Math.floor(remainingLaps / 2);

    if (degradation > degradationThreshold) {
      optimal = currentLap + 3; // Pit soon
    }

    return {
      earliest: Math.max(currentLap + 1, optimal - 5),
      optimal,
      latest: Math.min(totalLaps - 2, optimal + 5)
    };
  }

  recommendCompoundStrategy(remainingLaps, trackCondition, trackTemp) {
    if (trackCondition === 'wet') {
      return {
        nextCompound: 'Intermediate',
        strategy: 'wet-weather',
        reason: 'Wet track conditions'
      };
    }

    if (trackCondition === 'very-wet') {
      return {
        nextCompound: 'Wet',
        strategy: 'wet-weather',
        reason: 'Heavy rain conditions'
      };
    }

    // Dry conditions
    if (remainingLaps > 25) {
      return {
        nextCompound: 'C2',
        strategy: 'two-stop',
        reason: 'Long stint on medium compound'
      };
    } else if (remainingLaps > 15) {
      return {
        nextCompound: 'C3',
        strategy: 'one-stop',
        reason: 'Medium stint on soft compound'
      };
    } else {
      return {
        nextCompound: 'C5',
        strategy: 'sprint-to-finish',
        reason: 'Short stint on softest compound'
      };
    }
  }

  calculateLapTimeLoss(degradation) {
    return degradation * 2.5; // Seconds per lap
  }

  calculateRemainingPerformance(tireAge, compound) {
    const optimalLaps = this.tireData.degradationRates[compound]?.optimalLaps || 25;
    return Math.max(0, Math.min(1, (optimalLaps - tireAge) / optimalLaps));
  }

  calculateConfidence(data) {
    let confidence = 0.8;

    if (data.trackTemp && data.trackCondition) confidence += 0.1;
    if (data.lapTime && data.targetLapTime) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(pitWindow, compoundStrategy, degradation) {
    if (degradation > 0.8) {
      return 'CRITICAL: Tire degradation critical. Pit immediately.';
    } else if (degradation > 0.6) {
      return `HIGH: Recommend pitting in lap ${pitWindow.optimal}. Switch to ${compoundStrategy.nextCompound}.`;
    } else if (degradation > 0.4) {
      return `MEDIUM: Monitor tire wear. Pit window: laps ${pitWindow.earliest}-${pitWindow.latest}.`;
    } else {
      return `LOW: Tires in good condition. Continue current stint.`;
    }
  }
}

export default TireStrategyAgent;
