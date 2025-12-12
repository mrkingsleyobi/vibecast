import React, { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Dashboard from './pages/Dashboard';
import './App.css';

function App() {
  const {
    connected,
    strategy,
    raceData,
    agentDecisions,
    simulationStatus,
    swarmStatus,
    sendMessage
  } = useWebSocket();

  const [initialized, setInitialized] = useState(false);

  const handleInitialize = () => {
    sendMessage({ type: 'initialize' });
    setInitialized(true);
  };

  const handleStartSimulation = () => {
    sendMessage({ type: 'start-simulation' });
  };

  const handleStopSimulation = () => {
    sendMessage({ type: 'stop-simulation' });
  };

  return (
    <div className="app">
      <Dashboard
        connected={connected}
        initialized={initialized}
        strategy={strategy}
        raceData={raceData}
        agentDecisions={agentDecisions}
        simulationStatus={simulationStatus}
        swarmStatus={swarmStatus}
        onInitialize={handleInitialize}
        onStartSimulation={handleStartSimulation}
        onStopSimulation={handleStopSimulation}
      />
    </div>
  );
}

export default App;
