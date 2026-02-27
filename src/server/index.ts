/**
 * Driftbase Server — Entry Point
 * Wires together all bounded contexts into a single-process engine
 * per ADR-001: Single-Process Architecture
 */
import { EventBus, BoundedContext, DomainEvent, createEvent } from '../common/events.js';
import { generateId, UUID } from '../common/types.js';

// ─── Server Configuration ───────────────────────────────────

export interface ServerConfig {
  nodeId: number;
  port: number;
  maxConnections: number;
  walDir: string;
  dataDir: string;
  raftPeers: string[];
  enableLearning: boolean;
  enableWireProtocol: boolean;
  jwtSecret: string;
}

export const DEFAULT_CONFIG: ServerConfig = {
  nodeId: 1,
  port: 5433,
  maxConnections: 1000,
  walDir: './data/wal',
  dataDir: './data/storage',
  raftPeers: [],
  enableLearning: true,
  enableWireProtocol: true,
  jwtSecret: 'driftbase-dev-secret',
};

// ─── Health Status ──────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  contexts: Record<string, ContextHealth>;
  metrics: ServerMetrics;
}

export interface ContextHealth {
  name: string;
  status: 'up' | 'degraded' | 'down';
  lastEventAt?: number;
  eventCount: number;
}

export interface ServerMetrics {
  totalEvents: number;
  eventsPerSecond: number;
  activeConnections: number;
  activeSubscriptions: number;
  raftState: string;
  vectorIndices: number;
  tablesCount: number;
}

// ─── Server Instance ────────────────────────────────────────

export class DriftbaseServer {
  private config: ServerConfig;
  private eventBus: EventBus;
  private startTime: number;
  private contextHealth: Map<string, ContextHealth>;
  private eventCounts: Map<string, number>;
  private running: boolean;
  private eventWindow: number[];

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = new EventBus();
    this.startTime = Date.now();
    this.contextHealth = new Map();
    this.eventCounts = new Map();
    this.running = false;
    this.eventWindow = [];

    this.initializeContextHealth();
    this.setupEventMonitoring();
  }

  private initializeContextHealth(): void {
    for (const ctx of Object.values(BoundedContext)) {
      this.contextHealth.set(ctx, {
        name: ctx,
        status: 'up',
        eventCount: 0,
      });
    }
  }

  private setupEventMonitoring(): void {
    this.eventBus.onAll((event: DomainEvent) => {
      const ctx = this.contextHealth.get(event.context);
      if (ctx) {
        ctx.lastEventAt = Date.now();
        ctx.eventCount++;
      }
      this.eventWindow.push(Date.now());
      // Keep only last 60 seconds of events for rate calculation
      const cutoff = Date.now() - 60000;
      this.eventWindow = this.eventWindow.filter(t => t > cutoff);
    });
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    await this.eventBus.emit(createEvent(
      'ServerStarted',
      BoundedContext.Storage,
      { nodeId: this.config.nodeId, port: this.config.port },
    ));
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    await this.eventBus.emit(createEvent(
      'ServerStopping',
      BoundedContext.Storage,
      { nodeId: this.config.nodeId },
    ));

    this.running = false;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getConfig(): Readonly<ServerConfig> {
    return this.config;
  }

  isRunning(): boolean {
    return this.running;
  }

  getHealth(): HealthStatus {
    const contexts: Record<string, ContextHealth> = {};
    for (const [name, health] of this.contextHealth) {
      contexts[name] = { ...health };
    }

    const uptime = Date.now() - this.startTime;
    const hasDown = [...this.contextHealth.values()].some(c => c.status === 'down');
    const hasDegraded = [...this.contextHealth.values()].some(c => c.status === 'degraded');

    return {
      status: hasDown ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
      uptime,
      contexts,
      metrics: {
        totalEvents: this.eventBus.getLog().length,
        eventsPerSecond: this.eventWindow.length / 60,
        activeConnections: 0,
        activeSubscriptions: 0,
        raftState: 'follower',
        vectorIndices: 0,
        tablesCount: 0,
      },
    };
  }

  setContextStatus(context: BoundedContext, status: 'up' | 'degraded' | 'down'): void {
    const health = this.contextHealth.get(context);
    if (health) {
      health.status = status;
    }
  }
}

// ─── Factory ────────────────────────────────────────────────

export function createServer(config?: Partial<ServerConfig>): DriftbaseServer {
  return new DriftbaseServer(config);
}
