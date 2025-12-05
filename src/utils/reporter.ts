/**
 * Simulation Reporter
 * Generates comprehensive reports from simulation results
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SimulationState } from '../models/simulation-state';
import { Agent } from '../models/agent-types';

export class SimulationReporter {
  private reportsDir: string;

  constructor(reportsDir: string = './reports') {
    this.reportsDir = reportsDir;
  }

  /**
   * Generate comprehensive simulation report
   */
  public async generateFullReport(state: SimulationState): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportId = `simulation-${timestamp}`;

    console.log(`Generating reports in ${this.reportsDir}...`);

    // Ensure reports directory exists
    await fs.mkdir(this.reportsDir, { recursive: true });

    // Generate multiple report formats
    await Promise.all([
      this.generateExecutiveSummary(state, reportId),
      this.generateAgentPerformanceReport(state, reportId),
      this.generateNetworkAnalysisReport(state, reportId),
      this.generateEventLog(state, reportId),
      this.generateMetricsReport(state, reportId),
      this.generateJSONDump(state, reportId)
    ]);

    console.log(`Reports generated successfully in ${this.reportsDir}`);
  }

  /**
   * Generate executive summary report
   */
  private async generateExecutiveSummary(
    state: SimulationState,
    reportId: string
  ): Promise<void> {
    const duration = state.currentTime.getTime() - state.startTime.getTime();
    const durationMinutes = (duration / 1000 / 60).toFixed(2);

    const summary = `
# DXP Agency Simulation - Executive Summary
Generated: ${new Date().toISOString()}
Report ID: ${reportId}

## Simulation Overview
- **Duration**: ${durationMinutes} minutes (${state.iteration} iterations)
- **Agents**: ${state.network.agents.length} federated agents
- **Start Time**: ${state.startTime.toISOString()}
- **End Time**: ${state.currentTime.toISOString()}

## Key Performance Indicators

### Business Metrics
- **Revenue**: $${state.metrics.business.revenue.toLocaleString()}
- **Growth Rate**: ${state.metrics.business.growth.toFixed(2)}%
- **Profit Margin**: ${state.metrics.business.profitMargin.toFixed(2)}%
- **Client Satisfaction**: ${state.metrics.business.clientSatisfaction.toFixed(1)}/100
- **Market Share**: ${state.metrics.business.marketShare.toFixed(2)}%
- **Innovation Index**: ${state.metrics.business.innovation.toFixed(1)}/100

### Agent Performance
- **Total Decisions Made**: ${state.metrics.agent.totalDecisions}
- **Decision Quality**: ${state.metrics.agent.decisionQuality.toFixed(2)}%
- **Collaboration Level**: ${state.metrics.agent.collaborationLevel.toFixed(1)}
- **Learning Rate**: ${state.metrics.agent.learningRate.toFixed(2)}
- **Adaptability**: ${state.metrics.agent.adaptability.toFixed(2)}%

### Network Health
- **Connectivity**: ${state.metrics.network.connectivity.toFixed(2)}%
- **Trust Level**: ${state.metrics.network.trust.toFixed(2)}%
- **Knowledge Flow**: ${state.metrics.network.knowledgeFlow.toFixed(2)}
- **Consensus Efficiency**: ${state.metrics.network.consensusEfficiency.toFixed(2)}%
- **Resilience**: ${state.metrics.network.resilience.toFixed(2)}%

### Operational Metrics
- **Throughput**: ${state.metrics.performance.throughput.toFixed(0)} ops/sec
- **Average Latency**: ${state.metrics.performance.latency.toFixed(0)}ms
- **Error Rate**: ${state.metrics.performance.errorRate.toFixed(2)}%
- **Utilization Rate**: ${state.metrics.performance.utilizationRate.toFixed(2)}%
- **Efficiency**: ${state.metrics.performance.efficiency.toFixed(2)}%

## Agency State
- **Active Clients**: ${state.agency.clients.length}
- **Active Projects**: ${state.agency.projects.length}
- **Running Workflows**: ${state.agency.activeWorkflows.length}
- **Cash Flow**: $${state.agency.financials.cashFlow.toLocaleString()}
- **Runway**: ${state.agency.financials.runway} months

## Market Environment
- **Market Demand**: ${state.environment.marketConditions.demand.toFixed(1)}/100
- **Market Supply**: ${state.environment.marketConditions.supply.toFixed(1)}/100
- **Growth Rate**: ${state.environment.marketConditions.growth.toFixed(2)}%
- **Volatility**: ${state.environment.marketConditions.volatility.toFixed(1)}/100
- **GDP Growth**: ${state.environment.economicFactors.gdpGrowth.toFixed(2)}%
- **Digital Spending**: $${state.environment.economicFactors.digitalSpending.toFixed(0)}B

## Network Statistics
- **Total Agents**: ${state.network.networkMetrics.totalAgents}
- **Active Agents**: ${state.network.networkMetrics.activeAgents}
- **Average Connectivity**: ${state.network.networkMetrics.averageConnectivity.toFixed(2)}%
- **Average Trust**: ${state.network.networkMetrics.averageTrust.toFixed(2)}%
- **Knowledge Growth**: ${state.network.networkMetrics.knowledgeGrowth.toFixed(2)}
- **Collaboration Index**: ${state.network.networkMetrics.collaborationIndex.toFixed(2)}%
- **Innovation Rate**: ${state.network.networkMetrics.innovationRate.toFixed(2)}

## Event Summary
- **Total Events**: ${state.events.length}
- **Event Types**: ${this.countEventTypes(state)}

## Insights & Recommendations
${this.generateInsights(state)}

---
Report generated by DXP Agency Simulation System
`;

    const filename = path.join(this.reportsDir, `${reportId}-executive-summary.md`);
    await fs.writeFile(filename, summary, 'utf-8');
    console.log(`✓ Executive summary saved: ${filename}`);
  }

  /**
   * Generate agent performance report
   */
  private async generateAgentPerformanceReport(
    state: SimulationState,
    reportId: string
  ): Promise<void> {
    const agents = state.network.agents;

    let report = `# Agent Performance Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `## Agent Overview\n\n`;
    report += `Total Agents: ${agents.length}\n\n`;

    // Group agents by role
    const byRole: Record<string, Agent[]> = {};
    agents.forEach(agent => {
      if (!byRole[agent.role]) byRole[agent.role] = [];
      byRole[agent.role].push(agent);
    });

    report += `## Performance by Role\n\n`;

    Object.entries(byRole).forEach(([role, roleAgents]) => {
      report += `### ${role} (${roleAgents.length} agents)\n\n`;

      const avgMetrics = {
        tasksCompleted: roleAgents.reduce((s, a) => s + a.performanceMetrics.tasksCompleted, 0) / roleAgents.length,
        successRate: roleAgents.reduce((s, a) => s + a.performanceMetrics.successRate, 0) / roleAgents.length,
        qualityScore: roleAgents.reduce((s, a) => s + a.performanceMetrics.qualityScore, 0) / roleAgents.length,
        collaborationScore: roleAgents.reduce((s, a) => s + a.performanceMetrics.collaborationScore, 0) / roleAgents.length,
        innovationIndex: roleAgents.reduce((s, a) => s + a.performanceMetrics.innovationIndex, 0) / roleAgents.length
      };

      report += `- Average Tasks Completed: ${avgMetrics.tasksCompleted.toFixed(1)}\n`;
      report += `- Average Success Rate: ${avgMetrics.successRate.toFixed(2)}%\n`;
      report += `- Average Quality Score: ${avgMetrics.qualityScore.toFixed(2)}\n`;
      report += `- Average Collaboration Score: ${avgMetrics.collaborationScore.toFixed(2)}\n`;
      report += `- Average Innovation Index: ${avgMetrics.innovationIndex.toFixed(2)}\n\n`;
    });

    report += `## Individual Agent Details\n\n`;

    agents.forEach(agent => {
      report += `### ${agent.name} (${agent.role})\n\n`;
      report += `- **ID**: ${agent.id}\n`;
      report += `- **Status**: ${agent.state.status}\n`;
      report += `- **Workload**: ${agent.state.workload.toFixed(1)}%\n`;
      report += `- **Energy Level**: ${agent.state.energyLevel.toFixed(1)}%\n`;
      report += `- **Mood**: ${agent.state.mood}\n\n`;

      report += `**Performance Metrics**:\n`;
      report += `- Tasks Completed: ${agent.performanceMetrics.tasksCompleted}\n`;
      report += `- Success Rate: ${agent.performanceMetrics.successRate.toFixed(2)}%\n`;
      report += `- Quality Score: ${agent.performanceMetrics.qualityScore.toFixed(2)}\n`;
      report += `- Collaboration Score: ${agent.performanceMetrics.collaborationScore.toFixed(2)}\n`;
      report += `- Innovation Index: ${agent.performanceMetrics.innovationIndex.toFixed(2)}\n`;
      report += `- Resource Utilization: ${agent.performanceMetrics.resourceUtilization.toFixed(2)}%\n\n`;

      report += `**Memory**:\n`;
      report += `- Short-term memories: ${agent.memory.shortTerm.length}\n`;
      report += `- Long-term memories: ${agent.memory.longTerm.length}\n`;
      report += `- Episodes: ${agent.memory.episodic.length}\n`;
      report += `- Communications: ${agent.communicationLog.length}\n\n`;

      report += `**Capabilities** (${agent.capabilities.length}):\n`;
      agent.capabilities.slice(0, 3).forEach(cap => {
        report += `- ${cap.name}: Proficiency ${cap.proficiency}%, Success Rate ${cap.successRate}%\n`;
      });
      report += `\n`;
    });

    const filename = path.join(this.reportsDir, `${reportId}-agent-performance.md`);
    await fs.writeFile(filename, report, 'utf-8');
    console.log(`✓ Agent performance report saved: ${filename}`);
  }

  /**
   * Generate network analysis report
   */
  private async generateNetworkAnalysisReport(
    state: SimulationState,
    reportId: string
  ): Promise<void> {
    const network = state.network;

    let report = `# Network Analysis Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    report += `## Network Overview\n\n`;
    report += `- **Total Agents**: ${network.networkMetrics.totalAgents}\n`;
    report += `- **Active Agents**: ${network.networkMetrics.activeAgents}\n`;
    report += `- **Total Connections**: ${network.connections.length}\n`;
    report += `- **Average Connectivity**: ${network.networkMetrics.averageConnectivity.toFixed(2)}%\n`;
    report += `- **Average Trust**: ${network.networkMetrics.averageTrust.toFixed(2)}%\n`;
    report += `- **Collaboration Index**: ${network.networkMetrics.collaborationIndex.toFixed(2)}%\n\n`;

    report += `## Consensus Mechanism\n\n`;
    report += `- **Type**: ${network.consensusMechanism.type}\n`;
    report += `- **Threshold**: ${network.consensusMechanism.threshold}%\n`;
    report += `- **Tie Breaker**: ${network.consensusMechanism.tieBreaker}\n\n`;

    report += `## Connection Analysis\n\n`;

    const trustLevels = {
      high: network.connections.filter(c => c.trust >= 80).length,
      medium: network.connections.filter(c => c.trust >= 60 && c.trust < 80).length,
      low: network.connections.filter(c => c.trust < 60).length
    };

    report += `**Trust Distribution**:\n`;
    report += `- High Trust (≥80): ${trustLevels.high}\n`;
    report += `- Medium Trust (60-80): ${trustLevels.medium}\n`;
    report += `- Low Trust (<60): ${trustLevels.low}\n\n`;

    report += `## Governance Rules\n\n`;
    network.governanceRules.forEach(rule => {
      report += `### ${rule.name}\n`;
      report += `- **Description**: ${rule.description}\n`;
      report += `- **Enforcement**: ${rule.enforcement}\n`;
      report += `- **Violations**: ${rule.violations.length}\n\n`;
    });

    const filename = path.join(this.reportsDir, `${reportId}-network-analysis.md`);
    await fs.writeFile(filename, report, 'utf-8');
    console.log(`✓ Network analysis report saved: ${filename}`);
  }

  /**
   * Generate event log
   */
  private async generateEventLog(state: SimulationState, reportId: string): Promise<void> {
    const events = state.events.slice(-1000); // Last 1000 events

    let log = `# Event Log\n\n`;
    log += `Generated: ${new Date().toISOString()}\n`;
    log += `Total Events: ${state.events.length}\n`;
    log += `Showing: Last ${events.length} events\n\n`;

    events.forEach(event => {
      log += `## ${event.timestamp.toISOString()}\n`;
      log += `- **Type**: ${event.type}\n`;
      log += `- **Category**: ${event.category}\n`;
      log += `- **Source**: ${event.source}\n`;
      log += `- **Description**: ${event.description}\n`;
      log += `- **Impact Scope**: ${event.impact.scope}\n`;
      log += `- **Magnitude**: ${event.impact.magnitude}\n\n`;
    });

    const filename = path.join(this.reportsDir, `${reportId}-event-log.md`);
    await fs.writeFile(filename, log, 'utf-8');
    console.log(`✓ Event log saved: ${filename}`);
  }

  /**
   * Generate metrics report
   */
  private async generateMetricsReport(state: SimulationState, reportId: string): Promise<void> {
    const metrics = {
      timestamp: new Date().toISOString(),
      simulation: {
        id: state.id,
        startTime: state.startTime,
        endTime: state.currentTime,
        iterations: state.iteration
      },
      performance: state.metrics.performance,
      business: state.metrics.business,
      agent: state.metrics.agent,
      network: state.metrics.network,
      quality: state.metrics.quality
    };

    const filename = path.join(this.reportsDir, `${reportId}-metrics.json`);
    await fs.writeFile(filename, JSON.stringify(metrics, null, 2), 'utf-8');
    console.log(`✓ Metrics report saved: ${filename}`);
  }

  /**
   * Generate full JSON dump
   */
  private async generateJSONDump(state: SimulationState, reportId: string): Promise<void> {
    // Create a serializable version of the state
    const serializable = {
      ...state,
      startTime: state.startTime.toISOString(),
      currentTime: state.currentTime.toISOString(),
      events: state.events.slice(-500).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString()
      }))
    };

    const filename = path.join(this.reportsDir, `${reportId}-full-state.json`);
    await fs.writeFile(filename, JSON.stringify(serializable, null, 2), 'utf-8');
    console.log(`✓ Full state dump saved: ${filename}`);
  }

  /**
   * Generate periodic snapshot
   */
  public async generateSnapshot(state: SimulationState, iteration: number): Promise<void> {
    const snapshot = {
      iteration,
      timestamp: new Date().toISOString(),
      metrics: state.metrics,
      agentStates: state.network.agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: a.state.status,
        workload: a.state.workload,
        tasksCompleted: a.performanceMetrics.tasksCompleted
      }))
    };

    const filename = path.join(this.reportsDir, `snapshot-${iteration}.json`);
    await fs.writeFile(filename, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  // Helper methods

  private countEventTypes(state: SimulationState): string {
    const counts: Record<string, number> = {};

    state.events.forEach(event => {
      counts[event.type] = (counts[event.type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
  }

  private generateInsights(state: SimulationState): string {
    const insights: string[] = [];

    // Agent performance insights
    if (state.metrics.agent.decisionQuality > 80) {
      insights.push('- ✓ Agent decision quality is excellent (>80%)');
    } else if (state.metrics.agent.decisionQuality < 60) {
      insights.push('- ⚠ Agent decision quality needs improvement (<60%)');
    }

    // Network health insights
    if (state.metrics.network.trust > 75) {
      insights.push('- ✓ Network trust is high, enabling effective collaboration');
    }

    if (state.metrics.network.connectivity > 80) {
      insights.push('- ✓ Network connectivity is strong');
    }

    // Performance insights
    if (state.metrics.performance.utilizationRate > 85) {
      insights.push('- ⚠ High utilization rate may indicate capacity constraints');
    } else if (state.metrics.performance.utilizationRate < 50) {
      insights.push('- ⚠ Low utilization rate suggests underutilized resources');
    }

    // Business insights
    if (state.metrics.business.growth > 10) {
      insights.push('- ✓ Strong growth trajectory');
    }

    if (insights.length === 0) {
      insights.push('- No significant insights at this time');
    }

    return insights.join('\n');
  }
}
