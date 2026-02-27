/**
 * VibeCast Subscription Bounded Context
 *
 * Reactive vector subscriptions: clients subscribe to "top-k similar"
 * queries and receive push updates when index changes affect their
 * result sets. Implements boundary tracking for efficient delta
 * computation and adaptive backpressure per ADR-003.
 */
import { UUID, generateId, SearchResult, Result, ok, err } from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';

// ─── Constants ──────────────────────────────────────────────

const MAX_SUBSCRIPTIONS_PER_SESSION = 100;
const RECONNECT_GRACE_PERIOD_MS = 30_000;
const POLLING_INTERVAL_MS = 5_000;
const FULL_RECOMPUTE_THRESHOLD = 0.10;

// ─── Backpressure ───────────────────────────────────────────

export enum BackpressureState {
  Normal = 'normal',     // <100ms ACK  -> push immediately
  Batched = 'batched',   // 100ms-1s    -> aggregate changes
  Polling = 'polling',   // 1s-10s      -> periodic polling (5s)
  Paused = 'paused',     // >10s        -> pause, notify client
}

export interface BackpressureConfig {
  readonly normalThresholdMs: number;
  readonly batchedThresholdMs: number;
  readonly pollingThresholdMs: number;
  readonly pollingIntervalMs: number;
}

const DEFAULT_BP_CONFIG: BackpressureConfig = {
  normalThresholdMs: 100,
  batchedThresholdMs: 1_000,
  pollingThresholdMs: 10_000,
  pollingIntervalMs: POLLING_INTERVAL_MS,
};

export function resolveBackpressure(
  ackLatencyMs: number,
  cfg: BackpressureConfig = DEFAULT_BP_CONFIG,
): BackpressureState {
  if (ackLatencyMs < cfg.normalThresholdMs) return BackpressureState.Normal;
  if (ackLatencyMs < cfg.batchedThresholdMs) return BackpressureState.Batched;
  if (ackLatencyMs < cfg.pollingThresholdMs) return BackpressureState.Polling;
  return BackpressureState.Paused;
}

// ─── Delta Value Object ─────────────────────────────────────

export enum DeltaType {
  Initial = 'initial',
  Incremental = 'incremental',
  Full = 'full',
}

export interface Delta {
  readonly type: DeltaType;
  readonly subscriptionId: UUID;
  readonly added: ReadonlyArray<SearchResult>;
  readonly removed: ReadonlyArray<SearchResult>;
  readonly results: ReadonlyArray<SearchResult>;
  readonly boundaryDistance: number;
  readonly version: number;
  readonly computedAt: number;
}

function buildDelta(
  type: DeltaType, subscriptionId: UUID,
  added: ReadonlyArray<SearchResult>, removed: ReadonlyArray<SearchResult>,
  results: ReadonlyArray<SearchResult>, boundaryDistance: number, version: number,
): Delta {
  return { type, subscriptionId, added, removed, results, boundaryDistance, version, computedAt: Date.now() };
}

export function createInitialDelta(subId: UUID, results: ReadonlyArray<SearchResult>, boundary: number): Delta {
  return buildDelta(DeltaType.Initial, subId, results, [], results, boundary, 1);
}

export function createIncrementalDelta(
  subId: UUID, added: ReadonlyArray<SearchResult>, removed: ReadonlyArray<SearchResult>,
  results: ReadonlyArray<SearchResult>, boundary: number, version: number,
): Delta {
  return buildDelta(DeltaType.Incremental, subId, added, removed, results, boundary, version);
}

export function createFullDelta(subId: UUID, results: ReadonlyArray<SearchResult>, boundary: number, version: number): Delta {
  return buildDelta(DeltaType.Full, subId, results, [], results, boundary, version);
}

// ─── Subscription Entity ────────────────────────────────────

export type QueryFn = () => Promise<SearchResult[]> | SearchResult[];

export class Subscription {
  readonly id: UUID = generateId();
  readonly sessionId: UUID;
  readonly k: number;
  private _queryFn: QueryFn;
  private _currentResults: SearchResult[] = [];
  private _boundaryDistance = Infinity;
  private _version = 0;
  private _createdAt = Date.now();
  private _active = true;

  constructor(sessionId: UUID, queryFn: QueryFn, k: number) {
    this.sessionId = sessionId;
    this.k = k;
    this._queryFn = queryFn;
  }

