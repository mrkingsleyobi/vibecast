/**
 * VibeCast Intelligence Bounded Context — EmbeddingModel Aggregate Root
 *
 * Contains the EmbeddingModel aggregate root along with its supporting
 * hash-based embedding utilities (hashTextToVector, simpleHash).
 *
 * ADR-002: DDD-compliant bounded context separation
 * ADR-007: Intelligence subsystem design
 */
import type { UUID, Vector } from '../common/types.js';
import { generateId, Result, ok, err } from '../common/types.js';
import type { DomainEvent } from '../common/events.js';
import { BoundedContext, createEvent } from '../common/events.js';
import { ModelState, IntelligenceEvents } from './types.js';
import type { PerformanceMetrics } from './types.js';

// ─── Deterministic Embedding Hash ───────────────────────────

/**
 * Produces a deterministic unit-length float32 vector from text input.
 * Uses a simple but consistent hash-based approach (simulating ONNX inference).
 */
export function hashTextToVector(text: string, dimensions: number): Vector {
  const vec = new Float32Array(dimensions);

  // Seed from text using FNV-1a-inspired hashing
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x811c9dc5);
  }

  // Fill each dimension deterministically
  for (let d = 0; d < dimensions; d++) {
    // Mix dimension index into the hash state
    let seed = h1 ^ (d * 0x9e3779b9);
    seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
    seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
    seed = seed ^ (seed >>> 16);

    let seed2 = h2 ^ ((d + 1) * 0x517cc1b7);
    seed2 = Math.imul(seed2 ^ (seed2 >>> 16), 0x85ebca6b);
    seed2 = seed2 ^ (seed2 >>> 13);

    // Combine seeds and map to [-1, 1]
    const combined = (seed ^ seed2) >>> 0;
    vec[d] = (combined / 0xffffffff) * 2 - 1;
  }

  // Normalize to unit length
  let norm = 0;
  for (let d = 0; d < dimensions; d++) {
    norm += vec[d] * vec[d];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let d = 0; d < dimensions; d++) {
      vec[d] /= norm;
    }
  }

  return vec;
}

// ─── Utility ────────────────────────────────────────────────

export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash;
}

// ─── EmbeddingModel Aggregate Root ──────────────────────────

export class EmbeddingModel {
  readonly modelId: UUID;
  readonly name: string;
  readonly dimensions: number;
  private _version: number;
  private _state: ModelState;
  private _performance: PerformanceMetrics;
  private _createdAt: number;
  private _events: DomainEvent[] = [];

  constructor(name: string, dimensions: number) {
    this.modelId = generateId();
    this.name = name;
    this.dimensions = dimensions;
    this._version = 1;
    this._state = ModelState.Loading;
    this._createdAt = Date.now();
    this._performance = {
      avgLatencyMs: 0,
      throughput: 0,
      qualityScore: 1.0,
      totalInferences: 0,
      lastUpdated: this._createdAt,
    };
  }

  get version(): number {
    return this._version;
  }

  get state(): ModelState {
    return this._state;
  }

  get performance(): Readonly<PerformanceMetrics> {
    return { ...this._performance };
  }

  get createdAt(): number {
    return this._createdAt;
  }

  /** Transition the model to Ready after loading completes. */
  activate(): Result<void> {
    if (this._state !== ModelState.Loading) {
      return err(new Error(`Cannot activate model in state: ${this._state}`));
    }
    this._state = ModelState.Ready;
    this._events.push(
      createEvent(IntelligenceEvents.ModelStateChanged, BoundedContext.Intelligence, {
        modelId: this.modelId,
        from: ModelState.Loading,
        to: ModelState.Ready,
      }),
    );
    return ok(undefined);
  }

  /** Mark the model as degraded (e.g. quality below threshold). */
  degrade(): Result<void> {
    if (this._state !== ModelState.Ready) {
      return err(new Error(`Cannot degrade model in state: ${this._state}`));
    }
    this._state = ModelState.Degraded;
    this._events.push(
      createEvent(IntelligenceEvents.ModelStateChanged, BoundedContext.Intelligence, {
        modelId: this.modelId,
        from: ModelState.Ready,
        to: ModelState.Degraded,
      }),
    );
    return ok(undefined);
  }

  /** Retire the model permanently. */
  retire(): Result<void> {
    if (this._state === ModelState.Retired) {
      return err(new Error('Model already retired'));
    }
    const prev = this._state;
    this._state = ModelState.Retired;
    this._events.push(
      createEvent(IntelligenceEvents.ModelStateChanged, BoundedContext.Intelligence, {
        modelId: this.modelId,
        from: prev,
        to: ModelState.Retired,
      }),
    );
    return ok(undefined);
  }

  /** Recover a degraded model back to Ready. */
  recover(): Result<void> {
    if (this._state !== ModelState.Degraded) {
      return err(new Error(`Cannot recover model in state: ${this._state}`));
    }
    this._state = ModelState.Ready;
    return ok(undefined);
  }

  /** Generate a single embedding vector from text. */
  generateEmbedding(text: string): Result<Vector> {
    if (this._state !== ModelState.Ready && this._state !== ModelState.Degraded) {
      return err(new Error(`Model not available for inference (state: ${this._state})`));
    }

    const start = performance.now();
    const vector = hashTextToVector(text, this.dimensions);
    const elapsed = performance.now() - start;

    this.recordLatency(elapsed);
    return ok(vector);
  }

  /** Increment version after a learning update. */
  bumpVersion(): void {
    this._version += 1;
  }

  /** Record a latency measurement and update metrics. */
  recordLatency(latencyMs: number): void {
    const m = this._performance;
    const total = m.totalInferences;
    m.avgLatencyMs = (m.avgLatencyMs * total + latencyMs) / (total + 1);
    m.totalInferences = total + 1;
    m.throughput = 1000 / (m.avgLatencyMs || 1);
    m.lastUpdated = Date.now();
  }

  /** Update quality score (0..1). */
  updateQualityScore(score: number): void {
    this._performance.qualityScore = Math.max(0, Math.min(1, score));
    this._performance.lastUpdated = Date.now();
  }

  /** Drain pending domain events. */
  drainEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }
}
