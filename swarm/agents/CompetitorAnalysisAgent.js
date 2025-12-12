import { Agent } from '../core/Agent.js';

/**
 * Competitor Analysis Agent
 * Analyzes competitor strategies, pace, and behavior patterns
 */
export class CompetitorAnalysisAgent extends Agent {
  constructor(config) {
    super(config);
    this.competitorProfiles = new Map();
    this.strategyPredictions = new Map();
  }

  async setup() {
    console.log(`[CompetitorAnalysisAgent] Initializing competitor tracking systems...`);
  }

  async analyze(data) {
    const {
      currentLap,
      totalLaps,
      competitorPositions,
      competitorTireData,
      competitorLapTimes,
      historicalData
    } = data;

    // Update competitor profiles
    this.updateCompetitorProfiles(competitorPositions, competitorLapTimes);

    // Predict competitor strategies
    const strategyPredictions = this.predictCompetitorStrategies(
      currentLap,
      totalLaps,
      competitorTireData
    );

    // Analyze pace profiles
    const paceAnalysis = this.analyzePaceProfiles(competitorLapTimes);

    // Identify threats and opportunities
    const threats = this.identifyThreats(strategyPredictions, paceAnalysis);
    const opportunities = this.identifyOpportunities(strategyPredictions, paceAnalysis);

    // Predict next moves
    const nextMoves = this.predictNextMoves(currentLap, strategyPredictions);

    const confidence = this.calculateConfidence(data);

    const analysis = {
      competitorCount: competitorPositions?.length || 0,
      strategyPredictions: Array.from(strategyPredictions.values()),
      paceComparison: paceAnalysis,
      threats,
      opportunities,
      nextMoves,
      recommendedCounterStrategies: this.generateCounterStrategies(threats, opportunities),
      recommendation: this.generateRecommendation(threats, opportunities, nextMoves)
    };

    return this.makeDecision(analysis, confidence);
  }

  updateCompetitorProfiles(positions, lapTimes) {
    if (!positions) return;

    positions.forEach(competitor => {
      const profile = this.competitorProfiles.get(competitor.driverId) || {
        driverId: competitor.driverId,
        team: competitor.team,
        lapTimes: [],
        positions: [],
        averagePace: 0,
        consistency: 0,
        aggression: 0
      };

      profile.positions.push({
        lap: competitor.lap,
        position: competitor.position
      });

      if (lapTimes && lapTimes[competitor.driverId]) {
        profile.lapTimes.push(lapTimes[competitor.driverId]);
        profile.averagePace = this.calculateAveragePace(profile.lapTimes);
        profile.consistency = this.calculateConsistency(profile.lapTimes);
      }

      this.competitorProfiles.set(competitor.driverId, profile);
    });
  }

  predictCompetitorStrategies(currentLap, totalLaps, tireData) {
    const predictions = new Map();

    this.competitorProfiles.forEach((profile, driverId) => {
      const tireInfo = tireData?.[driverId];
      if (!tireInfo) return;

      const prediction = {
        driverId,
        currentStrategy: this.identifyStrategy(tireInfo, currentLap),
        likelyPitLap: this.predictPitStop(tireInfo, currentLap, totalLaps),
        likelyCompound: this.predictNextCompound(tireInfo, totalLaps - currentLap),
        strategyType: this.classifyStrategy(tireInfo),
        confidence: 0.7
      };

      predictions.set(driverId, prediction);
    });

    return predictions;
  }

  identifyStrategy(tireInfo, currentLap) {
    const { compound, age, stintNumber } = tireInfo;

    if (stintNumber === 1 && age > 20) {
      return 'long-first-stint';
    } else if (stintNumber > 1 && age < 10) {
      return 'multi-stop';
    } else {
      return 'standard';
    }
  }

  predictPitStop(tireInfo, currentLap, totalLaps) {
    const { age, compound, degradation } = tireInfo;

    // Simple prediction model
    if (degradation > 0.7) {
      return { lap: currentLap + 2, probability: 0.9 };
    } else if (degradation > 0.5) {
      return { lap: currentLap + 5, probability: 0.6 };
    } else {
      const remainingLaps = totalLaps - currentLap;
      return { lap: currentLap + Math.floor(remainingLaps / 2), probability: 0.4 };
    }
  }

  predictNextCompound(currentTireInfo, remainingLaps) {
    if (remainingLaps > 25) {
      return 'Hard';
    } else if (remainingLaps > 15) {
      return 'Medium';
    } else {
      return 'Soft';
    }
  }

  classifyStrategy(tireInfo) {
    const { stintNumber } = tireInfo;

    if (stintNumber === 1) return 'one-stop-potential';
    if (stintNumber === 2) return 'two-stop-likely';
    if (stintNumber >= 3) return 'multi-stop';

    return 'unknown';
  }

  analyzePaceProfiles(lapTimes) {
    if (!lapTimes) return [];

    const profiles = [];

    Object.entries(lapTimes).forEach(([driverId, times]) => {
      const profile = this.competitorProfiles.get(driverId);
      if (!profile) return;

      profiles.push({
        driverId,
        averagePace: profile.averagePace,
        consistency: profile.consistency,
        recentPace: this.calculateRecentPace(times),
        paceAdvantage: this.calculatePaceAdvantage(profile.averagePace, times)
      });
    });

    return profiles.sort((a, b) => a.averagePace - b.averagePace);
  }

