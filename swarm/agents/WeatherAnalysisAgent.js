import { Agent } from '../core/Agent.js';

/**
 * Weather Analysis Agent
 * Monitors weather conditions and predicts impact on race strategy
 */
export class WeatherAnalysisAgent extends Agent {
  constructor(config) {
    super(config);
    this.weatherHistory = [];
    this.forecastData = null;
  }

  async setup() {
    console.log(`[WeatherAnalysisAgent] Initializing weather monitoring systems...`);
  }

  async analyze(data) {
    const {
      currentWeather,
      temperature,
      humidity,
      windSpeed,
      windDirection,
      pressure,
      trackTemp,
      currentLap,
      totalLaps
    } = data;

    // Store weather history
    this.weatherHistory.push({
      lap: currentLap,
      timestamp: new Date(),
      ...data
    });

    // Analyze current conditions
    const currentConditions = this.analyzeCurrentConditions(data);

    // Predict weather changes
    const forecast = this.predictWeatherChanges(currentLap, totalLaps);

    // Calculate track condition impact
    const trackImpact = this.calculateTrackImpact(currentConditions, trackTemp);

    // Determine strategic recommendations
    const strategyImpact = this.determineStrategyImpact(forecast, trackImpact);

    const confidence = this.calculateConfidence(data);

    const analysis = {
      currentConditions,
      forecast,
      trackImpact,
      strategyImpact,
      rainProbability: forecast.rainProbability,
      estimatedRainLap: forecast.estimatedRainLap,
      trackEvolution: this.analyzeTrackEvolution(),
      recommendation: this.generateRecommendation(forecast, strategyImpact)
    };

    return this.makeDecision(analysis, confidence);
  }

  analyzeCurrentConditions(data) {
    const { currentWeather, temperature, humidity, windSpeed, trackTemp } = data;

    let condition = 'dry';
    let severity = 'low';

    if (currentWeather?.includes('rain') || humidity > 85) {
      condition = 'wet';
      severity = humidity > 95 ? 'high' : 'medium';
    } else if (humidity > 70) {
      condition = 'damp';
      severity = 'low';
    }

    return {
      condition,
      severity,
      temperature,
      humidity,
      windSpeed,
      trackTemp,
      gripLevel: this.calculateGripLevel(condition, trackTemp, temperature)
    };
  }

  calculateGripLevel(condition, trackTemp, airTemp) {
    let baseGrip = 1.0;

    if (condition === 'wet') {
      baseGrip = 0.5;
    } else if (condition === 'damp') {
      baseGrip = 0.7;
    }

    // Optimal track temp around 35-45°C
    const tempOptimal = trackTemp >= 35 && trackTemp <= 45;
    const tempFactor = tempOptimal ? 1.0 : 0.9;

    return baseGrip * tempFactor;
  }

  predictWeatherChanges(currentLap, totalLaps) {
    const remainingLaps = totalLaps - currentLap;

    // Analyze weather trend from history
    const trend = this.analyzeWeatherTrend();

    // Simple probabilistic model
    let rainProbability = 0;
    let estimatedRainLap = null;

    if (trend.humidityIncreasing && trend.pressureDropping) {
      rainProbability = 0.7;
      estimatedRainLap = currentLap + Math.floor(remainingLaps * 0.3);
    } else if (trend.humidityIncreasing) {
      rainProbability = 0.4;
      estimatedRainLap = currentLap + Math.floor(remainingLaps * 0.5);
    } else if (trend.pressureDropping) {
      rainProbability = 0.3;
      estimatedRainLap = currentLap + Math.floor(remainingLaps * 0.6);
    }

    return {
      rainProbability,
      estimatedRainLap,
      trend,
      confidence: this.weatherHistory.length > 5 ? 0.8 : 0.5,
      timeToChange: estimatedRainLap ? (estimatedRainLap - currentLap) * 90 : null // seconds
    };
  }

  analyzeWeatherTrend() {
    if (this.weatherHistory.length < 3) {
      return {
        humidityIncreasing: false,
        pressureDropping: false,
        tempDropping: false
      };
    }

    const recent = this.weatherHistory.slice(-5);
    const humidityTrend = recent[recent.length - 1].humidity - recent[0].humidity;
    const pressureTrend = recent[0].pressure - recent[recent.length - 1].pressure;
    const tempTrend = recent[0].temperature - recent[recent.length - 1].temperature;

    return {
      humidityIncreasing: humidityTrend > 5,
      pressureDropping: pressureTrend > 2,
      tempDropping: tempTrend > 2
    };
  }

  calculateTrackImpact(conditions, trackTemp) {
    return {
      tireDegradation: conditions.condition === 'dry' ? 1.0 : 0.7,
      lapTimeImpact: conditions.condition === 'wet' ? 8.0 : (conditions.condition === 'damp' ? 2.0 : 0),
      overtakingDifficulty: conditions.gripLevel < 0.7 ? 'high' : 'normal',
      safetyCarRisk: conditions.condition === 'wet' ? 0.4 : 0.1
    };
  }

  determineStrategyImpact(forecast, trackImpact) {
    const impacts = [];

    if (forecast.rainProbability > 0.6) {
      impacts.push({
        type: 'tire-change-required',
        urgency: 'high',
        recommendation: 'Prepare for wet tire change',
        estimatedLap: forecast.estimatedRainLap
      });
    }

    if (trackImpact.safetyCarRisk > 0.3) {
      impacts.push({
        type: 'safety-car-probable',
        urgency: 'medium',
        recommendation: 'Consider opportunistic pit stop under safety car'
      });
    }

    if (trackImpact.lapTimeImpact > 5) {
      impacts.push({
        type: 'significant-pace-loss',
        urgency: 'high',
        recommendation: 'Adjust race pace and fuel strategy'
      });
    }

    return impacts;
  }

  analyzeTrackEvolution() {
    if (this.weatherHistory.length < 5) {
      return { trend: 'stable', gripChange: 0 };
    }

    const recent = this.weatherHistory.slice(-5);
    const avgGrip = recent.reduce((sum, w) => sum + (w.gripLevel || 1), 0) / recent.length;
    const currentGrip = recent[recent.length - 1].gripLevel || 1;

    return {
      trend: currentGrip > avgGrip ? 'improving' : 'degrading',
      gripChange: ((currentGrip - avgGrip) / avgGrip) * 100
    };
  }

  calculateConfidence(data) {
    let confidence = 0.6;

    if (data.currentWeather) confidence += 0.1;
    if (data.humidity && data.pressure) confidence += 0.1;
    if (this.weatherHistory.length > 5) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(forecast, strategyImpact) {
    if (forecast.rainProbability > 0.7) {
      return `CRITICAL: High rain probability (${(forecast.rainProbability * 100).toFixed(0)}%). Expected around lap ${forecast.estimatedRainLap}. Prepare intermediate tires.`;
    } else if (forecast.rainProbability > 0.4) {
      return `WARNING: Moderate rain probability (${(forecast.rainProbability * 100).toFixed(0)}%). Monitor weather closely.`;
    } else if (strategyImpact.length > 0) {
      return `INFO: ${strategyImpact[0].recommendation}`;
    } else {
      return 'INFO: Weather conditions stable. No immediate strategy changes required.';
    }
  }
}

export default WeatherAnalysisAgent;
