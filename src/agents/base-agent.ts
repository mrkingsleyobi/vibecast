/**
 * Base Agent Implementation
 * Foundation for all federated agents in the DXP agency simulation
 */

import {
  Agent,
  AgentRole,
  AgentState,
  AgentMemory,
  CommunicationEvent,
  CommunicationType,
  Decision,
  AgentGoal,
  AgentLearning
} from '../models/agent-types';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseAgent implements Agent {
  public id: string;
  public role: AgentRole;
  public name: string;
  public capabilities: Agent['capabilities'];
  public knowledgeDomains: Agent['knowledgeDomains'];
  public decisionMakingStyle: Agent['decisionMakingStyle'];
  public performanceMetrics: Agent['performanceMetrics'];
  public state: AgentState;
  public memory: AgentMemory;
  public communicationLog: CommunicationEvent[];

  protected goals: AgentGoal[] = [];
  protected learningHistory: AgentLearning[] = [];

  constructor(
    role: AgentRole,
    name: string,
    decisionMakingStyle: Agent['decisionMakingStyle']
  ) {
    this.id = uuidv4();
    this.role = role;
    this.name = name;
    this.capabilities = [];
    this.knowledgeDomains = [];
    this.decisionMakingStyle = decisionMakingStyle;

    this.performanceMetrics = {
      tasksCompleted: 0,
      successRate: 0,
      averageResponseTime: 0,
      qualityScore: 0,
      collaborationScore: 0,
      innovationIndex: 0,
      resourceUtilization: 0,
      clientSatisfaction: 0
    };

    this.state = {
      status: 'IDLE',
      workload: 0,
      availability: 100,
      mood: 'NEUTRAL',
      energyLevel: 100
    };

    this.memory = {
      shortTerm: [],
      longTerm: [],
      episodic: [],
      semantic: [],
      procedural: []
    };

    this.communicationLog = [];
  }

  /**
   * Abstract method for agent-specific decision making
   */
  public abstract makeDecision(context: Record<string, any>): Decision;

  /**
   * Process incoming communication
   */
  public receiveCommunication(event: CommunicationEvent): void {
    this.communicationLog.push(event);
    this.addToShortTermMemory({
      id: uuidv4(),
      timestamp: new Date(),
      content: event,
      importance: this.assessImportance(event),
      category: 'COMMUNICATION',
      retrievalCount: 0,
      lastAccessed: new Date()
    });

    // Update performance metrics
    this.performanceMetrics.averageResponseTime =
      (this.performanceMetrics.averageResponseTime * this.communicationLog.length + 100) /
      (this.communicationLog.length + 1);
  }

  /**
   * Send communication to other agents
   */
  public sendCommunication(
    to: string[],
    type: CommunicationType,
    content: string,
    context: Record<string, any> = {}
  ): CommunicationEvent {
    const event: CommunicationEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      from: this.id,
      to,
      type,
      content,
      context,
      sentiment: this.calculateSentiment(content),
      effectiveness: 0 // Will be updated based on response
    };

    this.communicationLog.push(event);
    return event;
  }

  /**
   * Execute a task
   */
  public async executeTask(task: AgentTask): Promise<TaskResult> {
    this.state.status = 'BUSY';
    this.state.currentTask = task.id;

    const startTime = Date.now();

    try {
      const result = await this.performTask(task);
      const duration = Date.now() - startTime;

      // Update metrics
      this.performanceMetrics.tasksCompleted++;
      this.performanceMetrics.successRate =
        (this.performanceMetrics.successRate * (this.performanceMetrics.tasksCompleted - 1) +
        (result.success ? 100 : 0)) / this.performanceMetrics.tasksCompleted;

      // Record episode
      this.memory.episodic.push({
        id: uuidv4(),
        timestamp: new Date(),
        event: `Task: ${task.name}`,
        participants: [this.id],
        outcome: result.success ? 'SUCCESS' : 'FAILURE',
        lessonsLearned: result.insights || [],
        emotionalValence: result.success ? 50 : -30
      });

      this.state.status = 'IDLE';
      this.state.currentTask = undefined;

      return result;
    } catch (error) {
      this.state.status = 'IDLE';
      this.state.currentTask = undefined;

      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Abstract method for task execution
   */
  protected abstract performTask(task: AgentTask): Promise<TaskResult>;

  /**
   * Learn from experience
   */
  public learn(observation: string, outcome: string): void {
    const learning: AgentLearning = {
      id: uuidv4(),
      timestamp: new Date(),
      trigger: observation,
      observation,
      hypothesis: this.formHypothesis(observation, outcome),
      conclusion: outcome,
      integration: false
    };

    this.learningHistory.push(learning);

    // Integrate into long-term memory if significant
    if (this.assessLearningSignificance(learning) > 70) {
      this.addToLongTermMemory({
        id: uuidv4(),
        timestamp: new Date(),
        content: learning,
        importance: this.assessLearningSignificance(learning),
        category: 'LEARNING',
        retrievalCount: 0,
        lastAccessed: new Date()
      });
      learning.integration = true;
    }
  }

  /**
   * Retrieve relevant memories
   */
  public recallMemories(query: string, limit: number = 5): Agent['memory']['shortTerm'] {
    const allMemories = [...this.memory.shortTerm, ...this.memory.longTerm];

    // Simple relevance scoring (in real implementation, use embeddings)
    const scored = allMemories.map(mem => ({
      memory: mem,
      relevance: this.calculateRelevance(mem, query)
    }));

    scored.sort((a, b) => b.relevance - a.relevance);

    return scored.slice(0, limit).map(s => {
      s.memory.retrievalCount++;
      s.memory.lastAccessed = new Date();
      return s.memory;
    });
  }

  /**
   * Update agent state based on workload and energy
   */
  public updateState(): void {
    // Energy decreases with work
    if (this.state.status === 'BUSY') {
      this.state.energyLevel = Math.max(0, this.state.energyLevel - 1);
    } else {
      this.state.energyLevel = Math.min(100, this.state.energyLevel + 0.5);
    }

    // Update mood based on energy and recent outcomes
    if (this.state.energyLevel < 30) {
      this.state.mood = 'STRESSED';
    } else if (this.performanceMetrics.successRate > 80) {
      this.state.mood = 'POSITIVE';
    } else if (this.performanceMetrics.successRate < 50) {
      this.state.mood = 'CHALLENGED';
    } else {
      this.state.mood = 'NEUTRAL';
    }

    // Update availability
    this.state.availability = this.state.status === 'IDLE' ? 100 : 0;
  }

  /**
   * Get agent status summary
   */
  public getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status: this.state.status,
      workload: this.state.workload,
      availability: this.state.availability,
      performanceScore: this.calculateOverallPerformance(),
      recentActivities: this.getRecentActivities(5)
    };
  }

  private calculateOverallPerformance(): number {
    return (
      this.performanceMetrics.successRate * 0.3 +
      this.performanceMetrics.qualityScore * 0.3 +
      this.performanceMetrics.collaborationScore * 0.2 +
      this.performanceMetrics.innovationIndex * 0.2
    );
  }

  private getRecentActivities(count: number): string[] {
    return this.memory.episodic
      .slice(-count)
      .map(e => `${e.event} - ${e.outcome}`);
  }

  private addToShortTermMemory(item: Agent['memory']['shortTerm'][0]): void {
    this.memory.shortTerm.push(item);

    // Keep only recent items in short-term memory (max 100)
    if (this.memory.shortTerm.length > 100) {
      const removed = this.memory.shortTerm.shift();
      // Move important items to long-term memory
      if (removed && removed.importance > 70) {
        this.memory.longTerm.push(removed);
      }
    }
  }

  private addToLongTermMemory(item: Agent['memory']['longTerm'][0]): void {
    this.memory.longTerm.push(item);
  }

  private assessImportance(event: CommunicationEvent): number {
    // Simple importance scoring based on type
    const typeImportance: Record<CommunicationType, number> = {
      REQUEST: 80,
      DECISION: 90,
      ALERT: 95,
      QUERY: 60,
      RESPONSE: 50,
      RECOMMENDATION: 70,
      UPDATE: 40,
      COLLABORATION: 75
    };

    return typeImportance[event.type] || 50;
  }

  private calculateSentiment(content: string): number {
    // Simple sentiment analysis (in production, use NLP)
    const positiveWords = ['good', 'great', 'excellent', 'success', 'achieve'];
    const negativeWords = ['problem', 'issue', 'fail', 'error', 'delay'];

    let sentiment = 0;
    const lower = content.toLowerCase();

    positiveWords.forEach(word => {
      if (lower.includes(word)) sentiment += 20;
    });

    negativeWords.forEach(word => {
      if (lower.includes(word)) sentiment -= 20;
    });

    return Math.max(-100, Math.min(100, sentiment));
  }

  private calculateRelevance(memory: Agent['memory']['shortTerm'][0], query: string): number {
    // Simple keyword matching (in production, use embeddings)
    const queryWords = query.toLowerCase().split(' ');
    const contentStr = JSON.stringify(memory.content).toLowerCase();

    let matches = 0;
    queryWords.forEach(word => {
      if (contentStr.includes(word)) matches++;
    });

    return (matches / queryWords.length) * 100 * (memory.importance / 100);
  }

  private formHypothesis(observation: string, outcome: string): string {
    return `Based on "${observation}", the hypothesis is that similar situations will lead to "${outcome}"`;
  }

  private assessLearningSignificance(learning: AgentLearning): number {
    // Assess based on novelty and impact
    const novelty = this.learningHistory.filter(l =>
      l.observation === learning.observation
    ).length === 1 ? 100 : 50;

    return novelty * 0.7 + 50 * 0.3; // Simple scoring
  }
}

export interface AgentTask {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  priority: number;
  deadline?: Date;
}

export interface TaskResult {
  success: boolean;
  output: any;
  error?: string;
  duration: number;
  insights?: string[];
}

export interface AgentStatus {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentState['status'];
  workload: number;
  availability: number;
  performanceScore: number;
  recentActivities: string[];
}
