/**
 * VibeCast Runtime Bounded Context — WASM Module Sandbox
 * Implements ADR-004: Module lifecycle, reducer execution, resource enforcement.
 * Simulates a sandboxed WASM runtime with fuel metering and resource limits.
 */
import { UUID, generateId, Result, ok, err } from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';

// ─── Constants ──────────────────────────────────────────────
export const DEFAULT_MAX_MEMORY_BYTES = 256 * 1024 * 1024; // 256 MB
export const DEFAULT_MAX_CPU_MS = 10_000;                   // 10 seconds
export const DEFAULT_MAX_HOST_CALLS = 1_000;
export const DEFAULT_FUEL_BUDGET = 1_000_000;

// ─── Types & Interfaces ────────────────────────────────────
export enum ModuleStatus {
  Registered = 'registered',
  Compiled   = 'compiled',
  Active     = 'active',
  Suspended  = 'suspended',
  Revoked    = 'revoked',
}

export interface ResourceLimits {
  maxMemoryBytes: number;
  maxCpuMs: number;
  maxHostCalls: number;
  fuelBudget: number;
}

export interface ReducerDefinition { name: string; handler: ReducerHandler }

export type ReducerHandler = (ctx: ReducerContext, ...args: unknown[]) => unknown | Promise<unknown>;
export type HostFunction = (...args: unknown[]) => unknown | Promise<unknown>;

export interface ReducerContext {
  moduleId: UUID;
  reducerName: string;
  callerId: UUID;
  consumeFuel: (amount: number) => void;
  hostCall: (name: string, ...args: unknown[]) => Promise<unknown>;
  getMemoryUsed: () => number;
}

export interface ReducerResult {
  returnValue: unknown;
  fuelConsumed: number;
  hostCallsMade: number;
  durationMs: number;
}

// ─── Event Payloads ────────────────────────────────────────
export interface ModuleLoadedPayload { moduleId: UUID; name: string; reducerCount: number }
export interface ReducerInvokedPayload { invocationId: UUID; moduleId: UUID; reducerName: string; callerId: UUID }
export interface ReducerCompletedPayload {
  invocationId: UUID; moduleId: UUID; reducerName: string;
  fuelConsumed: number; hostCallsMade: number; durationMs: number;
}
export interface ResourceLimitExceededPayload {
  moduleId: UUID; resource: 'fuel' | 'memory' | 'cpu' | 'hostCalls'; limit: number; actual: number;
}

// ─── Error Types ───────────────────────────────────────────
export class FuelExhaustedError extends Error {
  constructor(budget: number) { super(`Fuel budget exhausted (budget: ${budget})`); this.name = 'FuelExhaustedError'; }
}
export class HostCallLimitError extends Error {
  constructor(limit: number) { super(`Host call limit exceeded (limit: ${limit})`); this.name = 'HostCallLimitError'; }
}
export class MemoryLimitError extends Error {
  constructor(limit: number, actual: number) { super(`Memory limit exceeded (limit: ${limit}, actual: ${actual})`); this.name = 'MemoryLimitError'; }
}
export class CpuTimeLimitError extends Error {
  constructor(limit: number) { super(`CPU time limit exceeded (limit: ${limit}ms)`); this.name = 'CpuTimeLimitError'; }
}

// ─── WasmModule Aggregate Root ─────────────────────────────
export class WasmModule {
  readonly id: UUID;
  readonly name: string;
  readonly reducers: Map<string, ReducerHandler>;
  readonly resourceLimits: ResourceLimits;
  private _status: ModuleStatus;
  private _compiledAt: Date | null = null;
  private _registeredAt: Date;

  constructor(name: string, reducers: ReducerDefinition[], limits?: Partial<ResourceLimits>) {
    this.id = generateId();
    this.name = name;
    this.reducers = new Map(reducers.map(r => [r.name, r.handler]));
    this.resourceLimits = {
      maxMemoryBytes: limits?.maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES,
      maxCpuMs: limits?.maxCpuMs ?? DEFAULT_MAX_CPU_MS,
      maxHostCalls: limits?.maxHostCalls ?? DEFAULT_MAX_HOST_CALLS,
      fuelBudget: limits?.fuelBudget ?? DEFAULT_FUEL_BUDGET,
    };
    this._status = ModuleStatus.Registered;
    this._registeredAt = new Date();
  }

  get status(): ModuleStatus { return this._status; }
  get compiledAt(): Date | null { return this._compiledAt; }
  get registeredAt(): Date { return this._registeredAt; }

  compile(): void {
    if (this._status === ModuleStatus.Revoked) throw new Error('Cannot compile a revoked module');
    this._status = ModuleStatus.Compiled;
    this._compiledAt = new Date();
  }

  activate(): void {
    if (this._status !== ModuleStatus.Compiled && this._status !== ModuleStatus.Suspended) {
      throw new Error(`Cannot activate module in status: ${this._status}`);
    }
    this._status = ModuleStatus.Active;
  }

