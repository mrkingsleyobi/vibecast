/**
 * Tests for Driftbase Runtime Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RuntimeEngine,
  WasmModule,
  ModuleStatus,
  ReducerInvocation,
  FuelExhaustedError,
  HostCallLimitError,
} from '../../src/runtime/index.js';
import { EventBus } from '../../src/common/events.js';
import { generateId } from '../../src/common/types.js';

describe('Runtime Engine', () => {
  let engine: RuntimeEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new RuntimeEngine(eventBus);
  });

  describe('Module Lifecycle', () => {
    it('should register a module', () => {
      const result = engine.registerModule('test-module', [
        { name: 'add', handler: (_ctx, a: unknown, b: unknown) => (a as number) + (b as number) },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-module');
        expect(result.value.status).toBe(ModuleStatus.Registered);
      }
    });

    it('should reject empty module name', () => {
      const result = engine.registerModule('', [
        { name: 'noop', handler: () => {} },
      ]);
      expect(result.ok).toBe(false);
    });

    it('should reject module with no reducers', () => {
      const result = engine.registerModule('empty', []);
      expect(result.ok).toBe(false);
    });

    it('should compile and activate a module', () => {
      const regResult = engine.registerModule('mod', [
        { name: 'run', handler: () => 42 },
      ]);
      if (regResult.ok) {
        const compileResult = engine.compileModule(regResult.value.id);
        expect(compileResult.ok).toBe(true);
        expect(regResult.value.status).toBe(ModuleStatus.Active);
        expect(engine.isCompiled(regResult.value.id)).toBe(true);
      }
    });

    it('should suspend and reactivate module', () => {
      const regResult = engine.registerModule('mod', [
        { name: 'run', handler: () => 42 },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        engine.suspendModule(regResult.value.id);
        expect(regResult.value.status).toBe(ModuleStatus.Suspended);

        engine.activateModule(regResult.value.id);
        expect(regResult.value.status).toBe(ModuleStatus.Active);
      }
    });

    it('should revoke a module', () => {
      const regResult = engine.registerModule('mod', [
        { name: 'run', handler: () => 42 },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const revokeResult = engine.revokeModule(regResult.value.id);
        expect(revokeResult.ok).toBe(true);
        expect(regResult.value.status).toBe(ModuleStatus.Revoked);
        expect(engine.isCompiled(regResult.value.id)).toBe(false);
      }
    });

    it('should list modules', () => {
      engine.registerModule('a', [{ name: 'r', handler: () => {} }]);
      engine.registerModule('b', [{ name: 'r', handler: () => {} }]);
      expect(engine.moduleCount).toBe(2);
      expect(engine.listModules()).toHaveLength(2);
    });
  });

  describe('Reducer Execution', () => {
    it('should invoke a reducer', async () => {
      const regResult = engine.registerModule('math', [
        { name: 'add', handler: (_ctx, a: unknown, b: unknown) => (a as number) + (b as number) },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const result = await engine.invokeReducer(
          regResult.value.id, 'add', [3, 4], generateId(),
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.returnValue).toBe(7);
          expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should reject invocation on non-active module', async () => {
      const regResult = engine.registerModule('mod', [
        { name: 'run', handler: () => 42 },
      ]);
      if (regResult.ok) {
        // Module is in Registered state, not Active
        const result = await engine.invokeReducer(
          regResult.value.id, 'run', [], generateId(),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('should reject invocation of nonexistent reducer', async () => {
      const regResult = engine.registerModule('mod', [
        { name: 'run', handler: () => 42 },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const result = await engine.invokeReducer(
          regResult.value.id, 'nonexistent', [], generateId(),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('should track fuel consumption', async () => {
      const regResult = engine.registerModule('fuel-test', [
        {
          name: 'consume',
          handler: (ctx) => {
            ctx.consumeFuel(500);
            return 'done';
          },
        },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const result = await engine.invokeReducer(
          regResult.value.id, 'consume', [], generateId(),
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.fuelConsumed).toBe(500);
        }
      }
    });

    it('should enforce fuel budget', async () => {
      const regResult = engine.registerModule('fuel-exhaust', [
        {
          name: 'exhaust',
          handler: (ctx) => {
            ctx.consumeFuel(2_000_000); // exceeds default 1M budget
          },
        },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const result = await engine.invokeReducer(
          regResult.value.id, 'exhaust', [], generateId(),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('should support host function calls', async () => {
      const regResult = engine.registerModule('host-test', [
        {
          name: 'call_host',
          handler: async (ctx) => {
            return ctx.hostCall('table_read', 'users', 'row1');
          },
        },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        const result = await engine.invokeReducer(
          regResult.value.id, 'call_host', [], generateId(),
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.hostCallsMade).toBe(1);
        }
      }
    });
  });

  describe('Host Functions', () => {
    it('should register custom host functions', () => {
      engine.registerHostFunction('custom_fn', async () => 'custom result');
      expect(engine.getHostFunction('custom_fn')).toBeDefined();
      expect(engine.hostFunctionNames).toContain('custom_fn');
    });

    it('should have default host functions', () => {
      expect(engine.hostFunctionNames).toContain('table_insert');
      expect(engine.hostFunctionNames).toContain('table_read');
      expect(engine.hostFunctionNames).toContain('vector_search');
    });
  });

  describe('Domain Events', () => {
    it('should emit ModuleLoaded event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      engine.registerModule('ev-test', [
        { name: 'r', handler: () => {} },
      ]);
      expect(events).toContain('ModuleLoaded');
    });

    it('should emit ReducerInvoked and ReducerCompleted events', async () => {
      const events: string[] = [];
      const regResult = engine.registerModule('ev-test2', [
        { name: 'r', handler: () => 42 },
      ]);
      if (regResult.ok) {
        engine.compileModule(regResult.value.id);
        eventBus.onAll((e) => events.push(e.eventType));
        await engine.invokeReducer(regResult.value.id, 'r', [], generateId());
      }
      expect(events).toContain('ReducerInvoked');
      expect(events).toContain('ReducerCompleted');
    });
  });
});

describe('WasmModule', () => {
  it('should list reducer names', () => {
    const mod = new WasmModule('test', [
      { name: 'add', handler: () => {} },
      { name: 'sub', handler: () => {} },
    ]);
    expect(mod.reducerNames).toEqual(['add', 'sub']);
    expect(mod.hasReducer('add')).toBe(true);
    expect(mod.hasReducer('mul')).toBe(false);
  });

  it('should enforce lifecycle transitions', () => {
    const mod = new WasmModule('test', [{ name: 'r', handler: () => {} }]);
    expect(() => mod.activate()).toThrow(); // not compiled yet
    mod.compile();
    mod.activate();
    expect(mod.status).toBe(ModuleStatus.Active);
    mod.suspend();
    expect(mod.status).toBe(ModuleStatus.Suspended);
    mod.activate();
    expect(mod.status).toBe(ModuleStatus.Active);
    mod.revoke();
    expect(mod.status).toBe(ModuleStatus.Revoked);
    expect(() => mod.compile()).toThrow(); // revoked
  });
});

describe('ReducerInvocation', () => {
  const limits = {
    maxMemoryBytes: 256 * 1024 * 1024,
    maxCpuMs: 10_000,
    maxHostCalls: 10,
    fuelBudget: 1000,
  };

  it('should track fuel consumption', () => {
    const inv = new ReducerInvocation('m1', 'r1', 'c1', limits);
    inv.consumeFuel(500);
    expect(inv.fuelConsumed).toBe(500);
    expect(inv.fuelRemaining).toBe(500);
  });

  it('should throw on fuel exhaustion', () => {
    const inv = new ReducerInvocation('m1', 'r1', 'c1', limits);
    expect(() => inv.consumeFuel(1500)).toThrow(FuelExhaustedError);
  });

  it('should throw on host call limit', () => {
    const inv = new ReducerInvocation('m1', 'r1', 'c1', limits);
    for (let i = 0; i < 10; i++) inv.recordHostCall();
    expect(() => inv.recordHostCall()).toThrow(HostCallLimitError);
  });
});