  get currentResults(): ReadonlyArray<SearchResult> { return this._currentResults; }
  get boundaryDistance(): number { return this._boundaryDistance; }
  get version(): number { return this._version; }
  get active(): boolean { return this._active; }

  get state() {
    return {
      id: this.id, sessionId: this.sessionId, k: this.k,
      currentResults: [...this._currentResults],
      boundaryDistance: this._boundaryDistance,
      version: this._version, createdAt: this._createdAt, active: this._active,
    };
  }

  async computeInitial(): Promise<Delta> {
    const topK = (await this._queryFn()).slice(0, this.k);
    this._currentResults = topK;
    this._boundaryDistance = topK.length > 0 ? topK[topK.length - 1].distance : Infinity;
    this._version = 1;
    return createInitialDelta(this.id, topK, this._boundaryDistance);
  }

  async computeDelta(newResults?: SearchResult[], indexChangeRatio?: number): Promise<Delta | null> {
    if (!this._active) return null;

    const topK = (newResults ?? await this._queryFn()).slice(0, this.k);
    const newBoundary = topK.length > 0 ? topK[topK.length - 1].distance : Infinity;

    if (indexChangeRatio !== undefined && indexChangeRatio > FULL_RECOMPUTE_THRESHOLD) {
      this._currentResults = topK;
      this._boundaryDistance = newBoundary;
      this._version += 1;
      return createFullDelta(this.id, topK, newBoundary, this._version);
    }

    const currentIds = new Set(this._currentResults.map(r => r.id));
    const newIds = new Set(topK.map(r => r.id));
    const added = topK.filter(r => !currentIds.has(r.id));
    const removed = this._currentResults.filter(r => !newIds.has(r.id));

    if (added.length === 0 && removed.length === 0) return null;

    this._currentResults = topK;
    this._boundaryDistance = newBoundary;
    this._version += 1;
    return createIncrementalDelta(this.id, added, removed, topK, newBoundary, this._version);
  }

  deactivate(): void { this._active = false; }
}

// ─── ClientSession Aggregate Root ───────────────────────────

export enum SessionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Reconnecting = 'reconnecting',
}

export class ClientSession {
  readonly id: UUID = generateId();
  readonly protocol: string;
  private _status: SessionStatus = SessionStatus.Connected;
  private _backpressure: BackpressureState = BackpressureState.Normal;
  private _subscriptions = new Map<UUID, Subscription>();
  private _connectedAt = Date.now();
  private _disconnectedAt: number | null = null;
  private _lastAckLatencyMs = 0;
  private _pendingBatch: Delta[] = [];
  private _pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(protocol: string) { this.protocol = protocol; }

  get status(): SessionStatus { return this._status; }
  get backpressure(): BackpressureState { return this._backpressure; }
  get subscriptionCount(): number { return this._subscriptions.size; }
  get lastAckLatencyMs(): number { return this._lastAckLatencyMs; }

  get state() {
    return {
      id: this.id, protocol: this.protocol, status: this._status,
      backpressure: this._backpressure, subscriptionCount: this._subscriptions.size,
      connectedAt: this._connectedAt, lastAckLatencyMs: this._lastAckLatencyMs,
    };
  }

  addSubscription(sub: Subscription): Result<void> {
    if (this._status !== SessionStatus.Connected) return err(new Error('Session is not connected'));
    if (this._subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SESSION) {
      return err(new Error(`Max subscriptions (${MAX_SUBSCRIPTIONS_PER_SESSION}) reached`));
    }
    this._subscriptions.set(sub.id, sub);
    return ok(undefined);
  }

  removeSubscription(subscriptionId: UUID): Result<void> {
    const sub = this._subscriptions.get(subscriptionId);
    if (!sub) return err(new Error(`Subscription ${subscriptionId} not found`));
    sub.deactivate();
    this._subscriptions.delete(subscriptionId);
    return ok(undefined);
  }

  getSubscription(id: UUID): Subscription | undefined { return this._subscriptions.get(id); }

  getAllSubscriptions(): ReadonlyArray<Subscription> {
    return Array.from(this._subscriptions.values());
  }

  updateBackpressure(ackLatencyMs: number): BackpressureState {
    this._lastAckLatencyMs = ackLatencyMs;
    this._backpressure = resolveBackpressure(ackLatencyMs);
    return this._backpressure;
  }

