/**
 * Project Manager Agent
 * Focuses on project planning, resource allocation, and delivery
 */

import { BaseAgent, AgentTask, TaskResult } from './base-agent';
import { AgentRole, Decision, DecisionMakingStyle } from '../models/agent-types';
import { ProjectPhase } from '../models/dxp-agency';
import { v4 as uuidv4 } from 'uuid';

export class ProjectManagerAgent extends BaseAgent {
  constructor(name: string = 'Project Manager') {
    super(AgentRole.PROJECT_MANAGER, name, DecisionMakingStyle.COLLABORATIVE);

    this.capabilities = [
      {
        id: uuidv4(),
        name: 'Project Planning',
        category: 'Management',
        proficiency: 92,
        experience: 10,
        successRate: 90,
        costEfficiency: 88
      },
      {
        id: uuidv4(),
        name: 'Resource Management',
        category: 'Management',
        proficiency: 88,
        experience: 8,
        successRate: 85,
        costEfficiency: 90
      },
      {
        id: uuidv4(),
        name: 'Risk Management',
        category: 'Management',
        proficiency: 86,
        experience: 7,
        successRate: 82,
        costEfficiency: 85
      },
      {
        id: uuidv4(),
        name: 'Stakeholder Communication',
        category: 'Communication',
        proficiency: 90,
        experience: 9,
        successRate: 88,
        costEfficiency: 92
      }
    ];
  }

  public makeDecision(context: Record<string, any>): Decision {
    const options = context.options || [];
    const constraints = context.constraints || {};

    const scoredOptions = options.map((option: string) => {
      const feasibility = this.assessFeasibility(option, constraints);
      const resourceAvailability = this.checkResourceAvailability(option);
      const timelineImpact = this.assessTimelineImpact(option);
      const stakeholderSatisfaction = this.estimateStakeholderSatisfaction(option);

      return {
        option,
        score: feasibility * 0.3 + resourceAvailability * 0.25 +
               (100 - timelineImpact) * 0.25 + stakeholderSatisfaction * 0.2
      };
    });

    scoredOptions.sort((a, b) => b.score - a.score);
    const selected = scoredOptions[0]?.option || options[0];

    return {
      id: uuidv4(),
      timestamp: new Date(),
      maker: this.id,
      type: 'PROJECT_MANAGEMENT',
      options,
      selected,
      rationale: `Selected based on project management criteria. Score: ${scoredOptions[0]?.score.toFixed(2)}`,
      confidence: Math.min(88, scoredOptions[0]?.score || 50),
      impact: 80,
      reversible: true
    };
  }

