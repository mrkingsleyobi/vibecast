import React from 'react';
import './TelemetryPanel.css';

function TelemetryPanel({ raceData }) {
  if (!raceData) {
    return (
      <div className="telemetry-panel">
        <h2 className="panel-title">Telemetry</h2>
        <div className="no-data">No telemetry data available</div>
      </div>
    );
  }

  const getTempColor = (temp, min, max) => {
    if (temp < min) return '#4a9eff';
    if (temp > max) return '#ff0000';
    return '#00ff00';
  };

  return (
    <div className="telemetry-panel">
      <h2 className="panel-title">📊 Telemetry</h2>

      <div className="telemetry-grid">
        {/* Engine */}
        <div className="telemetry-section">
          <h3 className="telemetry-title">Engine</h3>
          <div className="telemetry-item">
            <span className="telemetry-label">Temperature</span>
            <span
              className="telemetry-value"
              style={{ color: getTempColor(raceData.engineTemp, 90, 115) }}
            >
              {raceData.engineTemp?.toFixed(1)}°C
            </span>
          </div>
        </div>

        {/* Brakes */}
        {raceData.brakeTemps && (
          <div className="telemetry-section">
            <h3 className="telemetry-title">Brakes</h3>
            {Object.entries(raceData.brakeTemps).map(([position, temp]) => (
              <div key={position} className="telemetry-item small">
                <span className="telemetry-label">{position}</span>
                <span
                  className="telemetry-value"
                  style={{ color: getTempColor(temp, 300, 750) }}
                >
                  {temp?.toFixed(0)}°C
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tires */}
        {raceData.tireTemps && (
          <div className="telemetry-section">
            <h3 className="telemetry-title">Tire Temps</h3>
            {Object.entries(raceData.tireTemps).map(([position, temp]) => (
              <div key={position} className="telemetry-item small">
                <span className="telemetry-label">{position}</span>
                <span
                  className="telemetry-value"
                  style={{ color: getTempColor(temp, 75, 105) }}
                >
                  {temp?.toFixed(0)}°C
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tire Pressure */}
        {raceData.tirePressures && (
          <div className="telemetry-section">
            <h3 className="telemetry-title">Tire Pressure</h3>
            {Object.entries(raceData.tirePressures).map(([position, pressure]) => (
              <div key={position} className="telemetry-item small">
                <span className="telemetry-label">{position}</span>
                <span className="telemetry-value">
                  {pressure?.toFixed(1)} PSI
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Energy */}
        <div className="telemetry-section">
          <h3 className="telemetry-title">Energy</h3>
          <div className="telemetry-item">
            <span className="telemetry-label">ERS Charge</span>
            <span className="telemetry-value">
              {((raceData.ersCharge / 4000000) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Fuel</span>
            <span className="telemetry-value">
              {raceData.fuelRemaining?.toFixed(1)}kg
            </span>
          </div>
        </div>

        {/* Performance */}
        <div className="telemetry-section">
          <h3 className="telemetry-title">Performance</h3>
          <div className="telemetry-item">
            <span className="telemetry-label">Speed</span>
            <span className="telemetry-value">{raceData.speed?.toFixed(0)} km/h</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Gear</span>
            <span className="telemetry-value">{raceData.gear}</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Throttle</span>
            <span className="telemetry-value">
              {((raceData.throttle || 0) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">DRS</span>
            <span className="telemetry-value">{raceData.drs ? 'Open' : 'Closed'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TelemetryPanel;
