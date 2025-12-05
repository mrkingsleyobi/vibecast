/**
 * DXP Agency System Models
 * Defines the core entities and structures for a next-generation Digital Experience Platform agency
 */

export enum ServiceType {
  CONTENT_MANAGEMENT = 'CONTENT_MANAGEMENT',
  PERSONALIZATION = 'PERSONALIZATION',
  COMMERCE = 'COMMERCE',
  ANALYTICS = 'ANALYTICS',
  MARKETING_AUTOMATION = 'MARKETING_AUTOMATION',
  CUSTOMER_DATA_PLATFORM = 'CUSTOMER_DATA_PLATFORM',
  AI_ORCHESTRATION = 'AI_ORCHESTRATION',
  OMNICHANNEL_DELIVERY = 'OMNICHANNEL_DELIVERY',
  API_GATEWAY = 'API_GATEWAY',
  EDGE_COMPUTING = 'EDGE_COMPUTING'
}

export enum ProjectPhase {
  DISCOVERY = 'DISCOVERY',
  STRATEGY = 'STRATEGY',
  DESIGN = 'DESIGN',
  DEVELOPMENT = 'DEVELOPMENT',
  INTEGRATION = 'INTEGRATION',
  TESTING = 'TESTING',
  DEPLOYMENT = 'DEPLOYMENT',
  OPTIMIZATION = 'OPTIMIZATION',
  MAINTENANCE = 'MAINTENANCE'
}

export enum ClientIndustry {
  RETAIL = 'RETAIL',
  FINANCE = 'FINANCE',
  HEALTHCARE = 'HEALTHCARE',
  TECHNOLOGY = 'TECHNOLOGY',
  MANUFACTURING = 'MANUFACTURING',
  MEDIA_ENTERTAINMENT = 'MEDIA_ENTERTAINMENT',
  EDUCATION = 'EDUCATION',
  HOSPITALITY = 'HOSPITALITY',
  AUTOMOTIVE = 'AUTOMOTIVE',
  GOVERNMENT = 'GOVERNMENT'
}

export interface Client {
  id: string;
  name: string;
  industry: ClientIndustry;
  size: 'STARTUP' | 'SMB' | 'ENTERPRISE' | 'GLOBAL';
  digitalMaturity: number; // 0-100
  budget: number;
  strategicPriorities: string[];
  technicalRequirements: TechnicalRequirement[];
  currentStack: Technology[];
}

export interface TechnicalRequirement {
  category: ServiceType;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  complexity: number; // 0-100
  dependencies: string[];
  estimatedEffort: number; // in hours
  complianceNeeds: string[];
}

export interface Technology {
  name: string;
  category: ServiceType;
  version: string;
  customizations: string[];
  integrations: string[];
  performance: {
    uptime: number;
    responseTime: number;
    throughput: number;
  };
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  phase: ProjectPhase;
  services: ServiceType[];
  timeline: {
    start: Date;
    plannedEnd: Date;
    actualEnd?: Date;
  };
  budget: {
    allocated: number;
    spent: number;
    forecast: number;
  };
  team: TeamMember[];
  milestones: Milestone[];
  risks: Risk[];
  kpis: KPI[];
  architecture: DXPArchitecture;
}

export interface TeamMember {
  id: string;
  role: 'ARCHITECT' | 'DEVELOPER' | 'DESIGNER' | 'STRATEGIST' | 'PM' | 'QA' | 'DEVOPS';
  expertise: ServiceType[];
  utilization: number; // 0-100
  certifications: string[];
  performanceScore: number; // 0-100
}

export interface Milestone {
  id: string;
  name: string;
  phase: ProjectPhase;
  plannedDate: Date;
  actualDate?: Date;
  deliverables: Deliverable[];
  dependencies: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'DELAYED';
}

export interface Deliverable {
  id: string;
  name: string;
  type: 'DOCUMENT' | 'PROTOTYPE' | 'CODE' | 'INTEGRATION' | 'DEPLOYMENT';
  quality: number; // 0-100
  completeness: number; // 0-100
  reviewStatus: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
}

export interface Risk {
  id: string;
  category: 'TECHNICAL' | 'RESOURCE' | 'BUDGET' | 'TIMELINE' | 'COMPLIANCE' | 'VENDOR';
  description: string;
  probability: number; // 0-100
  impact: number; // 0-100
  mitigation: string;
  status: 'IDENTIFIED' | 'MONITORING' | 'MITIGATING' | 'RESOLVED' | 'REALIZED';
}

export interface KPI {
  id: string;
  name: string;
  category: 'PERFORMANCE' | 'BUSINESS' | 'TECHNICAL' | 'USER_EXPERIENCE';
  target: number;
  current: number;
  unit: string;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface DXPArchitecture {
  platforms: Platform[];
  integrations: Integration[];
  dataFlow: DataFlow[];
  security: SecurityLayer;
  scalability: ScalabilityConfig;
  observability: ObservabilityConfig;
}

export interface Platform {
  id: string;
  name: string;
  vendor: string;
  serviceType: ServiceType;
  deployment: 'SAAS' | 'PAAS' | 'ON_PREMISE' | 'HYBRID';
  cost: number;
  sla: {
    uptime: number;
    support: string;
  };
}

export interface Integration {
  id: string;
  sourcePlatform: string;
  targetPlatform: string;
  type: 'API' | 'WEBHOOK' | 'ETL' | 'STREAMING' | 'FILE_TRANSFER';
  protocol: string;
  dataVolume: number; // GB per day
  latency: number; // ms
  reliability: number; // 0-100
}

export interface DataFlow {
  id: string;
  source: string;
  destination: string;
  dataType: string;
  volume: number;
  frequency: string;
  transformations: string[];
}

export interface SecurityLayer {
  authentication: string[];
  authorization: string[];
  encryption: {
    atRest: boolean;
    inTransit: boolean;
    algorithm: string;
  };
  compliance: string[];
  auditLog: boolean;
  threatDetection: boolean;
}

export interface ScalabilityConfig {
  autoScaling: boolean;
  maxInstances: number;
  loadBalancing: string;
  caching: {
    enabled: boolean;
    strategy: string;
    ttl: number;
  };
  cdn: {
    enabled: boolean;
    provider: string;
  };
}

export interface ObservabilityConfig {
  logging: {
    enabled: boolean;
    level: string;
    retention: number;
  };
  monitoring: {
    enabled: boolean;
    metrics: string[];
    alerting: boolean;
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
  };
}

export interface AgencyMetrics {
  utilization: number;
  revenue: number;
  profitMargin: number;
  clientSatisfaction: number;
  employeeSatisfaction: number;
  projectSuccessRate: number;
  averageProjectDuration: number;
  portfolioValue: number;
}