  enqueueBatch(delta: Delta): void { this._pendingBatch.push(delta); }

  flushBatch(): Delta[] {
    const batch = this._pendingBatch;
    this._pendingBatch = [];
    return batch;
  }

  disconnect(): void {
    this._status = SessionStatus.Disconnected;
    this._disconnectedAt = Date.now();
    this.clearPollingTimer();
  }

  canReconnect(): boolean {
    if (this._status !== SessionStatus.Disconnected || this._disconnectedAt === null) return false;
    return (Date.now() - this._disconnectedAt) < RECONNECT_GRACE_PERIOD_MS;
  }

  reconnect(): Result<void> {
    if (!this.canReconnect()) return err(new Error('Reconnect grace period expired'));
    this._status = SessionStatus.Connected;
    this._disconnectedAt = null;
    return ok(undefined);
  }

  setPollingTimer(timer: ReturnType<typeof setInterval>): void {
    this.clearPollingTimer();
    this._pollingTimer = timer;
  }

  clearPollingTimer(): void {
    if (this._pollingTimer !== null) { clearInterval(this._pollingTimer); this._pollingTimer = null; }
  }

  destroy(): void {
    this.clearPollingTimer();
    for (const sub of this._subscriptions.values()) sub.deactivate();
    this._subscriptions.clear();
    this._status = SessionStatus.Disconnected;
  }
}

// ─── Push Handler ───────────────────────────────────────────

export type PushHandler = (sessionId: UUID, delta: Delta) => void | Promise<void>;

// ─── Subscription Engine ────────────────────────────────────

export interface SubscriptionEngineConfig {
  readonly backpressure?: Partial<BackpressureConfig>;
  readonly pollingIntervalMs?: number;
}

export class SubscriptionEngine {
  private sessions = new Map<UUID, ClientSession>();
  private subscriptionIndex = new Map<UUID, UUID>(); // subId -> sessionId
  private eventBus: EventBus;
  private pushHandler: PushHandler | null = null;
  private pollingIntervalMs: number;

  constructor(eventBus: EventBus, config?: SubscriptionEngineConfig) {
    this.eventBus = eventBus;
    this.pollingIntervalMs = config?.pollingIntervalMs ?? POLLING_INTERVAL_MS;
  }

  onPush(handler: PushHandler): void { this.pushHandler = handler; }

  // ── Session Lifecycle ───────────────────────────────────

  connect(protocol: string): Result<ClientSession> {
    const session = new ClientSession(protocol);
    this.sessions.set(session.id, session);
    this.emit('ClientConnected', { sessionId: session.id, protocol });
    return ok(session);
  }

