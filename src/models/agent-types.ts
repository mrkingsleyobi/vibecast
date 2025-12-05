/**
 * Agent Types and Capabilities
 * Defines the different agent types in the federated simulation system
 */

import { ServiceType, ProjectPhase } from './dxp-agency';
import { RequirementCategory, WorkflowType } from './business-requirements';

export enum AgentRole {
  BUSINESS_STRATEGIST = 'BUSINESS_STRATEGIST',
  TECHNICAL_ARCHITECT = 'TECHNICAL_ARCHITECT',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  CLIENT_ADVISOR = 'CLIENT_ADVISOR',
  OPERATIONS_MANAGER = 'OPERATIONS_MANAGER'
}

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  capabilities: Capability[];
  knowledgeDomains: KnowledgeDomain[];
  decisionMakingStyle: DecisionMakingStyle;
  performanceMetrics: AgentPerformanceMetrics;
  state: AgentState;
  memory: AgentMemory;
  communicationLog: CommunicationEvent[];
}

export interface Capability {
  id: string;
  name: string;
  category: string;
  proficiency: number; // 0-100
  experience: number; // years or iterations
  successRate: number; // 0-100
  costEfficiency: number; // 0-100
}

export interface KnowledgeDomain {
  area: ServiceType | RequirementCategory | ProjectPhase | WorkflowType;
  depth: number; // 0-100
  breadth: number; // 0-100
  recentExperience: number; // 0-100
  certifications: string[];
}

export enum DecisionMakingStyle {
  ANALYTICAL = 'ANALYTICAL',
  INTUITIVE = 'INTUITIVE',
  COLLABORATIVE = 'COLLABORATIVE',
  DIRECTIVE = 'DIRECTIVE',
  CONSENSUS = 'CONSENSUS'
}

export interface AgentPerformanceMetrics {
  tasksCompleted: number;
  successRate: number; // 0-100
  averageResponseTime: number; // ms
  qualityScore: number; // 0-100
  collaborationScore: number; // 0-100
  innovationIndex: number; // 0-100
  resourceUtilization: number; // 0-100
  clientSatisfaction: number; // 0-100
}

export interface AgentState {
  status: 'IDLE' | 'ACTIVE' | 'BUSY' | 'BLOCKED' | 'OFFLINE';
  currentTask?: string;
  currentProject?: string;
  workload: number; // 0-100
  availability: number; // 0-100
  mood: 'POSITIVE' | 'NEUTRAL' | 'STRESSED' | 'CHALLENGED';
  energyLevel: number; // 0-100
}

export interface AgentMemory {
  shortTerm: MemoryItem[];
  longTerm: MemoryItem[];
  episodic: Episode[];
  semantic: SemanticKnowledge[];
  procedural: Procedure[];
}

export interface MemoryItem {
  id: string;
  timestamp: Date;
  content: any;
  importance: number; // 0-100
  category: string;
  retrievalCount: number;
  lastAccessed: Date;
}

export interface Episode {
  id: string;
  timestamp: Date;
  event: string;
  participants: string[];
  outcome: string;
  lessonsLearned: string[];
  emotionalValence: number; // -100 to 100
}

export interface SemanticKnowledge {
  id: string;
  concept: string;
  definition: string;
  relationships: Relationship[];
  confidence: number; // 0-100
  source: string;
}

export interface Relationship {
  type: 'IS_A' | 'HAS_A' | 'PART_OF' | 'REQUIRES' | 'ENABLES' | 'CONFLICTS_WITH';
  target: string;
  strength: number; // 0-100
}

export interface Procedure {
  id: string;
  name: string;
  steps: ProcedureStep[];
  successRate: number; // 0-100
  efficiency: number; // 0-100
  applicability: string[];
}

export interface ProcedureStep {
  sequence: number;
  action: string;
  inputs: string[];
  outputs: string[];
  conditions?: string[];
  alternatives?: string[];
}

export interface CommunicationEvent {
  id: string;
  timestamp: Date;
  from: string;
  to: string[];
  type: CommunicationType;
  content: string;
  context: Record<string, any>;
  response?: string;
  sentiment: number; // -100 to 100
  effectiveness: number; // 0-100
}

