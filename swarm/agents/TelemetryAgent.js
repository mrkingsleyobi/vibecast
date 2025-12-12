import { Agent } from '../core/Agent.js';

/**
 * Telemetry Agent
 * Processes real-time car telemetry data for performance optimization
 */
export class TelemetryAgent extends Agent {
  constructor(config) {
    super(config);
    this.telemetryBuffer = [];
    this.anomalyThresholds = {
      engineTemp: { min: 90, max: 120 },
      brakeTemp: { min: 200, max: 800 },
      tireTemp: { min: 70, max: 110 },
      fuel: { min: 0, max: 110 },
      ers: { min: 0, max: 4000000 }
    };
  }

  async setup() {
    console.log(`[TelemetryAgent] Initializing real-time telemetry processing...`);
  }

  async analyze(data) {
    const {
      engineTemp,
      brakeTemps,
      tireTemps,
      tirePressures,
      fuelRemaining,
      ersCharge,
      speed,
      gear,
      throttle,
      brake,
      drs,
      lapTime,
      sector
    } = data;

    // Store telemetry
    this.storeTelemetry(data);

    // Detect anomalies
    const anomalies = this.detectAnomalies(data);

    // Analyze performance metrics
    const performanceMetrics = this.analyzePerformance(data);

    // Check component health
    const componentHealth = this.assessComponentHealth(data);

    // Optimization recommendations
    const optimizations = this.generateOptimizations(performanceMetrics, componentHealth);

    // Predict failures
    const failureRisks = this.predictFailures(anomalies, componentHealth);

    const confidence = this.calculateConfidence(data);

    const analysis = {
      telemetryStatus: 'active',
      anomaliesDetected: anomalies.length,
      anomalies,
      performanceMetrics,
      componentHealth,
      optimizations,
      failureRisks,
      energyManagement: this.analyzeEnergyManagement(ersCharge, fuelRemaining),
      recommendation: this.generateRecommendation(anomalies, failureRisks, optimizations)
    };

    return this.makeDecision(analysis, confidence);
  }

  storeTelemetry(data) {
    this.telemetryBuffer.push({
      timestamp: new Date(),
      ...data
    });

    // Keep only last 100 readings
    if (this.telemetryBuffer.length > 100) {
      this.telemetryBuffer.shift();
    }
  }

  detectAnomalies(data) {
    const anomalies = [];

    // Engine temperature
    if (data.engineTemp) {
      if (data.engineTemp < this.anomalyThresholds.engineTemp.min) {
        anomalies.push({
          component: 'engine',
          type: 'temperature-low',
          severity: 'low',
          value: data.engineTemp,
          message: 'Engine temperature below optimal range'
        });
      } else if (data.engineTemp > this.anomalyThresholds.engineTemp.max) {
        anomalies.push({
          component: 'engine',
          type: 'temperature-high',
          severity: 'critical',
          value: data.engineTemp,
          message: 'Engine overheating - reduce power immediately'
        });
      }
    }

    // Brake temperatures
    if (data.brakeTemps) {
      Object.entries(data.brakeTemps).forEach(([position, temp]) => {
        if (temp > this.anomalyThresholds.brakeTemp.max) {
          anomalies.push({
            component: 'brakes',
            type: 'temperature-high',
            severity: 'high',
            value: temp,
            position,
            message: `${position} brake overheating - risk of failure`
          });
        }
      });
    }

    // Tire temperatures
    if (data.tireTemps) {
      Object.entries(data.tireTemps).forEach(([position, temp]) => {
        if (temp < this.anomalyThresholds.tireTemp.min || temp > this.anomalyThresholds.tireTemp.max) {
          anomalies.push({
            component: 'tires',
            type: temp < 70 ? 'temperature-low' : 'temperature-high',
            severity: 'medium',
            value: temp,
            position,
            message: `${position} tire temperature out of optimal window`
          });
        }
      });
    }

    // Tire pressure imbalance
    if (data.tirePressures) {
      const pressures = Object.values(data.tirePressures);
      const avgPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
      const maxDeviation = Math.max(...pressures.map(p => Math.abs(p - avgPressure)));

      if (maxDeviation > 0.3) {
        anomalies.push({
          component: 'tires',
          type: 'pressure-imbalance',
          severity: 'medium',
          value: maxDeviation,
          message: 'Significant tire pressure imbalance detected'
        });
      }
    }

    return anomalies;
  }

