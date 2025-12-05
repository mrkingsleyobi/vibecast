/**
 * Business Requirements and Workflow Models
 * Defines business processes, requirements, and decision-making frameworks
 */

import { ServiceType, ProjectPhase, ClientIndustry } from './dxp-agency';

export interface BusinessRequirement {
  id: string;
  category: RequirementCategory;
  priority: Priority;
  description: string;
  acceptanceCriteria: AcceptanceCriteria[];
  stakeholders: Stakeholder[];
  dependencies: string[];
  estimatedValue: number; // Business value score
  estimatedCost: number;
  roi: number;
  status: RequirementStatus;
}

export enum RequirementCategory {
  FUNCTIONAL = 'FUNCTIONAL',
  NON_FUNCTIONAL = 'NON_FUNCTIONAL',
  TECHNICAL = 'TECHNICAL',
  BUSINESS = 'BUSINESS',
  COMPLIANCE = 'COMPLIANCE',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  USABILITY = 'USABILITY',
  INTEGRATION = 'INTEGRATION',
  DATA = 'DATA'
}

export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum RequirementStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  IN_PROGRESS = 'IN_PROGRESS',
  IMPLEMENTED = 'IMPLEMENTED',
  TESTED = 'TESTED',
  DEPLOYED = 'DEPLOYED',
  REJECTED = 'REJECTED'
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  testable: boolean;
  automatable: boolean;
  status: 'PENDING' | 'PASSED' | 'FAILED';
}

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  influence: number; // 0-100
  interest: number; // 0-100
  communicationPreference: string;
}

export interface Workflow {
  id: string;
  name: string;
  type: WorkflowType;
  phases: WorkflowPhase[];
  triggers: Trigger[];
  outcomes: Outcome[];
  metrics: WorkflowMetrics;
}

export enum WorkflowType {
  CLIENT_ONBOARDING = 'CLIENT_ONBOARDING',
  DISCOVERY = 'DISCOVERY',
  PROPOSAL_CREATION = 'PROPOSAL_CREATION',
  PROJECT_INITIATION = 'PROJECT_INITIATION',
  SPRINT_PLANNING = 'SPRINT_PLANNING',
  CHANGE_MANAGEMENT = 'CHANGE_MANAGEMENT',
  QUALITY_ASSURANCE = 'QUALITY_ASSURANCE',
  DEPLOYMENT = 'DEPLOYMENT',
  INCIDENT_RESPONSE = 'INCIDENT_RESPONSE',
  CLIENT_OFFBOARDING = 'CLIENT_OFFBOARDING'
}

export interface WorkflowPhase {
  id: string;
  name: string;
  sequence: number;
  tasks: Task[];
  approvals: Approval[];
  gates: QualityGate[];
  duration: number; // estimated duration in hours
  automationLevel: number; // 0-100
}

export interface Task {
  id: string;
  name: string;
  description: string;
  assignedTo?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE';
  priority: Priority;
  estimatedHours: number;
  actualHours?: number;
  dependencies: string[];
  skillsRequired: string[];
  artifacts: Artifact[];
}

export interface Approval {
  id: string;
  type: 'TECHNICAL' | 'BUSINESS' | 'BUDGET' | 'COMPLIANCE';
  approver: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONDITIONAL';
  comments: string;
  timestamp?: Date;
}

export interface QualityGate {
  id: string;
  name: string;
  criteria: GateCriteria[];
  mandatory: boolean;
  status: 'OPEN' | 'PASSED' | 'FAILED';
}

export interface GateCriteria {
  id: string;
  metric: string;
  operator: '>' | '<' | '=' | '>=' | '<=';
  threshold: number;
  actualValue?: number;
}

export interface Trigger {
  id: string;
  type: 'EVENT' | 'SCHEDULE' | 'MANUAL' | 'CONDITION';
  condition?: string;
  schedule?: string; // cron expression
}

export interface Outcome {
  id: string;
  type: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'DEFERRED';
  actions: Action[];
  notifications: Notification[];
}

export interface Action {
  id: string;
  type: string;
  parameters: Record<string, any>;
  automated: boolean;
}

export interface Notification {
  id: string;
  recipient: string;
  channel: 'EMAIL' | 'SLACK' | 'SMS' | 'DASHBOARD';
  template: string;
  priority: Priority;
}

export interface Artifact {
  id: string;
  name: string;
  type: string;
  location: string;
  version: string;
  metadata: Record<string, any>;
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  bottlenecks: Bottleneck[];
  improvements: Improvement[];
}

export interface Bottleneck {
  phaseId: string;
  averageDelay: number;
  frequency: number;
  impact: number;
}

export interface Improvement {
  id: string;
  description: string;
  expectedBenefit: string;
  implementationCost: number;
  priority: Priority;
}

export interface DecisionFramework {
  id: string;
  name: string;
  type: 'BUILD_VS_BUY' | 'TECHNOLOGY_SELECTION' | 'VENDOR_SELECTION' | 'ARCHITECTURE_PATTERN';
  criteria: DecisionCriteria[];
  weightedScore: number;
  recommendation: string;
  alternatives: Alternative[];
}

export interface DecisionCriteria {
  id: string;
  name: string;
  weight: number; // 0-1
  description: string;
  measurable: boolean;
}

export interface Alternative {
  id: string;
  name: string;
  scores: Record<string, number>;
  totalScore: number;
  pros: string[];
  cons: string[];
  estimatedCost: number;
  estimatedTime: number;
  risk: number; // 0-100
}

export interface MarketAnalysis {
  industry: ClientIndustry;
  trends: Trend[];
  competitors: Competitor[];
  opportunities: Opportunity[];
  threats: Threat[];
}

export interface Trend {
  id: string;
  name: string;
  category: string;
  impact: number; // 0-100
  velocity: number; // rate of change
  relevance: ServiceType[];
  timeframe: string;
}

export interface Competitor {
  id: string;
  name: string;
  marketShare: number;
  strengths: string[];
  weaknesses: string[];
  services: ServiceType[];
  pricing: string;
}

export interface Opportunity {
  id: string;
  description: string;
  potentialValue: number;
  probability: number; // 0-100
  timeToMarket: number; // months
  requiredInvestment: number;
}

export interface Threat {
  id: string;
  description: string;
  potentialImpact: number;
  probability: number; // 0-100
  mitigation: string;
}