  suspend(): void {
    if (this._status !== ModuleStatus.Active && this._status !== ModuleStatus.Compiled) {
      throw new Error(`Cannot suspend module in status: ${this._status}`);
    }
    this._status = ModuleStatus.Suspended;
  }

  revoke(): void { this._status = ModuleStatus.Revoked; }
  hasReducer(name: string): boolean { return this.reducers.has(name); }
  getReducer(name: string): ReducerHandler | undefined { return this.reducers.get(name); }
  get reducerNames(): string[] { return [...this.reducers.keys()]; }
}

// ─── ReducerInvocation Entity ──────────────────────────────
export class ReducerInvocation {
  readonly id: UUID;
  readonly moduleId: UUID;
  readonly reducerName: string;
  readonly callerId: UUID;
  readonly startedAt: number;
  private _fuelConsumed = 0;
  private _hostCallsMade = 0;
  private _memoryUsed = 0;
  private _completed = false;
  private _fuelBudget: number;
  private _maxHostCalls: number;
  private _maxMemoryBytes: number;
  private _maxCpuMs: number;

  constructor(moduleId: UUID, reducerName: string, callerId: UUID, limits: ResourceLimits) {
    this.id = generateId();
    this.moduleId = moduleId;
    this.reducerName = reducerName;
    this.callerId = callerId;
    this.startedAt = performance.now();
    this._fuelBudget = limits.fuelBudget;
    this._maxHostCalls = limits.maxHostCalls;
    this._maxMemoryBytes = limits.maxMemoryBytes;
    this._maxCpuMs = limits.maxCpuMs;
  }

  get fuelConsumed(): number { return this._fuelConsumed; }
  get fuelRemaining(): number { return this._fuelBudget - this._fuelConsumed; }
  get hostCallsMade(): number { return this._hostCallsMade; }
  get memoryUsed(): number { return this._memoryUsed; }
  get completed(): boolean { return this._completed; }
  get elapsedMs(): number { return performance.now() - this.startedAt; }

  consumeFuel(amount: number): void {
    this._fuelConsumed += amount;
    if (this._fuelConsumed > this._fuelBudget) throw new FuelExhaustedError(this._fuelBudget);
  }

  recordHostCall(): void {
    this._hostCallsMade += 1;
    if (this._hostCallsMade > this._maxHostCalls) throw new HostCallLimitError(this._maxHostCalls);
  }

  checkMemory(bytes: number): void {
    this._memoryUsed = bytes;
    if (bytes > this._maxMemoryBytes) throw new MemoryLimitError(this._maxMemoryBytes, bytes);
  }

  checkCpuTime(): void {
    if (this.elapsedMs > this._maxCpuMs) throw new CpuTimeLimitError(this._maxCpuMs);
  }

  complete(): void { this._completed = true; }
}