  analyzePerformance(data) {
    const metrics = {
      speed: data.speed || 0,
      gear: data.gear || 0,
      throttleApplication: data.throttle || 0,
      brakeApplication: data.brake || 0,
      drsAvailable: data.drs || false,
      sector: data.sector || 1
    };

    // Calculate efficiency scores
    metrics.powerEfficiency = this.calculatePowerEfficiency(data);
    metrics.brakeEfficiency = this.calculateBrakeEfficiency(data);
    metrics.corneringEfficiency = this.calculateCorneringEfficiency(data);

    // Overall performance score
    metrics.overallScore = (
      metrics.powerEfficiency * 0.4 +
      metrics.brakeEfficiency * 0.3 +
      metrics.corneringEfficiency * 0.3
    );

    return metrics;
  }

  calculatePowerEfficiency(data) {
    // Simplified power efficiency calculation
    if (!data.throttle || !data.speed) return 0.8;

    const expectedSpeed = data.throttle * 350; // Max speed ~350 km/h
    const efficiency = Math.min(data.speed / expectedSpeed, 1.0);

    return efficiency;
  }

  calculateBrakeEfficiency(data) {
    // Simplified brake efficiency
    if (!data.brake || !data.brakeTemps) return 0.8;

    const avgBrakeTemp = Object.values(data.brakeTemps).reduce((a, b) => a + b, 0) / 4;
    const optimalTemp = 500;
    const efficiency = 1 - Math.abs(avgBrakeTemp - optimalTemp) / optimalTemp;

    return Math.max(0.5, efficiency);
  }

  calculateCorneringEfficiency(data) {
    // Simplified cornering efficiency based on tire temps
    if (!data.tireTemps) return 0.8;

    const avgTireTemp = Object.values(data.tireTemps).reduce((a, b) => a + b, 0) / 4;
    const optimalTemp = 90;
    const efficiency = 1 - Math.abs(avgTireTemp - optimalTemp) / optimalTemp;

    return Math.max(0.5, efficiency);
  }

  assessComponentHealth(data) {
    return {
      engine: this.assessEngineHealth(data.engineTemp),
      brakes: this.assessBrakeHealth(data.brakeTemps),
      tires: this.assessTireHealth(data.tireTemps, data.tirePressures),
      battery: this.assessBatteryHealth(data.ersCharge),
      overall: 'good' // Simplified
    };
  }

  assessEngineHealth(engineTemp) {
    if (!engineTemp) return { status: 'unknown', health: 0.8 };

    if (engineTemp > 115) {
      return { status: 'critical', health: 0.4, message: 'Engine overheating' };
    } else if (engineTemp > 110) {
      return { status: 'warning', health: 0.7, message: 'Engine temperature high' };
    } else if (engineTemp >= 90 && engineTemp <= 105) {
      return { status: 'optimal', health: 1.0, message: 'Engine operating optimally' };
    } else {
      return { status: 'suboptimal', health: 0.8, message: 'Engine temperature suboptimal' };
    }
  }

  assessBrakeHealth(brakeTemps) {
    if (!brakeTemps) return { status: 'unknown', health: 0.8 };

    const temps = Object.values(brakeTemps);
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);

