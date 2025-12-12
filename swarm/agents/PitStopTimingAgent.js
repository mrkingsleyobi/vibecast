import { Agent } from '../core/Agent.js';

/**
 * Pit Stop Timing Agent
 * Optimizes pit stop timing considering undercut/overcut strategies
 */
export class PitStopTimingAgent extends Agent {
  constructor(config) {
    super(config);
    this.pitHistory = [];
    this.competitorPitData = [];
  }

  async setup() {
    console.log(`[PitStopTimingAgent] Initializing pit strategy optimization...`);
  }

  async analyze(data) {
    const {
      currentLap,
      totalLaps,
      position,
      gapToCarAhead,
      gapToCarBehind,
      tireAge,
      currentCompound,
      competitorData,
      trackPosition,
      safetyCarOut
    } = data;

    // Calculate pit stop loss
    const pitStopLoss = this.calculatePitStopLoss(trackPosition);

    // Analyze undercut opportunity
    const undercutAnalysis = this.analyzeUndercut(
      gapToCarAhead,
      tireAge,
      pitStopLoss,
      competitorData
    );

    // Analyze overcut opportunity
    const overcutAnalysis = this.analyzeOvercut(
      gapToCarBehind,
      tireAge,
      pitStopLoss
    );

    // Calculate optimal pit window
    const pitWindow = this.calculateOptimalPitWindow(
      currentLap,
      totalLaps,
      tireAge,
      undercutAnalysis,
      overcutAnalysis
    );

    // Safety car strategy
    const safetyCarStrategy = this.analyzeSafetyCarStrategy(
      safetyCarOut,
      currentLap,
      tireAge
    );

    // Traffic management
    const trafficAnalysis = this.analyzeTraffic(competitorData, currentLap);

    const confidence = this.calculateConfidence(data);

    const analysis = {
      pitStopLoss,
      undercutWindow: undercutAnalysis.window,
      undercutViable: undercutAnalysis.viable,
      overcutWindow: overcutAnalysis.window,
      overcutViable: overcutAnalysis.viable,
      optimalPitLap: pitWindow.optimal,
      pitWindowStart: pitWindow.start,
      pitWindowEnd: pitWindow.end,
      safetyCarStrategy,
      trafficClearLaps: trafficAnalysis.clearLaps,
      expectedPositionChange: this.calculatePositionChange(pitWindow, competitorData),
      recommendation: this.generateRecommendation(
        pitWindow,
        undercutAnalysis,
        overcutAnalysis,
        safetyCarStrategy
      )
    };

    return this.makeDecision(analysis, confidence);
  }

  calculatePitStopLoss(trackPosition) {
    // Base pit stop time + pit lane time loss
    const basePitTime = 22; // seconds (typical F1 pit stop)
    const pitLaneSpeed = 60; // km/h
    const pitLaneLength = 350; // meters (average)
    const racingSpeed = 200; // km/h (average)

    const pitLaneTime = (pitLaneLength / 1000) / pitLaneSpeed * 3600;
    const racingTime = (pitLaneLength / 1000) / racingSpeed * 3600;
    const timeLoss = basePitTime + (pitLaneTime - racingTime);

    return timeLoss;
  }

  analyzeUndercut(gapToCarAhead, tireAge, pitStopLoss, competitorData) {
    if (!gapToCarAhead || gapToCarAhead > 25) {
      return { viable: false, window: null, expectedGain: 0 };
    }

    // Fresh tire advantage: ~0.5s per lap for first 5 laps
    const freshTireAdvantage = 0.5;
    const advantageLaps = 5;
    const totalGain = freshTireAdvantage * advantageLaps;

    const netGain = totalGain - pitStopLoss;
    const viable = netGain > gapToCarAhead;

    return {
      viable,
      window: viable ? { start: tireAge + 1, end: tireAge + 3 } : null,
      expectedGain: netGain,
      confidence: competitorData ? 0.8 : 0.5
    };
  }

  analyzeOvercut(gapToCarBehind, tireAge, pitStopLoss) {
    if (!gapToCarBehind || gapToCarBehind < 3) {
      return { viable: false, window: null, expectedGain: 0 };
    }

    // Stay out longer to benefit from lighter fuel load and track evolution
    const fuelAdvantage = 0.03; // seconds per lap per kg
    const avgFuelBurn = 1.5; // kg per lap
    const extraLaps = 5;
    const totalGain = (fuelAdvantage * avgFuelBurn * extraLaps) + (0.2 * extraLaps); // track evolution

    const viable = totalGain > pitStopLoss - gapToCarBehind;

    return {
      viable,
      window: viable ? { start: tireAge + 5, end: tireAge + 10 } : null,
      expectedGain: totalGain,
      confidence: 0.7
    };
  }

