/**
 * Simulation State Management
 * Defines the state and evolution of the DXP agency simulation
 */

import { Client, Project, AgencyMetrics } from './dxp-agency';
import { Agent, FederatedNetwork, AgentInteraction } from './agent-types';
import { Workflow, BusinessRequirement } from './business-requirements';

export interface SimulationState {
  id: string;
  startTime: Date;
  currentTime: Date;
  iteration: number;
  environment: SimulationEnvironment;
  agency: AgencyState;
  network: FederatedNetwork;
  events: SimulationEvent[];
  metrics: SimulationMetrics;
  config: SimulationConfig;
}

export interface SimulationEnvironment {
  marketConditions: MarketConditions;
  economicFactors: EconomicFactors;
  technologyLandscape: TechnologyLandscape;
  competitiveDynamics: CompetitiveDynamics;
  regulatoryEnvironment: RegulatoryEnvironment;
}

export interface MarketConditions {
  demand: number; // 0-100
  supply: number; // 0-100
  growth: number; // percentage
  volatility: number; // 0-100
  seasonality: Record<string, number>;
  emergingNeeds: string[];
}

export interface EconomicFactors {
  gdpGrowth: number;
  inflation: number;
  interestRates: number;
  unemploymentRate: number;
  consumerConfidence: number; // 0-100
  businessInvestment: number; // 0-100
  digitalSpending: number; // billions
}

export interface TechnologyLandscape {
  emergingTechnologies: EmergingTechnology[];
  platformEvolution: PlatformEvolution[];
  standardsAdoption: StandardAdoption[];
  innovationClusters: InnovationCluster[];
}

export interface EmergingTechnology {
  name: string;
  category: string;
  maturity: number; // 0-100
  adoptionRate: number; // 0-100
  disruptivePotential: number; // 0-100
  timeToMainstream: number; // years
  requiredInvestment: number;
}

export interface PlatformEvolution {
  platform: string;
  version: string;
  features: string[];
  deprecations: string[];
  migrationComplexity: number; // 0-100
  communitySupport: number; // 0-100
}

export interface StandardAdoption {
  standard: string;
  domain: string;
  adoptionLevel: number; // 0-100
  benefits: string[];
  challenges: string[];
  compliance: boolean;
}

export interface InnovationCluster {
  name: string;
  technologies: string[];
  synergies: number; // 0-100
  marketPotential: number;
  timeframe: string;
}

export interface CompetitiveDynamics {
  competitors: CompetitorInfo[];
  marketShare: Record<string, number>;
  differentiators: string[];
  threats: CompetitiveThreat[];
  opportunities: CompetitiveOpportunity[];
}

export interface CompetitorInfo {
  id: string;
  name: string;
  marketPosition: number; // 1-N ranking
  strengths: string[];
  weaknesses: string[];
  recentMoves: string[];
  aggressiveness: number; // 0-100
}

export interface CompetitiveThreat {
  source: string;
  type: 'NEW_ENTRANT' | 'PRICE_WAR' | 'TECHNOLOGY_SHIFT' | 'TALENT_DRAIN' | 'CLIENT_LOSS';
  severity: number; // 0-100
  timeframe: string;
  mitigation: string;
}

export interface CompetitiveOpportunity {
  type: 'MARKET_GAP' | 'PARTNERSHIP' | 'ACQUISITION' | 'DIFFERENTIATION' | 'EXPANSION';
  potential: number; // 0-100
  requirements: string[];
  risks: string[];
  timeframe: string;
}

export interface RegulatoryEnvironment {
  regulations: Regulation[];
  compliance: ComplianceStatus[];
  upcomingChanges: RegulatoryChange[];
  penalties: Penalty[];
}

export interface Regulation {
  id: string;
  name: string;
  jurisdiction: string;
  applicability: string[];
  requirements: string[];
  effectiveDate: Date;
  complexity: number; // 0-100
}

export interface ComplianceStatus {
  regulation: string;
  status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'EXEMPT';
  gaps: string[];
  remediation: string[];
  auditDate?: Date;
}

export interface RegulatoryChange {
  regulation: string;
  changeType: 'NEW' | 'AMENDMENT' | 'REPEAL' | 'INTERPRETATION';
  effectiveDate: Date;
  impact: number; // 0-100
  preparedness: number; // 0-100
}

export interface Penalty {
  regulation: string;
  violation: string;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  amount: number;
  remediation: string;
  timestamp: Date;
}

export interface AgencyState {
  clients: Client[];
  projects: Project[];
  activeWorkflows: Workflow[];
  requirements: BusinessRequirement[];
  resources: Resource[];
  capabilities: AgencyCapability[];
  financials: Financials;
  reputation: Reputation;
  portfolio: Portfolio;
}

export interface Resource {
  id: string;
  type: 'HUMAN' | 'TECHNICAL' | 'FINANCIAL' | 'INTELLECTUAL';
  name: string;
  availability: number; // 0-100
  cost: number;
  efficiency: number; // 0-100
  allocation: Record<string, number>; // project -> percentage
}

export interface AgencyCapability {
  name: string;
  level: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | 'THOUGHT_LEADER';
  maturity: number; // 0-100
  demandLevel: number; // 0-100
  competitiveness: number; // 0-100
  investmentNeeded: number;
}