    if (maxTemp > 750) {
      return { status: 'critical', health: 0.3, message: 'Brake failure risk' };
    } else if (maxTemp > 700) {
      return { status: 'warning', health: 0.6, message: 'Brakes very hot' };
    } else if (minTemp < 250) {
      return { status: 'suboptimal', health: 0.7, message: 'Brakes not up to temperature' };
    } else {
      return { status: 'good', health: 0.9, message: 'Brakes operating well' };
    }
  }

  assessTireHealth(tireTemps, tirePressures) {
    if (!tireTemps) return { status: 'unknown', health: 0.8 };

    const temps = Object.values(tireTemps);
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

    if (avgTemp >= 85 && avgTemp <= 95) {
      return { status: 'optimal', health: 1.0, message: 'Tires in optimal window' };
    } else if (avgTemp < 75 || avgTemp > 105) {
      return { status: 'warning', health: 0.6, message: 'Tires out of optimal range' };
    } else {
      return { status: 'good', health: 0.8, message: 'Tire temperatures acceptable' };
    }
  }

  assessBatteryHealth(ersCharge) {
    if (!ersCharge) return { status: 'unknown', health: 0.8 };

    const chargePercent = (ersCharge / 4000000) * 100;

    if (chargePercent > 80) {
      return { status: 'optimal', health: 1.0, message: 'ERS fully charged' };
    } else if (chargePercent > 30) {
      return { status: 'good', health: 0.8, message: 'ERS charge good' };
    } else {
      return { status: 'low', health: 0.5, message: 'ERS charge low - harvest mode' };
    }
  }

  generateOptimizations(metrics, health) {
    const optimizations = [];

    if (metrics.powerEfficiency < 0.7) {
      optimizations.push({
        category: 'power-delivery',
        priority: 'high',
        recommendation: 'Optimize throttle application for better power delivery',
        expectedGain: '0.1-0.2s per lap'
      });
    }

    if (metrics.brakeEfficiency < 0.7) {
      optimizations.push({
        category: 'braking',
        priority: 'medium',
        recommendation: 'Adjust brake balance and cooling',
        expectedGain: '0.05-0.15s per lap'
      });
    }

    if (health.battery.health < 0.6) {
      optimizations.push({
        category: 'energy-management',
        priority: 'high',
        recommendation: 'Increase harvesting in braking zones',
        expectedGain: 'Better ERS deployment on straights'
      });
    }

    return optimizations;
  }

  predictFailures(anomalies, health) {
    const risks = [];

    anomalies.forEach(anomaly => {
      if (anomaly.severity === 'critical') {
        risks.push({
          component: anomaly.component,
          risk: 'imminent-failure',
          probability: 0.7,
          recommendation: 'Immediate action required',
          impact: 'race-ending'
        });
      } else if (anomaly.severity === 'high') {
        risks.push({
          component: anomaly.component,
          risk: 'potential-failure',
          probability: 0.4,
          recommendation: 'Monitor closely',
          impact: 'performance-degradation'
        });
      }
    });

    return risks;
  }

  analyzeEnergyManagement(ersCharge, fuelRemaining) {
    const ersPercent = ersCharge ? (ersCharge / 4000000) * 100 : 50;
    const fuelPercent = fuelRemaining ? (fuelRemaining / 110) * 100 : 50;

    return {
      ersCharge: ersPercent.toFixed(1) + '%',
      fuelRemaining: fuelPercent.toFixed(1) + '%',
      deploymentStrategy: ersPercent > 70 ? 'aggressive' : (ersPercent > 30 ? 'balanced' : 'conservative'),
      fuelSavingRequired: fuelPercent < 20,
      recommendation: this.getEnergyRecommendation(ersPercent, fuelPercent)
    };
  }

  getEnergyRecommendation(ersPercent, fuelPercent) {
    if (fuelPercent < 15) {
      return 'CRITICAL: Fuel saving mode required. Lift and coast.';
    } else if (ersPercent > 80 && fuelPercent > 30) {
      return 'OPTIMAL: Full ERS deployment available. Push mode enabled.';
    } else if (ersPercent < 20) {
      return 'LOW ERS: Focus on harvesting. Reduce deployment.';
    } else {
      return 'BALANCED: Normal ERS deployment. Monitor fuel consumption.';
    }
  }

  calculateConfidence(data) {
    let confidence = 0.6;

    const dataPoints = [
      data.engineTemp,
      data.brakeTemps,
      data.tireTemps,
      data.tirePressures,
      data.fuelRemaining,
      data.ersCharge
    ].filter(Boolean).length;

    confidence += (dataPoints / 6) * 0.4;

    return Math.min(confidence, 1.0);
  }

  generateRecommendation(anomalies, failureRisks, optimizations) {
    if (failureRisks.some(r => r.risk === 'imminent-failure')) {
      const critical = failureRisks.find(r => r.risk === 'imminent-failure');
      return `CRITICAL: ${critical.component} failure imminent! ${critical.recommendation}`;
    }

    if (anomalies.some(a => a.severity === 'critical')) {
      return `CRITICAL: ${anomalies.find(a => a.severity === 'critical').message}`;
    }

    if (anomalies.some(a => a.severity === 'high')) {
      return `WARNING: ${anomalies.find(a => a.severity === 'high').message}`;
    }

    if (optimizations.some(o => o.priority === 'high')) {
      return `OPTIMIZATION: ${optimizations.find(o => o.priority === 'high').recommendation}`;
    }

    return 'INFO: All systems operating normally. Continue monitoring.';
  }
}

export default TelemetryAgent;