  protected async performTask(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      let output: any;

      switch (task.name) {
        case 'Create Project Plan':
          output = await this.createProjectPlan(task.parameters);
          break;
        case 'Allocate Resources':
          output = await this.allocateResources(task.parameters);
          break;
        case 'Track Progress':
          output = await this.trackProgress(task.parameters);
          break;
        case 'Manage Risks':
          output = await this.manageRisks(task.parameters);
          break;
        default:
          output = { message: 'Task type not recognized' };
      }

      return {
        success: true,
        output,
        duration: Date.now() - startTime,
        insights: this.extractProjectInsights(output)
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }

  private async createProjectPlan(params: Record<string, any>): Promise<any> {
    const scope = params.scope || [];
    const deadline = params.deadline || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    return {
      phases: this.definePhases(scope),
      milestones: this.defineMilestones(scope),
      tasks: this.breakdownTasks(scope),
      dependencies: this.identifyDependencies(),
      timeline: this.createTimeline(deadline),
      resources: this.estimateResources(scope),
      budget: this.estimateBudget(scope),
      risks: this.identifyProjectRisks(scope)
    };
  }

  private async allocateResources(params: Record<string, any>): Promise<any> {
    const requirements = params.requirements || [];
    const available = params.available || [];

    return {
      allocation: this.optimizeResourceAllocation(requirements, available),
      utilization: this.calculateUtilization(requirements, available),
      gaps: this.identifyResourceGaps(requirements, available),
      recommendations: this.generateResourceRecommendations(requirements, available)
    };
  }

  private async trackProgress(params: Record<string, any>): Promise<any> {
    const projectId = params.projectId || 'unknown';

    return {
      overallProgress: 45 + Math.random() * 30,
      phaseProgress: this.calculatePhaseProgress(),
      milestoneStatus: this.getMilestoneStatus(),
      budgetStatus: this.getBudgetStatus(),
      schedule: {
        status: 'ON_TRACK',
        variance: -2, // days
        criticalPath: ['Design', 'Development', 'Testing']
      },
      issues: this.identifyIssues(),
      nextActions: this.defineNextActions()
    };
  }

  private async manageRisks(params: Record<string, any>): Promise<any> {
    const context = params.context || {};

    return {
      identified: this.identifyProjectRisks(context),
      assessed: this.assessRisks(),
      prioritized: this.prioritizeRisks(),
      mitigation: this.developMitigationStrategies(),
      monitoring: this.setupRiskMonitoring()
    };
  }

  private definePhases(scope: any[]): any[] {
    return [
      { name: ProjectPhase.DISCOVERY, duration: 2, effort: 80 },
      { name: ProjectPhase.DESIGN, duration: 3, effort: 120 },
      { name: ProjectPhase.DEVELOPMENT, duration: 8, effort: 640 },
      { name: ProjectPhase.TESTING, duration: 2, effort: 160 },
      { name: ProjectPhase.DEPLOYMENT, duration: 1, effort: 80 }
    ];
  }

  private defineMilestones(scope: any[]): any[] {
    return [
      { name: 'Requirements Complete', week: 2 },
      { name: 'Design Approved', week: 5 },
      { name: 'MVP Ready', week: 10 },
      { name: 'Testing Complete', week: 14 },
      { name: 'Go Live', week: 16 }
    ];
  }

  private breakdownTasks(scope: any[]): any[] {
    return [
      { name: 'Requirements gathering', hours: 40, phase: 'DISCOVERY' },
      { name: 'Architecture design', hours: 60, phase: 'DESIGN' },
      { name: 'UI/UX design', hours: 80, phase: 'DESIGN' },
      { name: 'Backend development', hours: 320, phase: 'DEVELOPMENT' },
      { name: 'Frontend development', hours: 240, phase: 'DEVELOPMENT' },
      { name: 'Integration', hours: 80, phase: 'DEVELOPMENT' },
      { name: 'Testing', hours: 160, phase: 'TESTING' },
      { name: 'Deployment', hours: 40, phase: 'DEPLOYMENT' }
    ];
  }

  private identifyDependencies(): any[] {
    return [
      { from: 'Requirements', to: 'Design' },
      { from: 'Design', to: 'Development' },
      { from: 'Development', to: 'Testing' },
      { from: 'Testing', to: 'Deployment' }
    ];
  }

  private createTimeline(deadline: Date): any {
    const start = new Date();
    return {
      start,
      end: deadline,
      duration: Math.ceil((deadline.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      buffer: '10%'
    };
  }

  private estimateResources(scope: any[]): any {
    return {
      team: [
        { role: 'Architect', count: 1, allocation: '50%' },
        { role: 'Backend Developer', count: 2, allocation: '100%' },
        { role: 'Frontend Developer', count: 2, allocation: '100%' },
        { role: 'Designer', count: 1, allocation: '75%' },
        { role: 'QA Engineer', count: 1, allocation: '100%' },
        { role: 'DevOps', count: 1, allocation: '50%' }
      ],
      total: 7.75
    };
  }

  private estimateBudget(scope: any[]): any {
    return {
      labor: 500000,
      infrastructure: 50000,
      licenses: 30000,
      contingency: 60000,
      total: 640000
    };
  }

  private identifyProjectRisks(context: any): any[] {
    return [
      {
        category: 'TIMELINE',
        description: 'Scope creep',
        probability: 60,
        impact: 70,
        mitigation: 'Strict change control process'
      },
      {
        category: 'RESOURCE',
        description: 'Key resource unavailability',
        probability: 40,
        impact: 80,
        mitigation: 'Cross-training and documentation'
      },
      {
        category: 'TECHNICAL',
        description: 'Integration complexity',
        probability: 50,
        impact: 60,
        mitigation: 'Early proof-of-concept'
      }
    ];
  }

  private optimizeResourceAllocation(requirements: any[], available: any[]): any[] {
    return requirements.map((req: any, index: number) => ({
      requirement: req,
      assigned: available[index % available.length],
      utilization: 70 + Math.random() * 25
    }));
  }

  private calculateUtilization(requirements: any[], available: any[]): number {
    return 75 + Math.random() * 20;
  }

  private identifyResourceGaps(requirements: any[], available: any[]): any[] {
    return [
      { skill: 'Senior Frontend Developer', gap: 1 },
      { skill: 'DevOps Engineer', gap: 0.5 }
    ];
  }

  private generateResourceRecommendations(requirements: any[], available: any[]): string[] {
    return [
      'Hire additional frontend developer',
      'Contract DevOps support',
      'Cross-train existing team members'
    ];
  }

  private calculatePhaseProgress(): Record<string, number> {
    return {
      [ProjectPhase.DISCOVERY]: 100,
      [ProjectPhase.DESIGN]: 80,
      [ProjectPhase.DEVELOPMENT]: 45,
      [ProjectPhase.TESTING]: 0,
      [ProjectPhase.DEPLOYMENT]: 0
    };
  }

  private getMilestoneStatus(): any[] {
    return [
      { name: 'Requirements Complete', status: 'COMPLETED' },
      { name: 'Design Approved', status: 'IN_PROGRESS' },
      { name: 'MVP Ready', status: 'PENDING' }
    ];
  }

  private getBudgetStatus(): any {
    return {
      allocated: 640000,
      spent: 280000,
      remaining: 360000,
      forecast: 620000,
      variance: -3.1 // percentage
    };
  }

  private identifyIssues(): any[] {
    return [
      { type: 'BLOCKER', description: 'API integration delayed', impact: 'HIGH' },
      { type: 'RISK', description: 'Resource constraint', impact: 'MEDIUM' }
    ];
  }

  private defineNextActions(): string[] {
    return [
      'Complete API integration',
      'Review design mockups',
      'Schedule stakeholder demo',
      'Update project timeline'
    ];
  }

  private assessRisks(): any[] {
    return this.identifyProjectRisks({}).map(risk => ({
      ...risk,
      severity: (risk.probability * risk.impact) / 100,
      priority: risk.probability > 50 && risk.impact > 60 ? 'HIGH' : 'MEDIUM'
    }));
  }

  private prioritizeRisks(): any[] {
    return this.assessRisks().sort((a, b) => b.severity - a.severity);
  }

  private developMitigationStrategies(): any[] {
    return this.prioritizeRisks().map(risk => ({
      risk: risk.description,
      strategy: risk.mitigation,
      owner: 'PM',
      timeline: '1-2 weeks'
    }));
  }

  private setupRiskMonitoring(): any {
    return {
      frequency: 'Weekly',
      metrics: ['Probability', 'Impact', 'Trend'],
      reporting: 'Dashboard + Weekly review meeting'
    };
  }

  private assessFeasibility(option: string, constraints: any): number {
    return 70 + Math.random() * 25;
  }

  private checkResourceAvailability(option: string): number {
    return 65 + Math.random() * 30;
  }

  private assessTimelineImpact(option: string): number {
    return 20 + Math.random() * 40;
  }

  private estimateStakeholderSatisfaction(option: string): number {
    return 75 + Math.random() * 20;
  }

  private extractProjectInsights(output: any): string[] {
    return [
      'Project timeline is aggressive but achievable',
      'Resource allocation optimized for efficiency',
      'Risk mitigation strategies in place'
    ];
  }
}