// ─── RuntimeEngine Service ─────────────────────────────────
export class RuntimeEngine {
  private modules: Map<UUID, WasmModule> = new Map();
  private hostFunctions: Map<string, HostFunction> = new Map();
  private readonly eventBus: EventBus;
  private compilationCache: Map<UUID, { compiledAt: Date }> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.registerDefaultHostFunctions();
  }

  // ── Module Lifecycle ───────────────────────────────────

  registerModule(
    name: string, reducers: ReducerDefinition[], resourceLimits?: Partial<ResourceLimits>,
  ): Result<WasmModule> {
    if (!name || name.trim().length === 0) return err(new Error('Module name must not be empty'));
    if (reducers.length === 0) return err(new Error('Module must define at least one reducer'));

    const mod = new WasmModule(name, reducers, resourceLimits);
    this.modules.set(mod.id, mod);
    this.emitEvent('ModuleLoaded', {
      moduleId: mod.id, name: mod.name, reducerCount: mod.reducers.size,
    } satisfies ModuleLoadedPayload);
    return ok(mod);
  }

  compileModule(moduleId: UUID): Result<void> {
    const mod = this.modules.get(moduleId);
    if (!mod) return err(new Error(`Module not found: ${moduleId}`));
    try {
      mod.compile();
      this.compilationCache.set(moduleId, { compiledAt: new Date() });
      mod.activate();
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  suspendModule(moduleId: UUID): Result<void> {
    return this.moduleTransition(moduleId, m => m.suspend());
  }

  activateModule(moduleId: UUID): Result<void> {
    return this.moduleTransition(moduleId, m => m.activate());
  }

  revokeModule(moduleId: UUID): Result<void> {
    const mod = this.modules.get(moduleId);
    if (!mod) return err(new Error(`Module not found: ${moduleId}`));
    mod.revoke();
    this.compilationCache.delete(moduleId);
    return ok(undefined);
  }

  getModule(moduleId: UUID): WasmModule | undefined { return this.modules.get(moduleId); }

  // ── Reducer Execution ──────────────────────────────────

  async invokeReducer(
    moduleId: UUID, reducerName: string, args: unknown[], callerId: UUID,
  ): Promise<Result<ReducerResult>> {
    const mod = this.modules.get(moduleId);
    if (!mod) return err(new Error(`Module not found: ${moduleId}`));
    if (mod.status !== ModuleStatus.Active) {
      return err(new Error(`Module is not active (status: ${mod.status})`));
    }
    const handler = mod.getReducer(reducerName);
    if (!handler) return err(new Error(`Reducer not found: ${reducerName}`));

    const invocation = new ReducerInvocation(moduleId, reducerName, callerId, mod.resourceLimits);
    this.emitEvent('ReducerInvoked', {
      invocationId: invocation.id, moduleId, reducerName, callerId,
    } satisfies ReducerInvokedPayload);

    const ctx = this.buildReducerContext(invocation);
    try {
      const returnValue = await handler(ctx, ...args);
      invocation.checkCpuTime();
      invocation.complete();

      const result: ReducerResult = {
        returnValue,
        fuelConsumed: invocation.fuelConsumed,
        hostCallsMade: invocation.hostCallsMade,
        durationMs: invocation.elapsedMs,
      };
      this.emitEvent('ReducerCompleted', {
        invocationId: invocation.id, moduleId, reducerName,
        fuelConsumed: result.fuelConsumed, hostCallsMade: result.hostCallsMade,
        durationMs: result.durationMs,
      } satisfies ReducerCompletedPayload);
      return ok(result);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.emitResourceLimitEvent(error, invocation, mod);
      return err(error);
    }
  }

  // ── Host Functions ─────────────────────────────────────

  registerHostFunction(name: string, fn: HostFunction): void { this.hostFunctions.set(name, fn); }
  getHostFunction(name: string): HostFunction | undefined { return this.hostFunctions.get(name); }
  get hostFunctionNames(): string[] { return [...this.hostFunctions.keys()]; }

  // ── AOT Compilation Cache ──────────────────────────────

  isCompiled(moduleId: UUID): boolean { return this.compilationCache.has(moduleId); }
  clearCompilationCache(): void { this.compilationCache.clear(); }

  // ── Introspection ──────────────────────────────────────

  get moduleCount(): number { return this.modules.size; }
  listModules(): WasmModule[] { return [...this.modules.values()]; }

  // ── Private Helpers ────────────────────────────────────

  private moduleTransition(moduleId: UUID, action: (m: WasmModule) => void): Result<void> {
    const mod = this.modules.get(moduleId);
    if (!mod) return err(new Error(`Module not found: ${moduleId}`));
    try {
      action(mod);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private buildReducerContext(invocation: ReducerInvocation): ReducerContext {
    return {
      moduleId: invocation.moduleId,
      reducerName: invocation.reducerName,
      callerId: invocation.callerId,
      consumeFuel: (amount: number) => {
        invocation.checkCpuTime();
        invocation.consumeFuel(amount);
      },
      hostCall: async (name: string, ...args: unknown[]) => {
        invocation.checkCpuTime();
        invocation.recordHostCall();
        invocation.consumeFuel(100); // host calls cost 100 fuel
        const fn = this.hostFunctions.get(name);
        if (!fn) throw new Error(`Unknown host function: ${name}`);
        return fn(...args);
      },
      getMemoryUsed: () => invocation.memoryUsed,
    };
  }

  private registerDefaultHostFunctions(): void {
    const stub = (op: string) => async (...args: unknown[]) => ({ op, args, timestamp: Date.now() });
    this.hostFunctions.set('table_insert', stub('insert'));
    this.hostFunctions.set('table_read', stub('read'));
    this.hostFunctions.set('table_update', stub('update'));
    this.hostFunctions.set('table_delete', stub('delete'));
    this.hostFunctions.set('vector_search', async (index: unknown, vector: unknown, k: unknown) => (
      { op: 'vector_search', index, vector, k, results: [], timestamp: Date.now() }
    ));
  }

  private emitEvent(eventType: string, payload: unknown): void {
    const event = createEvent(eventType, BoundedContext.Runtime, payload);
    void this.eventBus.emit(event);
  }

  private emitResourceLimitEvent(error: Error, invocation: ReducerInvocation, mod: WasmModule): void {
    let resource: ResourceLimitExceededPayload['resource'] | null = null;
    let limit = 0;
    let actual = 0;

    if (error instanceof FuelExhaustedError) {
      resource = 'fuel'; limit = mod.resourceLimits.fuelBudget; actual = invocation.fuelConsumed;
    } else if (error instanceof HostCallLimitError) {
      resource = 'hostCalls'; limit = mod.resourceLimits.maxHostCalls; actual = invocation.hostCallsMade;
    } else if (error instanceof MemoryLimitError) {
      resource = 'memory'; limit = mod.resourceLimits.maxMemoryBytes; actual = invocation.memoryUsed;
    } else if (error instanceof CpuTimeLimitError) {
      resource = 'cpu'; limit = mod.resourceLimits.maxCpuMs; actual = Math.round(invocation.elapsedMs);
    }

    if (resource) {
      this.emitEvent('ResourceLimitExceeded', {
        moduleId: invocation.moduleId, resource, limit, actual,
      } satisfies ResourceLimitExceededPayload);
    }
  }
}
