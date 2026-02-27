/**
 * Integration Test: Query Engine ↔ Subscription
 * ADR-002 Relationship: Query Engine → Subscription (Customer-Supplier)
 * Subscription consumes query deltas from vector search results.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { DistanceMetric, SearchResult } from '../../src/common/types.js';
import { QueryEngine, VectorIndex } from '../../src/query/index.js';
import { SubscriptionEngine } from '../../src/subscription/index.js';

describe('Query ↔ Subscription Integration', () => {
  let eventBus: EventBus;
  let queryEngine: QueryEngine;
  let subscriptionEngine: SubscriptionEngine;
  let vectorIndex: VectorIndex;

  beforeEach(() => {
    eventBus = new EventBus();
    queryEngine = new QueryEngine(eventBus);
    subscriptionEngine = new SubscriptionEngine(eventBus);

    vectorIndex = queryEngine.createVectorIndex(
      'products', 'embedding', 4, DistanceMetric.Cosine,
    );

    // Seed initial vectors
    vectorIndex.insertVector('v1', new Float32Array([1, 0, 0, 0]), { name: 'A' });
    vectorIndex.insertVector('v2', new Float32Array([0, 1, 0, 0]), { name: 'B' });
    vectorIndex.insertVector('v3', new Float32Array([0.5, 0.5, 0, 0]), { name: 'C' });
  });

  afterEach(() => {
    subscriptionEngine.destroy();
  });

  it('should receive initial delta from vector search subscription', async () => {
    const connectResult = subscriptionEngine.connect('ws');
    expect(connectResult.ok).toBe(true);
    if (!connectResult.ok) return;
    const session = connectResult.value;

    const pushed: SearchResult[][] = [];
    subscriptionEngine.onPush((_sid, delta) => {
      pushed.push([...delta.results]);
    });

    const queryFn = () => vectorIndex.search(new Float32Array([1, 0, 0, 0]), 2);
    const subResult = await subscriptionEngine.subscribe(session.id, queryFn, 2);

    expect(subResult.ok).toBe(true);
    if (!subResult.ok) return;

    const { initialDelta } = subResult.value;
    expect(initialDelta.results.length).toBe(2);
    expect(initialDelta.type).toBe('initial');
    expect(pushed.length).toBeGreaterThanOrEqual(1);
  });

  it('should compute incremental delta when index changes', async () => {
    const connectResult = subscriptionEngine.connect('ws');
    if (!connectResult.ok) return;
    const session = connectResult.value;

    const deltas: { added: number; removed: number }[] = [];
    subscriptionEngine.onPush((_sid, delta) => {
      deltas.push({
        added: delta.added.length,
        removed: delta.removed.length,
      });
    });

    const queryVec = new Float32Array([1, 0, 0, 0]);
    const queryFn = () => vectorIndex.search(queryVec, 2);
    const subResult = await subscriptionEngine.subscribe(session.id, queryFn, 2);
    if (!subResult.ok) return;

    const sub = subResult.value.subscription;

    // Insert a closer vector — should displace one result
    vectorIndex.insertVector('v4', new Float32Array([0.99, 0.01, 0, 0]), { name: 'D' });

    // Notify the subscription of the index change
    await subscriptionEngine.notifyIndexChange([sub.id]);

    expect(deltas.length).toBeGreaterThanOrEqual(2); // initial + incremental
  });

  it('should emit events across both contexts through the shared EventBus', async () => {
    const events: string[] = [];
    eventBus.onAll((event) => {
      events.push(event.eventType);
    });

    const connectResult = subscriptionEngine.connect('ws');
    if (!connectResult.ok) return;
    const session = connectResult.value;

    const queryFn = () => vectorIndex.search(new Float32Array([1, 0, 0, 0]), 2);
    await subscriptionEngine.subscribe(session.id, queryFn, 2);

    expect(events).toContain('ClientConnected');
    expect(events).toContain('SubscriptionCreated');
  });
});
