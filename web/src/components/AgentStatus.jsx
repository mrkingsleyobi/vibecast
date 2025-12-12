import React from 'react';
import './AgentStatus.css';

function AgentStatus({ swarmStatus }) {
  if (!swarmStatus || !swarmStatus.agents) {
    return (
      <div className="agent-status">
        <h2 className="panel-title">Agent Status</h2>
        <div className="no-data">No agent status available</div>
      </div>
    );
  }

  const agents = Object.entries(swarmStatus.agents);

  const getStateColor = (state) => {
    switch (state) {
      case 'ready': return '#00ff00';
      case 'processing': return '#ff6b00';
      case 'initializing': return '#667eea';
      case 'error': return '#ff0000';
      default: return '#888888';
    }
  };

  return (
    <div className="agent-status">
      <h2 className="panel-title">🤖 Agent Status</h2>

      <div className="orchestrator-stats">
        <div className="stat-item">
          <span className="stat-label">State</span>
          <span className="stat-value">{swarmStatus.orchestrator.state}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Active Agents</span>
          <span className="stat-value highlight">{swarmStatus.orchestrator.activeAgents}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Decisions</span>
          <span className="stat-value">{swarmStatus.orchestrator.decisionsProcessed}</span>
        </div>
      </div>

      <div className="agents-list">
        {agents.map(([agentId, agent]) => (
          <div key={agentId} className="agent-card">
            <div className="agent-header">
              <div className="agent-name">{agent.type}</div>
              <div
                className="agent-state"
                style={{ color: getStateColor(agent.state) }}
              >
                ● {agent.state}
              </div>
            </div>
            <div className="agent-details">
              <div className="agent-detail">
                <span>Priority:</span>
                <span className="priority-badge">P{agent.priority}</span>
              </div>
              <div className="agent-detail">
                <span>Confidence:</span>
                <span>{(agent.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="agent-detail">
                <span>Decisions:</span>
                <span>{agent.decisionsCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentStatus;