export enum CommunicationType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
  QUERY = 'QUERY',
  RECOMMENDATION = 'RECOMMENDATION',
  DECISION = 'DECISION',
  UPDATE = 'UPDATE',
  ALERT = 'ALERT',
  COLLABORATION = 'COLLABORATION'
}

export interface AgentInteraction {
  id: string;
  timestamp: Date;
  participants: string[];
  purpose: string;
  type: InteractionType;
  outcome: InteractionOutcome;
  duration: number; // ms
  efficiency: number; // 0-100
  satisfaction: number; // 0-100
}

export enum InteractionType {
  NEGOTIATION = 'NEGOTIATION',
  COLLABORATION = 'COLLABORATION',
  CONSULTATION = 'CONSULTATION',
  COORDINATION = 'COORDINATION',
  CONFLICT_RESOLUTION = 'CONFLICT_RESOLUTION',
  KNOWLEDGE_SHARING = 'KNOWLEDGE_SHARING',
  DECISION_MAKING = 'DECISION_MAKING'
}

export interface InteractionOutcome {
  success: boolean;
  decisions: Decision[];
  actions: string[];
  agreements: Agreement[];
  conflicts: Conflict[];
  insights: Insight[];
}

export interface Decision {
  id: string;
  timestamp: Date;
  maker: string;
  type: string;
  options: string[];
  selected: string;
  rationale: string;
  confidence: number; // 0-100
  impact: number; // 0-100
  reversible: boolean;
}

export interface Agreement {
  id: string;
  parties: string[];
  terms: string[];
  constraints: string[];
  validity: {
    start: Date;
    end?: Date;
  };
  status: 'ACTIVE' | 'FULFILLED' | 'BREACHED' | 'EXPIRED';
}

export interface Conflict {
  id: string;
  parties: string[];
  issue: string;
  positions: Record<string, string>;
  severity: number; // 0-100
  resolved: boolean;
  resolution?: string;
}

export interface Insight {
  id: string;
  source: string;
  category: string;
  description: string;
  confidence: number; // 0-100
  applicability: string[];
  validated: boolean;
}

export interface AgentLearning {
  id: string;
  timestamp: Date;
  trigger: string;
  observation: string;
  hypothesis: string;
  experiment?: string;
  result?: string;
  conclusion: string;
  integration: boolean; // integrated into knowledge base
}

export interface AgentGoal {
  id: string;
  description: string;
  priority: number; // 0-100
  deadline?: Date;
  progress: number; // 0-100
  subgoals: string[];
  obstacles: string[];
  strategies: Strategy[];
}

export interface Strategy {
  id: string;
  name: string;
  steps: string[];
  expectedOutcome: string;
  successProbability: number; // 0-100
  resourceRequirements: Record<string, number>;
  risks: string[];
}

export interface FederatedNetwork {
  agents: Agent[];
  connections: Connection[];
  sharedKnowledge: SharedKnowledge;
  consensusMechanism: ConsensusMechanism;
  governanceRules: GovernanceRule[];
  networkMetrics: NetworkMetrics;
}

export interface Connection {
  fromAgent: string;
  toAgent: string;
  strength: number; // 0-100
  trust: number; // 0-100
  communicationFrequency: number;
  collaborationHistory: string[];
}

export interface SharedKnowledge {
  id: string;
  type: 'FACT' | 'PATTERN' | 'BEST_PRACTICE' | 'LESSON_LEARNED' | 'INNOVATION';
  content: any;
  contributors: string[];
  confidence: number; // 0-100
  validation: number; // 0-100
  applications: string[];
}

export interface ConsensusMechanism {
  type: 'MAJORITY' | 'WEIGHTED' | 'UNANIMOUS' | 'QUORUM' | 'REPUTATION_BASED';
  threshold: number; // 0-100
  votingRights: Record<string, number>;
  tieBreaker: string;
}

export interface GovernanceRule {
  id: string;
  name: string;
  description: string;
  scope: string[];
  enforcement: 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
  violations: Violation[];
}

export interface Violation {
  id: string;
  rule: string;
  violator: string;
  timestamp: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  remediation: string;
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
}

export interface NetworkMetrics {
  totalAgents: number;
  activeAgents: number;
  averageConnectivity: number; // 0-100
  averageTrust: number; // 0-100
  knowledgeGrowth: number;
  collaborationIndex: number; // 0-100
  decisionQuality: number; // 0-100
  innovationRate: number;
}