  disconnect(sessionId: UUID): Result<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new Error(`Session ${sessionId} not found`));
    session.disconnect();
    this.emit('ClientDisconnected', { sessionId, reason: 'client_initiated' });
    setTimeout(() => this.cleanupSession(sessionId), RECONNECT_GRACE_PERIOD_MS);
    return ok(undefined);
  }

  reconnect(sessionId: UUID): Result<ClientSession> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new Error(`Session ${sessionId} not found`));
    const result = session.reconnect();
    if (!result.ok) return err(result.error);
    this.emit('ClientReconnected', { sessionId });
    return ok(session);
  }

  getSession(sessionId: UUID): ClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ── Subscription Lifecycle ──────────────────────────────

  async subscribe(
    sessionId: UUID, queryFn: QueryFn, k: number,
  ): Promise<Result<{ subscription: Subscription; initialDelta: Delta }>> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new Error(`Session ${sessionId} not found`));

    const sub = new Subscription(sessionId, queryFn, k);
    const addResult = session.addSubscription(sub);
    if (!addResult.ok) return err(addResult.error);
    this.subscriptionIndex.set(sub.id, sessionId);

    let initialDelta: Delta;
    try {
      initialDelta = await sub.computeInitial();
    } catch (error) {
      session.removeSubscription(sub.id);
      this.subscriptionIndex.delete(sub.id);
      return err(error instanceof Error ? error : new Error(String(error)));
    }

    this.emit('SubscriptionCreated', { subscriptionId: sub.id, sessionId });
    await this.pushDelta(session, initialDelta);
    return ok({ subscription: sub, initialDelta });
  }

  unsubscribe(sessionId: UUID, subscriptionId: UUID): Result<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new Error(`Session ${sessionId} not found`));
    const result = session.removeSubscription(subscriptionId);
    if (!result.ok) return err(result.error);
    this.subscriptionIndex.delete(subscriptionId);
    this.emit('SubscriptionRemoved', { subscriptionId, sessionId });
    return ok(undefined);
  }

  // ── Index Change Notification ───────────────────────────

  async notifyIndexChange(
    affectedIds: UUID[],
    newResultsMap?: Map<UUID, SearchResult[]>,
    indexChangeRatio?: number,
  ): Promise<void> {
    await Promise.all(affectedIds.map(async (subId) => {
      const sessionId = this.subscriptionIndex.get(subId);
      if (!sessionId) return;
      const session = this.sessions.get(sessionId);
      if (!session || session.status !== SessionStatus.Connected) return;
      const sub = session.getSubscription(subId);
      if (!sub || !sub.active) return;

      const delta = await sub.computeDelta(newResultsMap?.get(subId), indexChangeRatio);
      if (!delta) return;

      this.emit('DeltaComputed', {
        subscriptionId: subId, addedCount: delta.added.length, removedCount: delta.removed.length,
      });
      await this.pushDelta(session, delta);
    }));
  }

  // ── Backpressure ────────────────────────────────────────

  updateBackpressure(sessionId: UUID, ackLatencyMs: number): Result<BackpressureState> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new Error(`Session ${sessionId} not found`));

    const prev = session.backpressure;
    const next = session.updateBackpressure(ackLatencyMs);

    if (prev !== next) {
      this.handleBpTransition(session, prev, next);
      this.emit('BackpressureChanged', { sessionId, from: prev, to: next, ackLatencyMs });
    }
    return ok(next);
  }

  // ── Stats ───────────────────────────────────────────────

  getStats() {
    let total = 0, active = 0;
    for (const session of this.sessions.values()) {
      const subs = session.getAllSubscriptions();
      total += subs.length;
      active += subs.filter(s => s.active).length;
    }
    return { sessionCount: this.sessions.size, totalSubscriptions: total, activeSubscriptions: active };
  }

  destroy(): void {
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
    this.subscriptionIndex.clear();
  }

  // ── Private ─────────────────────────────────────────────

  private async pushDelta(session: ClientSession, delta: Delta): Promise<void> {
    if (!this.pushHandler) return;
    switch (session.backpressure) {
      case BackpressureState.Normal:
        await this.pushHandler(session.id, delta);
        this.emit('DeltaPushed', { subscriptionId: delta.subscriptionId, sessionId: session.id, latencyMs: 0 });
        break;
      case BackpressureState.Batched:
      case BackpressureState.Polling:
        session.enqueueBatch(delta);
        break;
      case BackpressureState.Paused:
        this.emit('SubscriptionPaused', { subscriptionId: delta.subscriptionId, sessionId: session.id });
        break;
    }
  }

  private handleBpTransition(session: ClientSession, from: BackpressureState, to: BackpressureState): void {
    if (from === BackpressureState.Polling && to !== BackpressureState.Polling) {
      session.clearPollingTimer();
    }
    if (to === BackpressureState.Polling && from !== BackpressureState.Polling) {
      session.setPollingTimer(setInterval(() => this.flushBatch(session), this.pollingIntervalMs));
    }
    if (to === BackpressureState.Normal && from === BackpressureState.Batched) {
      this.flushBatch(session);
    }
  }

  private async flushBatch(session: ClientSession): Promise<void> {
    if (!this.pushHandler) return;
    for (const delta of session.flushBatch()) {
      await this.pushHandler(session.id, delta);
      this.emit('DeltaPushed', { subscriptionId: delta.subscriptionId, sessionId: session.id, latencyMs: 0 });
    }
  }

  private cleanupSession(sessionId: UUID): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== SessionStatus.Disconnected) return;
    for (const sub of session.getAllSubscriptions()) this.subscriptionIndex.delete(sub.id);
    session.destroy();
    this.sessions.delete(sessionId);
    this.emit('SessionExpired', { sessionId });
  }

  private emit(eventType: string, payload: unknown): void {
    void this.eventBus.emit(createEvent(eventType, BoundedContext.Subscription, payload));
  }
}