  identifyThreats(predictions, paceAnalysis) {
    const threats = [];

    predictions.forEach((prediction, driverId) => {
      const pace = paceAnalysis.find(p => p.driverId === driverId);

      if (pace && pace.paceAdvantage > 0.3) {
        threats.push({
          driverId,
          type: 'pace-threat',
          severity: 'high',
          description: `${driverId} has significant pace advantage`,
          paceAdvantage: pace.paceAdvantage
        });
      }

      if (prediction.likelyPitLap?.probability > 0.7) {
        threats.push({
          driverId,
          type: 'undercut-threat',
          severity: 'medium',
          description: `${driverId} likely to pit soon (lap ${prediction.likelyPitLap.lap})`,
          estimatedLap: prediction.likelyPitLap.lap
        });
      }
    });

    return threats;
  }

  identifyOpportunities(predictions, paceAnalysis) {
    const opportunities = [];

    predictions.forEach((prediction, driverId) => {
      const pace = paceAnalysis.find(p => p.driverId === driverId);

      if (pace && pace.paceAdvantage < -0.3) {
        opportunities.push({
          driverId,
          type: 'pace-opportunity',
          potential: 'high',
          description: `Can overtake ${driverId} - slower pace`,
          paceDeficit: Math.abs(pace.paceAdvantage)
        });
      }

      if (prediction.currentStrategy === 'long-first-stint') {
        opportunities.push({
          driverId,
          type: 'strategy-opportunity',
          potential: 'medium',
          description: `${driverId} on old tires - undercut opportunity`,
          action: 'pit-before-them'
        });
      }
    });

    return opportunities;
  }

  predictNextMoves(currentLap, predictions) {
    const nextMoves = [];

    predictions.forEach((prediction, driverId) => {
      if (prediction.likelyPitLap &&
          Math.abs(prediction.likelyPitLap.lap - currentLap) <= 3) {
        nextMoves.push({
          driverId,
          action: 'pit-stop',
          estimatedLap: prediction.likelyPitLap.lap,
          probability: prediction.likelyPitLap.probability,
          impact: 'high'
        });
      }
    });

    return nextMoves;
  }

  generateCounterStrategies(threats, opportunities) {
    const strategies = [];

    if (threats.some(t => t.type === 'undercut-threat')) {
      strategies.push({
        name: 'Respond to undercut',
        action: 'Pit within 1-2 laps of competitor',
        priority: 'high'
      });
    }

    if (opportunities.some(o => o.type === 'strategy-opportunity')) {
      strategies.push({
        name: 'Execute undercut',
        action: 'Pit before competitor with old tires',
        priority: 'high'
      });
    }

    if (threats.some(t => t.type === 'pace-threat')) {
      strategies.push({
        name: 'Alternative strategy',
        action: 'Use different pit window to avoid direct competition',
        priority: 'medium'
      });
    }

    return strategies;
  }

  calculateAveragePace(lapTimes) {
    if (!lapTimes || lapTimes.length === 0) return 0;
    return lapTimes.reduce((sum, time) => sum + time, 0) / lapTimes.length;
  }

  calculateConsistency(lapTimes) {
    if (!lapTimes || lapTimes.length < 2) return 0;

    const avg = this.calculateAveragePace(lapTimes);
    const variance = lapTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / lapTimes.length;
    const stdDev = Math.sqrt(variance);

    return 1 - Math.min(stdDev / avg, 1); // Higher is more consistent
  }

  calculateRecentPace(times) {
    if (!times || times.length === 0) return 0;
    const recent = times.slice(-5);
    return this.calculateAveragePace(recent);
  }

  calculatePaceAdvantage(ourPace, competitorTimes) {
    const theirPace = this.calculateRecentPace(competitorTimes);
    return ourPace - theirPace; // Negative means we're faster
  }

  calculateConfidence(data) {
    let confidence = 0.5;

    if (data.competitorPositions) confidence += 0.15;
    if (data.competitorTireData) confidence += 0.15;
    if (data.competitorLapTimes) confidence += 0.15;
    if (data.historicalData) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(threats, opportunities, nextMoves) {
    if (threats.length > 0 && threats[0].severity === 'high') {
      return `WARNING: ${threats[0].description}. ${threats[0].type === 'undercut-threat' ? 'Prepare defensive pit stop.' : 'Monitor closely.'}`;
    }

    if (opportunities.length > 0 && opportunities[0].potential === 'high') {
      return `OPPORTUNITY: ${opportunities[0].description}. Consider ${opportunities[0].action || 'taking action'}.`;
    }

    if (nextMoves.length > 0) {
      return `INFO: Expecting ${nextMoves[0].driverId} to ${nextMoves[0].action} around lap ${nextMoves[0].estimatedLap}.`;
    }

    return 'INFO: No immediate threats or opportunities detected. Continue monitoring.';
  }
}

export default CompetitorAnalysisAgent;
