/**
 * Agent Factory
 * Creates and manages the federated agent network
 */

import { Agent, AgentRole, FederatedNetwork, Connection } from '../models/agent-types';
import { BusinessStrategistAgent } from './business-strategist';
import { TechnicalArchitectAgent } from './technical-architect';
import { ProjectManagerAgent } from './project-manager';
import { ClientAdvisorAgent } from './client-advisor';
import { OperationsManagerAgent } from './operations-manager';
import { v4 as uuidv4 } from 'uuid';

export class AgentFactory {
  private agents: Map<string, Agent> = new Map();
  private network: FederatedNetwork | null = null;

  /**
   * Create a federated network of agents
   */
  public createFederatedNetwork(count: number = 5): FederatedNetwork {
    // Clear existing agents
    this.agents.clear();

    // Create one of each specialized agent type
    const agentInstances: Agent[] = [
      new BusinessStrategistAgent(`Strategist-${uuidv4().substring(0, 8)}`),
      new TechnicalArchitectAgent(`Architect-${uuidv4().substring(0, 8)}`),
      new ProjectManagerAgent(`PM-${uuidv4().substring(0, 8)}`),
      new ClientAdvisorAgent(`Advisor-${uuidv4().substring(0, 8)}`),
      new OperationsManagerAgent(`Ops-${uuidv4().substring(0, 8)}`)
    ];

    // Add additional agents if count > 5
    while (agentInstances.length < count) {
      const agentType = agentInstances.length % 5;
      switch (agentType) {
        case 0:
          agentInstances.push(new BusinessStrategistAgent(`Strategist-${uuidv4().substring(0, 8)}`));
          break;
        case 1:
          agentInstances.push(new TechnicalArchitectAgent(`Architect-${uuidv4().substring(0, 8)}`));
          break;
        case 2:
          agentInstances.push(new ProjectManagerAgent(`PM-${uuidv4().substring(0, 8)}`));
          break;
        case 3:
          agentInstances.push(new ClientAdvisorAgent(`Advisor-${uuidv4().substring(0, 8)}`));
          break;
        case 4:
          agentInstances.push(new OperationsManagerAgent(`Ops-${uuidv4().substring(0, 8)}`));
          break;
      }
    }

    // Store agents
    agentInstances.forEach(agent => {
      this.agents.set(agent.id, agent);
    });

    // Create connections between agents
    const connections = this.createConnections(agentInstances);

    // Create federated network
    this.network = {
      agents: agentInstances,
      connections,
      sharedKnowledge: {
        id: uuidv4(),
        type: 'BEST_PRACTICE',
        content: {},
        contributors: [],
        confidence: 80,
        validation: 75,
        applications: []
      },
      consensusMechanism: {
        type: 'WEIGHTED',
        threshold: 60,
        votingRights: this.calculateVotingRights(agentInstances),
        tieBreaker: 'Project Manager'
      },
      governanceRules: this.createGovernanceRules(),
      networkMetrics: {
        totalAgents: agentInstances.length,
        activeAgents: agentInstances.length,
        averageConnectivity: 80,
        averageTrust: 75,
        knowledgeGrowth: 0,
        collaborationIndex: 70,
        decisionQuality: 75,
        innovationRate: 0
      }
    };

    return this.network;
  }

  /**
   * Get an agent by ID
   */
  public getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  public getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by role
   */
  public getAgentsByRole(role: AgentRole): Agent[] {
    return Array.from(this.agents.values()).filter(agent => agent.role === role);
  }

  /**
   * Get the federated network
   */
  public getNetwork(): FederatedNetwork | null {
    return this.network;
  }

  /**
   * Update network metrics
   */
  public updateNetworkMetrics(): void {
    if (!this.network) return;

    const agents = this.network.agents;
    const activeAgents = agents.filter(a => a.state.status !== 'OFFLINE').length;

    // Calculate average connectivity
    const totalConnections = this.network.connections.length;
    const possibleConnections = (agents.length * (agents.length - 1)) / 2;
    const connectivity = (totalConnections / possibleConnections) * 100;

    // Calculate average trust
    const avgTrust =
      this.network.connections.reduce((sum, conn) => sum + conn.trust, 0) /
      Math.max(1, this.network.connections.length);

    // Calculate collaboration index
    const totalCommunications = agents.reduce(
      (sum, agent) => sum + agent.communicationLog.length,
      0
    );
    const collaborationIndex = Math.min(100, (totalCommunications / agents.length) * 2);

    // Update metrics
    this.network.networkMetrics = {
      totalAgents: agents.length,
      activeAgents,
      averageConnectivity: connectivity,
      averageTrust: avgTrust,
      knowledgeGrowth: this.network.networkMetrics.knowledgeGrowth + Math.random() * 2,
      collaborationIndex,
      decisionQuality: this.calculateDecisionQuality(agents),
      innovationRate: this.network.networkMetrics.innovationRate + Math.random() * 1.5
    };
  }

