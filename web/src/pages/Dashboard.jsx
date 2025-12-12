import React from 'react';
import Header from '../components/Header';
import RaceInfo from '../components/RaceInfo';
import StrategyPanel from '../components/StrategyPanel';
import AgentStatus from '../components/AgentStatus';
import TelemetryPanel from '../components/TelemetryPanel';
import AgentDecisions from '../components/AgentDecisions';
import './Dashboard.css';

function Dashboard({
  connected,
  initialized,
  strategy,
  raceData,
  agentDecisions,
  simulationStatus,
  swarmStatus,
  onInitialize,
  onStartSimulation,
  onStopSimulation
}) {
  return (
    <div className="dashboard">
      <Header
        connected={connected}
        initialized={initialized}
        simulationStatus={simulationStatus}
        onInitialize={onInitialize}
        onStartSimulation={onStartSimulation}
        onStopSimulation={onStopSimulation}
      />

      <div className="dashboard-grid">
        <div className="grid-section race-section">
          <RaceInfo
            raceData={raceData}
            simulationStatus={simulationStatus}
          />
        </div>

        <div className="grid-section strategy-section">
          <StrategyPanel strategy={strategy} />
        </div>

        <div className="grid-section agents-section">
          <AgentStatus swarmStatus={swarmStatus} />
        </div>

        <div className="grid-section telemetry-section">
          <TelemetryPanel raceData={raceData} />
        </div>

        <div className="grid-section decisions-section">
          <AgentDecisions decisions={agentDecisions} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