  calculateOptimalPitWindow(currentLap, totalLaps, tireAge, undercut, overcut) {
    const remainingLaps = totalLaps - currentLap;

    let optimal = currentLap + Math.floor(remainingLaps / 2);

    // Adjust based on undercut/overcut
    if (undercut.viable) {
      optimal = Math.min(optimal, currentLap + 2);
    } else if (overcut.viable) {
      optimal = Math.max(optimal, currentLap + 5);
    }

    // Ensure we have enough laps to finish
    const minLapsToFinish = 15;
    if (remainingLaps < minLapsToFinish) {
      optimal = null; // Too late to pit
    }

    return {
      optimal,
      start: optimal ? optimal - 2 : null,
      end: optimal ? optimal + 3 : null,
      strategy: undercut.viable ? 'undercut' : (overcut.viable ? 'overcut' : 'standard')
    };
  }

  analyzeSafetyCarStrategy(safetyCarOut, currentLap, tireAge) {
    if (safetyCarOut) {
      return {
        recommendation: 'PIT-NOW',
        reason: 'Safety car deployed - free pit stop opportunity',
        expectedLoss: 5, // Much lower loss under safety car
        priority: 'critical'
      };
    }

    // Predict safety car probability
    const safetyCarProbability = this.predictSafetyCarProbability(currentLap);

    if (safetyCarProbability > 0.3 && tireAge < 10) {
      return {
        recommendation: 'WAIT',
        reason: 'High safety car probability - delay pit stop',
        probability: safetyCarProbability,
        priority: 'high'
      };
    }

    return {
      recommendation: 'NORMAL',
      reason: 'Low safety car probability',
      probability: safetyCarProbability,
      priority: 'low'
    };
  }

  predictSafetyCarProbability(currentLap) {
    // Simple model: higher probability at race start and end
    if (currentLap < 5) return 0.4;
    if (currentLap > 50) return 0.3;
    return 0.15;
  }

  analyzeTraffic(competitorData, currentLap) {
    if (!competitorData || competitorData.length === 0) {
      return { clearLaps: [currentLap + 1], trafficDensity: 'unknown' };
    }

    // Find laps with minimal traffic
    const clearLaps = [];
    for (let i = 1; i <= 5; i++) {
      const projectedLap = currentLap + i;
      const traffic = competitorData.filter(c =>
        Math.abs(c.projectedPosition - projectedLap) < 2
      );

      if (traffic.length < 2) {
        clearLaps.push(projectedLap);
      }
    }

    return {
      clearLaps,
      trafficDensity: clearLaps.length > 3 ? 'light' : 'heavy'
    };
  }

  calculatePositionChange(pitWindow, competitorData) {
    if (!pitWindow.optimal || !competitorData) {
      return { expected: 0, bestCase: 0, worstCase: 0 };
    }

    // Simple position change estimation
    const carsLikeToPit = competitorData.filter(c => c.likelyToPit).length;

    return {
      expected: -2,
      bestCase: 0,
      worstCase: -4,
      confidence: 0.6
    };
  }

  calculateConfidence(data) {
    let confidence = 0.7;

    if (data.competitorData && data.competitorData.length > 0) confidence += 0.1;
    if (data.gapToCarAhead && data.gapToCarBehind) confidence += 0.1;
    if (this.pitHistory.length > 2) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(pitWindow, undercut, overcut, safetyCarStrategy) {
    if (safetyCarStrategy.priority === 'critical') {
      return `CRITICAL: ${safetyCarStrategy.recommendation} - ${safetyCarStrategy.reason}`;
    }

    if (!pitWindow.optimal) {
      return 'INFO: Too late for pit stop. Continue to finish on current tires.';
    }

    if (undercut.viable) {
      return `HIGH: Undercut opportunity! Pit in laps ${undercut.window.start}-${undercut.window.end} to gain position.`;
    }

    if (overcut.viable) {
      return `MEDIUM: Overcut strategy viable. Stay out until lap ${overcut.window.end} then pit.`;
    }

    return `INFO: Standard pit window: laps ${pitWindow.start}-${pitWindow.end}. Optimal: lap ${pitWindow.optimal}.`;
  }
}

export default PitStopTimingAgent;
