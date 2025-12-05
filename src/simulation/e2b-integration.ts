/**
 * E2B Integration
 * Provides sandbox execution environment for agent simulations
 */

import { v4 as uuidv4 } from 'uuid';

export interface E2BSandbox {
  id: string;
  agentId: string;
  status: 'INITIALIZING' | 'READY' | 'RUNNING' | 'STOPPED' | 'ERROR';
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface E2BExecutionResult {
  sandboxId: string;
  success: boolean;
  output: any;
  error?: string;
  duration: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
}

/**
 * E2B Integration Manager
 * Manages sandbox environments for agent execution
 */
export class E2BIntegration {
  private apiKey: string;
  private sandboxes: Map<string, E2BSandbox> = new Map();
  private baseUrl: string = 'https://api.e2b.dev/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.E2B_API_KEY || '';
    if (!this.apiKey) {
      console.warn('E2B_API_KEY not provided. Running in simulation mode.');
    }
  }

  /**
   * Create a sandbox for an agent
   */
  public async createSandbox(agentId: string, config?: Record<string, any>): Promise<E2BSandbox> {
    const sandboxId = uuidv4();

    const sandbox: E2BSandbox = {
      id: sandboxId,
      agentId,
      status: 'INITIALIZING',
      createdAt: new Date(),
      metadata: config || {}
    };

    // Simulate E2B sandbox creation
    // In production, this would make actual API calls to E2B
    await this.simulateSandboxCreation(sandbox);

    this.sandboxes.set(sandboxId, sandbox);

    console.log(`Created E2B sandbox ${sandboxId} for agent ${agentId}`);

    return sandbox;
  }

  /**
   * Execute code in a sandbox
   */
  public async execute(
    sandboxId: string,
    code: string,
    context?: Record<string, any>
  ): Promise<E2BExecutionResult> {
    const sandbox = this.sandboxes.get(sandboxId);

    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    if (sandbox.status !== 'READY' && sandbox.status !== 'RUNNING') {
      throw new Error(`Sandbox ${sandboxId} is not ready. Status: ${sandbox.status}`);
    }

    const startTime = Date.now();
    sandbox.status = 'RUNNING';

    try {
      // Simulate code execution
      // In production, this would make actual API calls to E2B
      const result = await this.simulateExecution(code, context);

      const duration = Date.now() - startTime;

      sandbox.status = 'READY';

      return {
        sandboxId,
        success: true,
        output: result,
        duration,
        resourceUsage: {
          cpu: 20 + Math.random() * 30,
          memory: 50 + Math.random() * 30,
          network: 10 + Math.random() * 20
        }
      };
    } catch (error) {
      sandbox.status = 'ERROR';

      return {
        sandboxId,
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        resourceUsage: {
          cpu: 0,
          memory: 0,
          network: 0
        }
      };
    }
  }

  /**
   * Execute agent task in isolated sandbox
   */
  public async executeAgentTask(
    agentId: string,
    taskCode: string,
    parameters: Record<string, any>
  ): Promise<E2BExecutionResult> {
    // Get or create sandbox for agent
    let sandbox = Array.from(this.sandboxes.values()).find(s => s.agentId === agentId);

    if (!sandbox) {
      sandbox = await this.createSandbox(agentId);
    }

    // Execute task in sandbox
    return await this.execute(sandbox.id, taskCode, parameters);
  }

