/**
 * Workflow Engine
 * Orchestrates business processes and workflows in the DXP agency simulation
 */

import {
  Workflow,
  WorkflowPhase,
  Task,
  Approval,
  QualityGate,
  WorkflowType,
  RequirementStatus
} from '../models/business-requirements';
import { SimulationEvent, EventType, EventCategory } from '../models/simulation-state';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowEngine {
  private activeWorkflows: Map<string, WorkflowExecution> = new Map();
  private workflowTemplates: Map<WorkflowType, Workflow> = new Map();
  private eventLog: SimulationEvent[] = [];

  constructor() {
    this.initializeWorkflowTemplates();
  }

  private initializeWorkflowTemplates(): void {
    // Client Onboarding Workflow
    this.workflowTemplates.set(WorkflowType.CLIENT_ONBOARDING, {
      id: uuidv4(),
      name: 'Client Onboarding',
      type: WorkflowType.CLIENT_ONBOARDING,
      phases: [
        this.createPhase('Initial Contact', 1, ['Qualify lead', 'Schedule discovery call']),
        this.createPhase('Discovery', 2, ['Understand business needs', 'Assess digital maturity', 'Identify pain points']),
        this.createPhase('Proposal', 3, ['Create solution architecture', 'Estimate effort', 'Prepare proposal']),
        this.createPhase('Contract', 4, ['Negotiate terms', 'Legal review', 'Sign agreement']),
        this.createPhase('Kickoff', 5, ['Team introduction', 'Setup infrastructure', 'Plan first sprint'])
      ],
      triggers: [{ id: uuidv4(), type: 'EVENT' }],
      outcomes: [],
      metrics: this.createDefaultMetrics()
    });

    // Discovery Workflow
    this.workflowTemplates.set(WorkflowType.DISCOVERY, {
      id: uuidv4(),
      name: 'Discovery Process',
      type: WorkflowType.DISCOVERY,
      phases: [
        this.createPhase('Stakeholder Interviews', 1, ['Interview key stakeholders', 'Document requirements', 'Identify constraints']),
        this.createPhase('Technical Assessment', 2, ['Audit current systems', 'Evaluate integrations', 'Security review']),
        this.createPhase('Market Analysis', 3, ['Competitive analysis', 'Industry trends', 'Best practices']),
        this.createPhase('Synthesis', 4, ['Consolidate findings', 'Identify opportunities', 'Define roadmap'])
      ],
      triggers: [{ id: uuidv4(), type: 'MANUAL' }],
      outcomes: [],
      metrics: this.createDefaultMetrics()
    });

    // Sprint Planning Workflow
    this.workflowTemplates.set(WorkflowType.SPRINT_PLANNING, {
      id: uuidv4(),
      name: 'Sprint Planning',
      type: WorkflowType.SPRINT_PLANNING,
      phases: [
        this.createPhase('Backlog Refinement', 1, ['Review user stories', 'Estimate complexity', 'Prioritize items']),
        this.createPhase('Capacity Planning', 2, ['Check team availability', 'Assign resources', 'Identify dependencies']),
        this.createPhase('Sprint Goal', 3, ['Define sprint objectives', 'Select stories', 'Commit to deliverables']),
        this.createPhase('Task Breakdown', 4, ['Break down stories', 'Assign tasks', 'Setup tracking'])
      ],
      triggers: [{ id: uuidv4(), type: 'SCHEDULE', schedule: '0 9 * * 1' }], // Every Monday at 9am
      outcomes: [],
      metrics: this.createDefaultMetrics()
    });
  }

  private createPhase(name: string, sequence: number, taskNames: string[]): WorkflowPhase {
    return {
      id: uuidv4(),
      name,
      sequence,
      tasks: taskNames.map((taskName, index) => this.createTask(taskName, index + 1)),
      approvals: [],
      gates: [],
      duration: 8 * taskNames.length, // 8 hours per task estimate
      automationLevel: 30
    };
  }

  private createTask(name: string, sequence: number): Task {
    return {
      id: uuidv4(),
      name,
      description: `Task: ${name}`,
      status: 'TODO',
      priority: 2,
      estimatedHours: 8,
      dependencies: [],
      skillsRequired: [],
      artifacts: []
    };
  }

  private createDefaultMetrics() {
    return {
      totalExecutions: 0,
      successRate: 0,
      averageDuration: 0,
      bottlenecks: [],
      improvements: []
    };
  }

  public startWorkflow(type: WorkflowType, context: Record<string, any>): string {
    const template = this.workflowTemplates.get(type);
    if (!template) {
      throw new Error(`Workflow template not found for type: ${type}`);
    }

    const executionId = uuidv4();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowType: type,
      status: 'IN_PROGRESS',
      startTime: new Date(),
      currentPhaseIndex: 0,
      context,
      phases: JSON.parse(JSON.stringify(template.phases)), // Deep clone
      results: {}
    };

    this.activeWorkflows.set(executionId, execution);
    this.logEvent(EventType.WORKFLOW_TRIGGER, 'WorkflowEngine', `Started workflow: ${type}`, { executionId });

    return executionId;
  }

  public advanceWorkflow(executionId: string): WorkflowExecutionResult {
    const execution = this.activeWorkflows.get(executionId);
    if (!execution) {
      throw new Error(`Workflow execution not found: ${executionId}`);
    }

    const currentPhase = execution.phases[execution.currentPhaseIndex];

    // Check if current phase is complete
    const phaseComplete = this.isPhaseComplete(currentPhase);

    if (phaseComplete) {
      execution.currentPhaseIndex++;

      if (execution.currentPhaseIndex >= execution.phases.length) {
        // Workflow complete
        execution.status = 'COMPLETED';
        execution.endTime = new Date();
        this.logEvent(EventType.WORKFLOW_TRIGGER, 'WorkflowEngine', `Completed workflow: ${execution.workflowType}`, { executionId });

        return {
          executionId,
          status: 'COMPLETED',
          currentPhase: currentPhase.name,
          progress: 100,
          nextActions: []
        };
      } else {
        // Move to next phase
        const nextPhase = execution.phases[execution.currentPhaseIndex];
        this.logEvent(EventType.WORKFLOW_TRIGGER, 'WorkflowEngine', `Advanced to phase: ${nextPhase.name}`, { executionId });

        return {
          executionId,
          status: 'IN_PROGRESS',
          currentPhase: nextPhase.name,
          progress: (execution.currentPhaseIndex / execution.phases.length) * 100,
          nextActions: nextPhase.tasks.filter(t => t.status === 'TODO').map(t => t.name)
        };
      }
    }

    return {
      executionId,
      status: 'IN_PROGRESS',
      currentPhase: currentPhase.name,
      progress: (execution.currentPhaseIndex / execution.phases.length) * 100,
      nextActions: currentPhase.tasks.filter(t => t.status === 'TODO').map(t => t.name)
    };
  }

  private isPhaseComplete(phase: WorkflowPhase): boolean {
    return phase.tasks.every(task => task.status === 'DONE');
  }

  public completeTask(executionId: string, taskId: string, result: any): void {
    const execution = this.activeWorkflows.get(executionId);
    if (!execution) {
      throw new Error(`Workflow execution not found: ${executionId}`);
    }

    const currentPhase = execution.phases[execution.currentPhaseIndex];
    const task = currentPhase.tasks.find(t => t.id === taskId);

    if (task) {
      task.status = 'DONE';
      task.actualHours = task.estimatedHours * (0.8 + Math.random() * 0.4); // Simulate variance
      execution.results[taskId] = result;

      this.logEvent(EventType.WORKFLOW_TRIGGER, 'WorkflowEngine', `Task completed: ${task.name}`, { executionId, taskId });
    }
  }

  public getActiveWorkflows(): WorkflowExecution[] {
    return Array.from(this.activeWorkflows.values());
  }

  public getWorkflowStatus(executionId: string): WorkflowExecution | undefined {
    return this.activeWorkflows.get(executionId);
  }

  private logEvent(type: EventType, source: string, description: string, data: Record<string, any>): void {
    const event: SimulationEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      category: EventCategory.OPERATIONAL,
      source,
      description,
      impact: {
        scope: 'LOCAL',
        magnitude: 30,
        duration: 1000,
        affectedEntities: [],
        consequences: []
      },
      participants: [],
      data,
      cascadeEvents: []
    };
    this.eventLog.push(event);
  }

  public getEventLog(): SimulationEvent[] {
    return this.eventLog;
  }
}

export interface WorkflowExecution {
  id: string;
  workflowType: WorkflowType;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SUSPENDED';
  startTime: Date;
  endTime?: Date;
  currentPhaseIndex: number;
  context: Record<string, any>;
  phases: WorkflowPhase[];
  results: Record<string, any>;
}

export interface WorkflowExecutionResult {
  executionId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  currentPhase: string;
  progress: number;
  nextActions: string[];
}
