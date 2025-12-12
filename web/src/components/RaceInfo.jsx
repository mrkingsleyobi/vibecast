import React from 'react';
import './RaceInfo.css';

function RaceInfo({ raceData, simulationStatus }) {
  if (!raceData) {
    return (
      <div className="race-info">
        <h2 className="panel-title">Race Information</h2>
        <div className="no-data">No race data available</div>
      </div>
    );
  }

  return (
    <div className="race-info">
      <h2 className="panel-title">🏁 Race Information</h2>

      <div className="info-grid">
        <div className="info-item">
          <span className="info-label">Track</span>
          <span className="info-value">{raceData.track}</span>
        </div>

        <div className="info-item">
          <span className="info-label">Lap</span>
          <span className="info-value highlight">
            {raceData.currentLap} / {raceData.totalLaps}
          </span>
        </div>

        <div className="info-item">
          <span className="info-label">Position</span>
          <span className="info-value position">P{raceData.position}</span>
        </div>

        <div className="info-item">
          <span className="info-label">Gap Ahead</span>
          <span className="info-value">{raceData.gapToCarAhead?.toFixed(2)}s</span>
        </div>

        <div className="info-item">
          <span className="info-label">Gap Behind</span>
          <span className="info-value">{raceData.gapToCarBehind?.toFixed(2)}s</span>
        </div>

        <div className="info-item">
          <span className="info-label">Tire</span>
          <span className="info-value">{raceData.currentCompound} ({raceData.tireAge} laps)</span>
        </div>

        <div className="info-item">
          <span className="info-label">Fuel</span>
          <span className="info-value">{raceData.fuelRemaining?.toFixed(1)}kg</span>
        </div>

        <div className="info-item">
          <span className="info-label">Lap Time</span>
          <span className="info-value">{raceData.lapTime?.toFixed(3)}s</span>
        </div>
      </div>
    </div>
  );
}

export default RaceInfo;