export interface Financials {
  revenue: number;
  costs: number;
  profit: number;
  cashFlow: number;
  runway: number; // months
  growthRate: number;
  profitMargin: number;
  revenueStreams: RevenueStream[];
  costStructure: CostCategory[];
}

export interface RevenueStream {
  source: string;
  type: 'RECURRING' | 'PROJECT' | 'RETAINER' | 'LICENSE' | 'COMMISSION';
  amount: number;
  growth: number;
  stability: number; // 0-100
}

export interface CostCategory {
  category: 'PERSONNEL' | 'INFRASTRUCTURE' | 'MARKETING' | 'R&D' | 'OPERATIONS' | 'OVERHEAD';
  amount: number;
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  optimization: number; // 0-100
}

export interface Reputation {
  overall: number; // 0-100
  byIndustry: Record<string, number>;
  byService: Record<string, number>;
  brandRecognition: number; // 0-100
  thoughtLeadership: number; // 0-100
  caseStudies: CaseStudy[];
  testimonials: Testimonial[];
  awards: Award[];
}

export interface CaseStudy {
  id: string;
  client: string;
  challenge: string;
  solution: string;
  results: Record<string, number>;
  technologies: string[];
  impact: number; // 0-100
  publishDate: Date;
}

export interface Testimonial {
  id: string;
  client: string;
  content: string;
  rating: number; // 0-5
  verified: boolean;
  date: Date;
}

export interface Award {
  id: string;
  name: string;
  category: string;
  year: number;
  prestige: number; // 0-100
}

export interface Portfolio {
  totalProjects: number;
  successfulProjects: number;
  totalValue: number;
  industries: string[];
  technologies: string[];
  showcaseProjects: string[];
  innovationIndex: number; // 0-100
}

export interface SimulationEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  category: EventCategory;
  source: string;
  description: string;
  impact: EventImpact;
  participants: string[];
  data: Record<string, any>;
  cascadeEvents: string[];
}

export enum EventType {
  CLIENT_INQUIRY = 'CLIENT_INQUIRY',
  PROJECT_START = 'PROJECT_START',
  PROJECT_MILESTONE = 'PROJECT_MILESTONE',
  PROJECT_COMPLETE = 'PROJECT_COMPLETE',
  AGENT_DECISION = 'AGENT_DECISION',
  AGENT_INTERACTION = 'AGENT_INTERACTION',
  WORKFLOW_TRIGGER = 'WORKFLOW_TRIGGER',
  REQUIREMENT_CHANGE = 'REQUIREMENT_CHANGE',
  RISK_IDENTIFIED = 'RISK_IDENTIFIED',
  MARKET_SHIFT = 'MARKET_SHIFT',
  TECHNOLOGY_ADOPTION = 'TECHNOLOGY_ADOPTION',
  REGULATORY_CHANGE = 'REGULATORY_CHANGE',
  COMPETITIVE_MOVE = 'COMPETITIVE_MOVE',
  FINANCIAL_EVENT = 'FINANCIAL_EVENT',
  RESOURCE_CHANGE = 'RESOURCE_CHANGE',
  LEARNING_EVENT = 'LEARNING_EVENT'
}

export enum EventCategory {
  OPERATIONAL = 'OPERATIONAL',
  STRATEGIC = 'STRATEGIC',
  TACTICAL = 'TACTICAL',
  EXTERNAL = 'EXTERNAL',
  INTERNAL = 'INTERNAL'
}

export interface EventImpact {
  scope: 'LOCAL' | 'PROJECT' | 'AGENCY' | 'NETWORK' | 'MARKET';
  magnitude: number; // 0-100
  duration: number; // ms
  affectedEntities: string[];
  consequences: Consequence[];
}

export interface Consequence {
  type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  aspect: string;
  value: number;
  probability: number; // 0-100
}

export interface SimulationMetrics {
  performance: PerformanceMetrics;
  business: BusinessMetrics;
  agent: AgentMetrics;
  network: NetworkHealthMetrics;
  quality: QualityMetrics;
}

export interface PerformanceMetrics {
  throughput: number;
  latency: number;
  errorRate: number;
  utilizationRate: number;
  efficiency: number;
}

export interface BusinessMetrics {
  revenue: number;
  growth: number;
  profitMargin: number;
  clientSatisfaction: number;
  marketShare: number;
  innovation: number;
}

export interface AgentMetrics {
  totalDecisions: number;
  decisionQuality: number;
  collaborationLevel: number;
  learningRate: number;
  adaptability: number;
}

export interface NetworkHealthMetrics {
  connectivity: number;
  trust: number;
  knowledgeFlow: number;
  consensusEfficiency: number;
  resilience: number;
}

export interface QualityMetrics {
  deliverableQuality: number;
  processAdherence: number;
  defectRate: number;
  customerSatisfaction: number;
  continuousImprovement: number;
}

export interface SimulationConfig {
  duration: number; // ms
  tickInterval: number; // ms
  agentCount: number;
  initialClients: number;
  marketDynamics: boolean;
  enableLearning: boolean;
  enableAdaptation: boolean;
  randomSeed?: number;
  scenarios: Scenario[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  triggers: ScenarioTrigger[];
  parameters: Record<string, any>;
  expectedOutcomes: string[];
}

export interface ScenarioTrigger {
  condition: string;
  timestamp?: Date;
  probability?: number;
  actions: string[];
}
