/**
 * Tests for Driftbase Common Types & Events
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateId,
  hlcNow,
  hlcCompare,
  VectorClock,
  ArrowDataType,
  createRecordBatch,
  ok,
  err,
} from '../../src/common/types.js';
import {
  EventBus,
  BoundedContext,
  createEvent,
} from '../../src/common/events.js';

describe('Common Types', () => {
  describe('generateId', () => {
    it('should generate unique UUIDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });

    it('should return valid UUID format', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('HLC Timestamps', () => {
    it('should create timestamp with current wall time', () => {
      const before = BigInt(Date.now());
      const ts = hlcNow(1);
      const after = BigInt(Date.now());
      expect(ts.wallTime).toBeGreaterThanOrEqual(before);
      expect(ts.wallTime).toBeLessThanOrEqual(after);
      expect(ts.nodeId).toBe(1);
      expect(ts.logical).toBe(0);
    });

    it('should compare timestamps by wall time', () => {
      const a = { wallTime: 100n, logical: 0, nodeId: 1 };
      const b = { wallTime: 200n, logical: 0, nodeId: 1 };
      expect(hlcCompare(a, b)).toBeLessThan(0);
      expect(hlcCompare(b, a)).toBeGreaterThan(0);
    });

    it('should compare timestamps by logical clock when wall time equal', () => {
      const a = { wallTime: 100n, logical: 1, nodeId: 1 };
      const b = { wallTime: 100n, logical: 2, nodeId: 1 };
      expect(hlcCompare(a, b)).toBeLessThan(0);
    });

    it('should compare timestamps by nodeId as tiebreaker', () => {
      const a = { wallTime: 100n, logical: 1, nodeId: 1 };
      const b = { wallTime: 100n, logical: 1, nodeId: 2 };
      expect(hlcCompare(a, b)).toBeLessThan(0);
    });
  });

  describe('VectorClock', () => {
    it('should increment and track node clocks', () => {
      const vc = new VectorClock();
      vc.increment(1);
      vc.increment(1);
      vc.increment(2);
      expect(vc.get(1)).toBe(2n);
      expect(vc.get(2)).toBe(1n);
      expect(vc.get(3)).toBe(0n);
    });

    it('should merge taking max of each node', () => {
      const a = new VectorClock();
      a.increment(1);
      a.increment(1);
      a.increment(2);

      const b = new VectorClock();
      b.increment(1);
      b.increment(2);
      b.increment(2);
      b.increment(3);

      const merged = a.merge(b);
      expect(merged.get(1)).toBe(2n); // max(2, 1)
      expect(merged.get(2)).toBe(2n); // max(1, 2)
      expect(merged.get(3)).toBe(1n); // max(0, 1)
    });

    it('should detect happens-before relationship', () => {
      const a = new VectorClock();
      a.increment(1);

      const b = new VectorClock();
      b.increment(1);
      b.increment(1);
      b.increment(2);

      expect(a.happensBefore(b)).toBe(true);
      expect(b.happensBefore(a)).toBe(false);
    });

    it('should detect concurrent events', () => {
      const a = new VectorClock();
      a.increment(1);

      const b = new VectorClock();
      b.increment(2);

      expect(a.isConcurrent(b)).toBe(true);
    });

    it('should serialize to JSON', () => {
      const vc = new VectorClock();
      vc.increment(1);
      vc.increment(2);
      const json = vc.toJSON();
      expect(json).toEqual({ '1': '1', '2': '1' });
    });

    it('should clone correctly', () => {
      const a = new VectorClock();
      a.increment(1);
      const b = a.clone();
      b.increment(2);
      expect(a.get(2)).toBe(0n);
      expect(b.get(2)).toBe(1n);
    });
  });

  describe('RecordBatch', () => {
    it('should create record batch from schema and data', () => {
      const schema = {
        columns: [
          { name: 'id', dataType: ArrowDataType.Int32, nullable: false },
          { name: 'name', dataType: ArrowDataType.Utf8, nullable: true },
        ],
        version: 1,
      };
      const batch = createRecordBatch(schema, {
        id: [1, 2, 3],
        name: ['alice', 'bob', 'charlie'],
      });
      expect(batch.rowCount).toBe(3);
      expect(batch.columns.get('id')).toEqual([1, 2, 3]);
      expect(batch.columns.get('name')).toEqual(['alice', 'bob', 'charlie']);
    });
  });

  describe('Result type', () => {
    it('should create ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('should create err result', () => {
      const result = err(new Error('test error'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('test error');
    });
  });
});

describe('Event Bus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should emit and receive events by type', async () => {
    const received: string[] = [];
    bus.on('TestEvent', (e) => { received.push(e.eventType); });

    await bus.emit(createEvent('TestEvent', BoundedContext.Storage, { test: true }));
    await bus.emit(createEvent('OtherEvent', BoundedContext.Storage, { test: true }));

    expect(received).toEqual(['TestEvent']);
  });

  it('should support global handlers', async () => {
    const received: string[] = [];
    bus.onAll((e) => { received.push(e.eventType); });

    await bus.emit(createEvent('A', BoundedContext.Storage, {}));
    await bus.emit(createEvent('B', BoundedContext.Query, {}));

    expect(received).toEqual(['A', 'B']);
  });

  it('should maintain event log', async () => {
    await bus.emit(createEvent('E1', BoundedContext.Storage, {}));
    await bus.emit(createEvent('E2', BoundedContext.Query, {}));

    const log = bus.getLog();
    expect(log).toHaveLength(2);
    expect(log[0].eventType).toBe('E1');
    expect(log[1].eventType).toBe('E2');
  });

  it('should support unsubscribe', async () => {
    const received: string[] = [];
    const unsub = bus.on('TestEvent', (e) => { received.push(e.eventType); });

    await bus.emit(createEvent('TestEvent', BoundedContext.Storage, {}));
    unsub();
    await bus.emit(createEvent('TestEvent', BoundedContext.Storage, {}));

    expect(received).toHaveLength(1);
  });

  it('should clear event log', async () => {
    await bus.emit(createEvent('E1', BoundedContext.Storage, {}));
    bus.clear();
    expect(bus.getLog()).toHaveLength(0);
  });

  it('should create events with correlation and causation IDs', () => {
    const correlationId = generateId();
    const causationId = generateId();
    const event = createEvent('Test', BoundedContext.Storage, {}, correlationId, causationId);
    expect(event.correlationId).toBe(correlationId);
    expect(event.causationId).toBe(causationId);
  });
});
