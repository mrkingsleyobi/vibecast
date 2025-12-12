import React from 'react';
import './AgentDecisions.css';

function AgentDecisions({ decisions }) {
  if (!decisions || decisions.length === 0) {
    return (
      <div className="agent-decisions">
        <h2 className="panel-title">Agent Decisions</h2>
        <div className="no-data">No agent decisions yet</div>
      </div>
    );
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="agent-decisions">
      <h2 className="panel-title">💡 Agent Decisions</h2>

      <div className="decisions-list">
        {[...decisions].reverse().map((decision, index) => (
          <div key={index} className="decision-card">
            <div className="decision-header">
              <div className="decision-agent">{decision.agentId}</div>
              <div className="decision-time">{formatTime(decision.decision.timestamp)}</div>
            </div>
            <div className="decision-body">
              <div className="decision-analysis">
                {decision.decision.analysis?.recommendation ||
                 JSON.stringify(decision.decision.analysis, null, 2).substring(0, 200)}
              </div>
              <div className="decision-meta">
                <span className="confidence-badge">
                  Confidence: {(decision.decision.confidence * 100).toFixed(0)}%
                </span>
                <span className="priority-badge">
                  Priority: {decision.decision.priority}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentDecisions;