  private createConnections(agents: Agent[]): Connection[] {
    const connections: Connection[] = [];

    // Create connections between all agents (fully connected network)
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agent1 = agents[i];
        const agent2 = agents[j];

        // Base trust on role compatibility
        const trust = this.calculateInitialTrust(agent1.role, agent2.role);

        connections.push({
          fromAgent: agent1.id,
          toAgent: agent2.id,
          strength: 50 + Math.random() * 30,
          trust,
          communicationFrequency: 0,
          collaborationHistory: []
        });

        // Add reverse connection
        connections.push({
          fromAgent: agent2.id,
          toAgent: agent1.id,
          strength: 50 + Math.random() * 30,
          trust,
          communicationFrequency: 0,
          collaborationHistory: []
        });
      }
    }

    return connections;
  }

  private calculateInitialTrust(role1: AgentRole, role2: AgentRole): number {
    // Define trust relationships between roles
    const trustMatrix: Record<AgentRole, Record<AgentRole, number>> = {
      [AgentRole.BUSINESS_STRATEGIST]: {
        [AgentRole.BUSINESS_STRATEGIST]: 80,
        [AgentRole.TECHNICAL_ARCHITECT]: 75,
        [AgentRole.PROJECT_MANAGER]: 85,
        [AgentRole.CLIENT_ADVISOR]: 90,
        [AgentRole.OPERATIONS_MANAGER]: 70
      },
      [AgentRole.TECHNICAL_ARCHITECT]: {
        [AgentRole.BUSINESS_STRATEGIST]: 75,
        [AgentRole.TECHNICAL_ARCHITECT]: 85,
        [AgentRole.PROJECT_MANAGER]: 80,
        [AgentRole.CLIENT_ADVISOR]: 70,
        [AgentRole.OPERATIONS_MANAGER]: 75
      },
      [AgentRole.PROJECT_MANAGER]: {
        [AgentRole.BUSINESS_STRATEGIST]: 85,
        [AgentRole.TECHNICAL_ARCHITECT]: 80,
        [AgentRole.PROJECT_MANAGER]: 80,
        [AgentRole.CLIENT_ADVISOR]: 85,
        [AgentRole.OPERATIONS_MANAGER]: 90
      },
      [AgentRole.CLIENT_ADVISOR]: {
        [AgentRole.BUSINESS_STRATEGIST]: 90,
        [AgentRole.TECHNICAL_ARCHITECT]: 70,
        [AgentRole.PROJECT_MANAGER]: 85,
        [AgentRole.CLIENT_ADVISOR]: 85,
        [AgentRole.OPERATIONS_MANAGER]: 75
      },
      [AgentRole.OPERATIONS_MANAGER]: {
        [AgentRole.BUSINESS_STRATEGIST]: 70,
        [AgentRole.TECHNICAL_ARCHITECT]: 75,
        [AgentRole.PROJECT_MANAGER]: 90,
        [AgentRole.CLIENT_ADVISOR]: 75,
        [AgentRole.OPERATIONS_MANAGER]: 80
      }
    };

    return trustMatrix[role1]?.[role2] || 70;
  }

  private calculateVotingRights(agents: Agent[]): Record<string, number> {
    const rights: Record<string, number> = {};

    agents.forEach(agent => {
      // Weight voting rights by role importance and experience
      const roleWeight = this.getRoleWeight(agent.role);
      const experienceWeight = agent.performanceMetrics.tasksCompleted > 0 ? 1.2 : 1.0;

      rights[agent.id] = roleWeight * experienceWeight;
    });

    return rights;
  }

  private getRoleWeight(role: AgentRole): number {
    const weights: Record<AgentRole, number> = {
      [AgentRole.BUSINESS_STRATEGIST]: 1.2,
      [AgentRole.TECHNICAL_ARCHITECT]: 1.2,
      [AgentRole.PROJECT_MANAGER]: 1.3, // Highest weight
      [AgentRole.CLIENT_ADVISOR]: 1.1,
      [AgentRole.OPERATIONS_MANAGER]: 1.0
    };

    return weights[role] || 1.0;
  }

  private createGovernanceRules() {
    return [
      {
        id: uuidv4(),
        name: 'Decision Transparency',
        description: 'All decisions must be documented with rationale',
        scope: ['DECISION'],
        enforcement: 'MANDATORY' as const,
        violations: []
      },
      {
        id: uuidv4(),
        name: 'Collaboration Requirement',
        description: 'Cross-functional decisions require input from relevant agents',
        scope: ['COLLABORATION', 'DECISION'],
        enforcement: 'MANDATORY' as const,
        violations: []
      },
      {
        id: uuidv4(),
        name: 'Knowledge Sharing',
        description: 'Significant insights should be shared with the network',
        scope: ['LEARNING', 'KNOWLEDGE'],
        enforcement: 'RECOMMENDED' as const,
        violations: []
      }
    ];
  }

  private calculateDecisionQuality(agents: Agent[]): number {
    const decisions = agents.reduce((sum, agent) => {
      const episodicDecisions = agent.memory.episodic.filter(
        e => e.event.includes('Decision')
      ).length;
      return sum + episodicDecisions;
    }, 0);

    if (decisions === 0) return 70;

    // Quality based on success rate and collaboration
    const avgSuccessRate =
      agents.reduce((sum, a) => sum + a.performanceMetrics.successRate, 0) / agents.length;

    return avgSuccessRate * 0.7 + 30; // Weighted towards success rate
  }
}