  /**
   * Stop a sandbox
   */
  public async stopSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);

    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    sandbox.status = 'STOPPED';
    console.log(`Stopped sandbox ${sandboxId}`);
  }

  /**
   * Stop all sandboxes
   */
  public async stopAllSandboxes(): Promise<void> {
    const stopPromises = Array.from(this.sandboxes.keys()).map(id => this.stopSandbox(id));
    await Promise.all(stopPromises);
    console.log(`Stopped all ${stopPromises.length} sandboxes`);
  }

  /**
   * Get sandbox status
   */
  public getSandboxStatus(sandboxId: string): E2BSandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Get all sandboxes
   */
  public getAllSandboxes(): E2BSandbox[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Clean up stopped sandboxes
   */
  public async cleanup(): Promise<void> {
    const stoppedSandboxes = Array.from(this.sandboxes.entries())
      .filter(([_, sandbox]) => sandbox.status === 'STOPPED')
      .map(([id]) => id);

    stoppedSandboxes.forEach(id => {
      this.sandboxes.delete(id);
    });

    console.log(`Cleaned up ${stoppedSandboxes.length} stopped sandboxes`);
  }

  /**
   * Get resource usage statistics
   */
  public getResourceStats(): {
    totalSandboxes: number;
    activeSandboxes: number;
    avgResourceUsage: { cpu: number; memory: number; network: number };
  } {
    const total = this.sandboxes.size;
    const active = Array.from(this.sandboxes.values()).filter(
      s => s.status === 'RUNNING' || s.status === 'READY'
    ).length;

    return {
      totalSandboxes: total,
      activeSandboxes: active,
      avgResourceUsage: {
        cpu: 25 + Math.random() * 20,
        memory: 60 + Math.random() * 20,
        network: 15 + Math.random() * 15
      }
    };
  }

  // Simulation methods (replace with actual E2B API calls in production)

  private async simulateSandboxCreation(sandbox: E2BSandbox): Promise<void> {
    // Simulate async sandbox initialization
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    sandbox.status = 'READY';
  }

  private async simulateExecution(
    code: string,
    context?: Record<string, any>
  ): Promise<any> {
    // Simulate async code execution
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));

    // Return simulated result
    return {
      executedAt: new Date(),
      context,
      result: `Executed: ${code.substring(0, 50)}...`,
      status: 'SUCCESS'
    };
  }
}

/**
 * E2B Sandbox Pool
 * Manages a pool of reusable sandboxes for better performance
 */
export class E2BSandboxPool {
  private integration: E2BIntegration;
  private pool: E2BSandbox[] = [];
  private poolSize: number;
  private inUse: Set<string> = new Set();

  constructor(apiKey?: string, poolSize: number = 5) {
    this.integration = new E2BIntegration(apiKey);
    this.poolSize = poolSize;
  }

  /**
   * Initialize the sandbox pool
   */
  public async initialize(): Promise<void> {
    console.log(`Initializing E2B sandbox pool with ${this.poolSize} sandboxes...`);

    const promises = Array.from({ length: this.poolSize }, (_, i) =>
      this.integration.createSandbox(`pool-agent-${i}`)
    );

    this.pool = await Promise.all(promises);
    console.log(`E2B sandbox pool initialized with ${this.pool.length} sandboxes`);
  }

  /**
   * Acquire a sandbox from the pool
   */
  public async acquire(agentId: string): Promise<E2BSandbox> {
    // Find an available sandbox
    const available = this.pool.find(s => !this.inUse.has(s.id) && s.status === 'READY');

    if (available) {
      this.inUse.add(available.id);
      available.agentId = agentId;
      return available;
    }

    // If no sandbox available, create a new one
    const sandbox = await this.integration.createSandbox(agentId);
    this.pool.push(sandbox);
    this.inUse.add(sandbox.id);

    return sandbox;
  }

  /**
   * Release a sandbox back to the pool
   */
  public release(sandboxId: string): void {
    this.inUse.delete(sandboxId);
  }

  /**
   * Execute task using pool
   */
  public async executeTask(
    agentId: string,
    code: string,
    context?: Record<string, any>
  ): Promise<E2BExecutionResult> {
    const sandbox = await this.acquire(agentId);

    try {
      const result = await this.integration.execute(sandbox.id, code, context);
      return result;
    } finally {
      this.release(sandbox.id);
    }
  }

  /**
   * Get pool statistics
   */
  public getPoolStats(): {
    totalSandboxes: number;
    available: number;
    inUse: number;
  } {
    return {
      totalSandboxes: this.pool.length,
      available: this.pool.length - this.inUse.size,
      inUse: this.inUse.size
    };
  }

  /**
   * Shutdown the pool
   */
  public async shutdown(): Promise<void> {
    await this.integration.stopAllSandboxes();
    this.pool = [];
    this.inUse.clear();
    console.log('E2B sandbox pool shut down');
  }
}
