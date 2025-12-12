import React from 'react';
import './Header.css';

function Header({
  connected,
  initialized,
  simulationStatus,
  onInitialize,
  onStartSimulation,
  onStopSimulation
}) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="title">
            <span className="icon">🏎️</span>
            F1 Strategy Optimizer Swarm
          </h1>
          <div className="status-indicators">
            <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
            {simulationStatus.running && (
              <span className="status-badge running">
                🏁 Lap {simulationStatus.currentLap}/{simulationStatus.totalLaps}
              </span>
            )}
          </div>
        </div>

        <div className="header-controls">
          {!initialized && (
            <button
              className="btn btn-primary"
              onClick={onInitialize}
              disabled={!connected}
            >
              Initialize Swarm
            </button>
          )}

          {initialized && !simulationStatus.running && (
            <button
              className="btn btn-success"
              onClick={onStartSimulation}
            >
              Start Simulation
            </button>
          )}

          {simulationStatus.running && (
            <button
              className="btn btn-danger"
              onClick={onStopSimulation}
            >
              Stop Simulation
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
