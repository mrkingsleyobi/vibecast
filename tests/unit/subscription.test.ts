/**
 * Tests for VibeCast Subscription Bounded Context
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SubscriptionEngine,
  Subscription,
  ClientSession,
  BackpressureState,
  SessionStatus,
  resolveBackpressure,
  createInitialDelta,
  createIncrementalDelta,
  DeltaType,
} from '../../src/subscription/index.js';
import { EventBus } from '../../src/common/events.js';

describe('Subscription Engine', () => {
  let engine: SubscriptionEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new SubscriptionEngine(eventBus);
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('Client Sessions', () => {
    it('should connect a client', () => {
      const result = engine.connect('websocket');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeDefined();
        expect(result.value.status).toBe(SessionStatus.Connected);
        expect(result.value.protocol).toBe('websocket');
      }
    });

    it('should disconnect a client', () => {
      const connectResult = engine.connect('native');
      expect(connectResult.ok).toBe(true);
      if (connectResult.ok) {
        const sessionId = connectResult.value.id;
        const disconnectResult = engine.disconnect(sessionId);
        expect(disconnectResult.ok).toBe(true);
        const session = engine.getSession(sessionId);
        expect(session?.status).toBe(SessionStatus.Disconnected);
      }
    });

    it('should return error for missing session', () => {
      const result = engine.disconnect('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('should reconnect within grace period', () => {
      const connectResult = engine.connect('websocket');
      if (connectResult.ok) {
        const sessionId = connectResult.value.id;
        engine.disconnect(sessionId);
        const reconnectResult = engine.reconnect(sessionId);
        expect(reconnectResult.ok).toBe(true);
      }
    });
  });

  describe('Subscriptions', () => {
    let sessionId: string;

    beforeEach(() => {
      const result = engine.connect('websocket');
      if (result.ok) sessionId = result.value.id;
    });

    it('should create subscription with initial results', async () => {
      const queryFn = () => [
        { id: '1', distance: 0.1 },
        { id: '2', distance: 0.3 },
      ];

      const result = await engine.subscribe(sessionId, queryFn, 10);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.subscription.id).toBeDefined();
        expect(result.value.initialDelta.results).toHaveLength(2);
        expect(result.value.initialDelta.type).toBe(DeltaType.Initial);
      }
    });

    it('should unsubscribe', async () => {
      const queryFn = () => [{ id: '1', distance: 0.1 }];
      const subResult = await engine.subscribe(sessionId, queryFn, 10);
      if (subResult.ok) {
        const unsubResult = engine.unsubscribe(sessionId, subResult.value.subscription.id);
        expect(unsubResult.ok).toBe(true);
      }
    });

    it('should reject subscription on disconnected session', async () => {
      engine.disconnect(sessionId);
      const result = await engine.subscribe(sessionId, () => [], 10);
      expect(result.ok).toBe(false);
    });
  });

  describe('Delta Computation', () => {
    let sessionId: string;

    beforeEach(() => {
      const result = engine.connect('websocket');
      if (result.ok) sessionId = result.value.id;
    });

    it('should compute incremental delta when results change', async () => {
      let results = [
        { id: '1', distance: 0.1 },
        { id: '2', distance: 0.3 },
      ];
      const queryFn = () => results;
      const subResult = await engine.subscribe(sessionId, queryFn, 10);

      // Change results
      results = [
        { id: '1', distance: 0.1 },
        { id: '3', distance: 0.2 },
        { id: '2', distance: 0.3 },
      ];

      if (subResult.ok) {
        await engine.notifyIndexChange([subResult.value.subscription.id]);
        // The subscription should have recomputed
        const sub = engine.getSession(sessionId)?.getSubscription(subResult.value.subscription.id);
        expect(sub?.version).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Backpressure', () => {
    let sessionId: string;

    beforeEach(() => {
      const result = engine.connect('websocket');
      if (result.ok) sessionId = result.value.id;
    });

    it('should start in normal state', () => {
      const session = engine.getSession(sessionId);
      expect(session?.backpressure).toBe(BackpressureState.Normal);
    });

    it('should transition to batched on high latency', () => {
      const result = engine.updateBackpressure(sessionId, 150);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(BackpressureState.Batched);
    });

    it('should transition to polling on very high latency', () => {
      const result = engine.updateBackpressure(sessionId, 2000);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(BackpressureState.Polling);
    });

    it('should transition to paused on extreme latency', () => {
      const result = engine.updateBackpressure(sessionId, 15000);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(BackpressureState.Paused);
    });

    it('should recover to normal on low latency', () => {
      engine.updateBackpressure(sessionId, 5000);
      const result = engine.updateBackpressure(sessionId, 50);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(BackpressureState.Normal);
    });
  });

  describe('Stats', () => {
    it('should track stats', async () => {
      const session1 = engine.connect('ws');
      const session2 = engine.connect('ws');
      if (session1.ok) {
        await engine.subscribe(session1.value.id, () => [], 10);
        await engine.subscribe(session1.value.id, () => [], 10);
      }
      const stats = engine.getStats();
      expect(stats.sessionCount).toBe(2);
      expect(stats.totalSubscriptions).toBe(2);
    });
  });

  describe('Domain Events', () => {
    it('should emit ClientConnected event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      engine.connect('websocket');
      expect(events).toContain('ClientConnected');
    });

    it('should emit SubscriptionCreated event', async () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      const session = engine.connect('websocket');
      if (session.ok) {
        await engine.subscribe(session.value.id, () => [], 10);
      }
      expect(events).toContain('SubscriptionCreated');
    });

    it('should emit ClientDisconnected event', () => {
      const events: string[] = [];
      const session = engine.connect('websocket');
      eventBus.onAll((e) => events.push(e.eventType));
      if (session.ok) {
        engine.disconnect(session.value.id);
      }
      expect(events).toContain('ClientDisconnected');
    });
  });
});

describe('Backpressure Resolution', () => {
  it('should resolve to Normal for low latency', () => {
    expect(resolveBackpressure(50)).toBe(BackpressureState.Normal);
  });

  it('should resolve to Batched for moderate latency', () => {
    expect(resolveBackpressure(150)).toBe(BackpressureState.Batched);
  });

  it('should resolve to Polling for high latency', () => {
    expect(resolveBackpressure(5000)).toBe(BackpressureState.Polling);
  });

  it('should resolve to Paused for extreme latency', () => {
    expect(resolveBackpressure(15000)).toBe(BackpressureState.Paused);
  });
});

describe('ClientSession', () => {
  it('should enforce max subscriptions', () => {
    const session = new ClientSession('ws');
    for (let i = 0; i < 100; i++) {
      const sub = new Subscription(session.id, () => [], 10);
      const result = session.addSubscription(sub);
      expect(result.ok).toBe(true);
    }
    const sub101 = new Subscription(session.id, () => [], 10);
    const result = session.addSubscription(sub101);
    expect(result.ok).toBe(false);
  });

  it('should batch and flush deltas', () => {
    const session = new ClientSession('ws');
    const delta = createInitialDelta('sub1', [{ id: '1', distance: 0.1 }], 0.1);
    session.enqueueBatch(delta);
    const batch = session.flushBatch();
    expect(batch).toHaveLength(1);
    expect(session.flushBatch()).toHaveLength(0);
  });
});

describe('Delta Constructors', () => {
  it('should create initial delta', () => {
    const delta = createInitialDelta('sub1', [{ id: '1', distance: 0.1 }], 0.1);
    expect(delta.type).toBe(DeltaType.Initial);
    expect(delta.version).toBe(1);
    expect(delta.results).toHaveLength(1);
  });

  it('should create incremental delta', () => {
    const added = [{ id: '3', distance: 0.2 }];
    const removed = [{ id: '2', distance: 0.5 }];
    const results = [{ id: '1', distance: 0.1 }, { id: '3', distance: 0.2 }];
    const delta = createIncrementalDelta('sub1', added, removed, results, 0.2, 2);
    expect(delta.type).toBe(DeltaType.Incremental);
    expect(delta.added).toHaveLength(1);
    expect(delta.removed).toHaveLength(1);
    expect(delta.version).toBe(2);
  });
});
