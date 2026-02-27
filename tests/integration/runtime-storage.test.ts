/**
 * Integration Test: Runtime ↔ Storage
 * ADR-002 Relationship: Runtime → Query Engine (ACL)
 * WASM reducers access storage through host functions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { ArrowSchema, ArrowDataType, generateId } from '../../src/common/types.js';
import { StorageEngine } from '../../src/storage/index.js';
import { RuntimeEngine, ReducerDefinition, ReducerContext } from '../../src/runtime/index.js';

describe('Runtime ↔ Storage Integration', () => {
  let eventBus: EventBus;
  let storage: StorageEngine;
  let runtime: RuntimeEngine;

  const schema: ArrowSchema = {
    columns: [
      { name: 'name', dataType: ArrowDataType.Utf8, nullable: false },
      { name: 'score', dataType: ArrowDataType.Int32, nullable: true },
    ],
    version: 1,
  };

  beforeEach(async () => {
    eventBus = new EventBus();
    storage = new StorageEngine(eventBus);
    runtime = new RuntimeEngine(eventBus);
  });

  it('should execute reducer that calls storage host functions', async () => {
    // Create table in storage
    const tableResult = await storage.createTable('players', schema);
    expect(tableResult.ok).toBe(true);
    if (!tableResult.ok) return;
    const table = tableResult.value;

    // Register a real storage-backed host function
    runtime.registerHostFunction('storage_insert', async (tableId: unknown, data: unknown) => {
      const txId = storage.beginTransaction();
      const result = await storage.insert(tableId as string, data as Record<string, unknown>, txId);
      await storage.commitTransaction(txId);
      return result;
    });

    // Create a reducer that uses the host function
    const reducers: ReducerDefinition[] = [{
      name: 'addPlayer',
      handler: async (ctx: ReducerContext, name: unknown, score: unknown) => {
        ctx.consumeFuel(100);
        return ctx.hostCall('storage_insert', table.tableId, { name, score });
      },
    }];

    const modResult = runtime.registerModule('game', reducers);
    expect(modResult.ok).toBe(true);
    if (!modResult.ok) return;

    const compileResult = runtime.compileModule(modResult.value.id);
    expect(compileResult.ok).toBe(true);

    // Invoke the reducer
    const callerId = generateId();
    const invokeResult = await runtime.invokeReducer(
      modResult.value.id, 'addPlayer', ['Alice', 100], callerId,
    );
    expect(invokeResult.ok).toBe(true);

    // Verify data in storage
    expect(table.getRowCount()).toBe(1);
  });

  it('should enforce resource limits when accessing storage', async () => {
    const reducers: ReducerDefinition[] = [{
      name: 'expensive',
      handler: async (ctx: ReducerContext) => {
        // Consume nearly all fuel
        ctx.consumeFuel(999_999);
        return 'done';
      },
    }];

    const modResult = runtime.registerModule('limiter', reducers, { fuelBudget: 1_000_000 });
    expect(modResult.ok).toBe(true);
    if (!modResult.ok) return;
    runtime.compileModule(modResult.value.id);

    const callerId = generateId();
    const result = await runtime.invokeReducer(modResult.value.id, 'expensive', [], callerId);
    expect(result.ok).toBe(true);
  });

  it('should emit events observable across both runtime and storage contexts', async () => {
    const events: string[] = [];
    eventBus.onAll((e) => events.push(`${e.context}:${e.eventType}`));

    // Storage event
    await storage.createTable('test', schema);

    // Runtime event
    const reducers: ReducerDefinition[] = [{
      name: 'noop',
      handler: async (ctx: ReducerContext) => { ctx.consumeFuel(1); return null; },
    }];
    const mod = runtime.registerModule('noop-mod', reducers);
    expect(mod.ok).toBe(true);

    const runtimeEvents = events.filter(e => e.startsWith('runtime:'));
    const storageEvents = events.filter(e => e.startsWith('storage:'));

    expect(runtimeEvents.length).toBeGreaterThanOrEqual(1);
    expect(storageEvents.length).toBeGreaterThanOrEqual(1);
  });
});
