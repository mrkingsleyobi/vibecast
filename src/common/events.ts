/**
 * Driftbase Domain Events — Event Sourcing Foundation
 * All state changes are captured as events per ADR-002
 */
import { UUID, generateId, HLCTimestamp, hlcNow } from './types.js';

// ─── Base Event ─────────────────────────────────────────────

export interface DomainEvent {
  eventId: UUID;
  eventType: string;
  context: BoundedContext;
  timestamp: HLCTimestamp;
  payload: unknown;
  correlationId?: UUID;
  causationId?: UUID;
}

export enum BoundedContext {
  Storage = 'storage',
  Query = 'query',
  Subscription = 'subscription',
  Runtime = 'runtime',
  Consensus = 'consensus',
  Intelligence = 'intelligence',
  Security = 'security',
  Integration = 'integration',
}

// ─── Event Factory ──────────────────────────────────────────

export function createEvent(
  eventType: string,
  context: BoundedContext,
  payload: unknown,
  correlationId?: UUID,
  causationId?: UUID,
): DomainEvent {
  return {
    eventId: generateId(),
    eventType,
    context,
    timestamp: hlcNow(0),
    payload,
    correlationId,
    causationId,
  };
}

// ─── Storage Events ─────────────────────────────────────────

export interface TableCreatedPayload { tableId: UUID; name: string; columnCount: number }
export interface RowInsertedPayload { tableId: UUID; rowId: UUID; txId: string }
export interface RowUpdatedPayload { tableId: UUID; rowId: UUID; txId: string }
export interface RowDeletedPayload { tableId: UUID; rowId: UUID; txId: string }
export interface SnapshotCreatedPayload { tableId: UUID; snapshotId: UUID; rowCount: number }
export interface WALTruncatedPayload { segmentId: number; upToLSN: string }

// ─── Query Events ───────────────────────────────────────────

export interface QueryParsedPayload { planId: UUID; sql: string }
export interface PlanOptimizedPayload { planId: UUID; estimatedCost: number }
export interface VectorSearchExecutedPayload { indexId: UUID; k: number; durationUs: number }
export interface HybridResultsMergedPayload { planId: UUID; resultCount: number }

// ─── Subscription Events ────────────────────────────────────

export interface ClientConnectedPayload { sessionId: UUID; protocol: string }
export interface SubscriptionCreatedPayload { subscriptionId: UUID; sessionId: UUID }
export interface DeltaComputedPayload { subscriptionId: UUID; addedCount: number; removedCount: number }
export interface DeltaPushedPayload { subscriptionId: UUID; sessionId: UUID; latencyMs: number }
export interface ClientDisconnectedPayload { sessionId: UUID; reason: string }

// ─── Consensus Events ───────────────────────────────────────

export interface LeaderElectedPayload { nodeId: number; term: number }
export interface LogAppendedPayload { nodeId: number; index: number; term: number }
export interface CRDTMergedPayload { documentId: UUID; fromNode: number; operations: number }

// ─── Intelligence Events ────────────────────────────────────

export interface EmbeddingGeneratedPayload { modelId: UUID; dimensions: number; durationMs: number }
export interface ModelUpdatedPayload { modelId: UUID; version: string }
export interface LearningEpochCompletedPayload { epochId: UUID; recallImprovement: number }

// ─── Security Events ────────────────────────────────────────

export interface PrincipalAuthenticatedPayload { principalId: UUID; method: string }
export interface ClaimsIssuedPayload { principalId: UUID; claimsSetId: UUID }
export interface AccessDeniedPayload { principalId: UUID; resource: string; operation: string }
export interface AuditRecordedPayload { principalId: UUID; action: string }

// ─── Event Bus ──────────────────────────────────────────────

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private globalHandlers: EventHandler[] = [];
  private eventLog: DomainEvent[] = [];

  on(eventType: string, handler: EventHandler): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  onAll(handler: EventHandler): () => void {
    this.globalHandlers.push(handler);
    return () => {
      const idx = this.globalHandlers.indexOf(handler);
      if (idx >= 0) this.globalHandlers.splice(idx, 1);
    };
  }

  async emit(event: DomainEvent): Promise<void> {
    this.eventLog.push(event);
    const handlers = this.handlers.get(event.eventType) ?? [];
    const all = [...handlers, ...this.globalHandlers];
    await Promise.all(all.map(h => h(event)));
  }

  getLog(): ReadonlyArray<DomainEvent> {
    return this.eventLog;
  }

  clear(): void {
    this.eventLog = [];
  }
}
