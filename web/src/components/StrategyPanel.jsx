import React from 'react';
import './StrategyPanel.css';

function StrategyPanel({ strategy }) {
  if (!strategy) {
    return (
      <div className="strategy-panel">
        <h2 className="panel-title">Strategy Consensus</h2>
        <div className="no-data">Waiting for strategy recommendations...</div>
      </div>
    );
  }

  const { consensus, primaryRecommendation, summary, strategicActions } = strategy;

  return (
    <div className="strategy-panel">
      <h2 className="panel-title">🎯 Strategy Consensus</h2>

      <div className="consensus-header">
        <div className="consensus-badge">
          <span className="consensus-label">Consensus Achieved</span>
          <span className="consensus-value">{consensus.achieved ? 'Yes ✓' : 'No'}</span>
        </div>
        <div className="consensus-badge">
          <span className="consensus-label">Confidence</span>
          <span className="consensus-value confidence">
            {(consensus.confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="consensus-badge">
          <span className="consensus-label">Agents</span>
          <span className="consensus-value">{consensus.participatingAgents}</span>
        </div>
      </div>

      {primaryRecommendation && (
        <div className="primary-recommendation">
          <h3 className="section-title">Primary Recommendation</h3>
          <div className="recommendation-content">
            <div className="recommendation-agent">{primaryRecommendation.agent}</div>
            <div className="recommendation-text">{primaryRecommendation.recommendation}</div>
            <div className="recommendation-confidence">
              Confidence: {(primaryRecommendation.confidence * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {strategicActions && strategicActions.length > 0 && (
        <div className="strategic-actions">
          <h3 className="section-title">Strategic Actions</h3>
          {strategicActions.map((action, i) => (
            <div key={i} className="action-item">
              <span className="action-type">{action.type}</span>
              <span className="action-detail">
                {action.lap && `Lap ${action.lap}`}
                {action.compound && ` → ${action.compound}`}
                {action.window && ` Window: ${action.window}`}
                {action.action}
              </span>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="strategy-summary">
          <h3 className="section-title">Summary</h3>
          <div className="summary-grid">
            {summary.tireStrategy && (
              <div className="summary-item">
                <div className="summary-title">🏎️ Tire Strategy</div>
                <div className="summary-content">
                  <div>Compound: {summary.tireStrategy.recommendedCompound}</div>
                  <div>Pit Lap: {summary.tireStrategy.recommendedPitLap || 'TBD'}</div>
                  <div>Degradation: {summary.tireStrategy.degradation}</div>
                </div>
              </div>
            )}

            {summary.weatherOutlook && (
              <div className="summary-item">
                <div className="summary-title">☁️ Weather</div>
                <div className="summary-content">
                  <div>Rain: {summary.weatherOutlook.rainProbability}</div>
                  <div>Expected: Lap {summary.weatherOutlook.estimatedRainLap}</div>
                  <div>Track: {summary.weatherOutlook.trackCondition}</div>
                </div>
              </div>
            )}

            {summary.riskAssessment && (
              <div className="summary-item">
                <div className="summary-title">📈 Simulation</div>
                <div className="summary-content">
                  <div>Exp. Position: P{summary.riskAssessment.expectedPosition}</div>
                  <div>Win: {summary.riskAssessment.winProbability}</div>
                  <div>Podium: {summary.riskAssessment.podiumProbability}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StrategyPanel;
