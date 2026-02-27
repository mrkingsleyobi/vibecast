/**
 * VibeCast Intelligence Bounded Context
 *
 * Implements embedding generation, GNN-enhanced search, and self-learning
 * with EWC++ (Elastic Weight Consolidation) to prevent catastrophic forgetting.
 *
 * ADR-007: Intelligence subsystem design
 */
import {
  UUID,
  Vector,
  generateId,
  Result,
  ok,
  err,
  SearchResult,
} from '../common/types.js';
import {
  DomainEvent,
  BoundedContext,
  createEvent,
  EventBus,
  EmbeddingGeneratedPayload,
  ModelUpdatedPayload,
  LearningEpochCompletedPayload,
} from '../common/events.js';

// ─── Model State Machine ────────────────────────────────────

export enum ModelState {
  Loading = 'loading',
  Ready = 'ready',
  Degraded = 'degraded',
  Retired = 'retired',
}

// ─── Learning Epoch State Machine ───────────────────────────

export enum EpochState {
  Collecting = 'collecting',
  Training = 'training',
  Validating = 'validating',
  Applied = 'applied',
  RolledBack = 'rolled_back',
}

// ─── Interfaces ─────────────────────────────────────────────

export interface PerformanceMetrics {
  avgLatencyMs: number;
  throughput: number;
  qualityScore: number;
  totalInferences: number;
  lastUpdated: number;
}

export interface EWCState {
  fisherDiagonal: Float32Array;
  previousWeights: Float32Array;
  lambda: number;
}

export interface TrainingSample {
  query: string;
  positiveId?: UUID;
  negativeIds?: UUID[];
  clickScore?: number;
  timestamp: number;
}

export interface GraphContext {
  nodes: { id: UUID; embedding?: Vector; label?: string }[];
  edges: [number, number][];
  edgeWeights?: number[];
}

export interface GNNEnhancedPayload {
  resultCount: number;
  avgBoost: number;
}

export interface ModelRegistration {
  name: string;
  dimensions: number;
}

export interface LearningFeedback {
  recallBefore: number;
  recallAfter: number;
  samples: TrainingSample[];
}

// ─── Intelligence Event Types ───────────────────────────────

export const IntelligenceEvents = {
  EmbeddingGenerated: 'intelligence.embedding_generated',
  ModelRegistered: 'intelligence.model_registered',
  ModelUpdated: 'intelligence.model_updated',
  ModelStateChanged: 'intelligence.model_state_changed',
  GNNEnhanced: 'intelligence.gnn_enhanced',
  LearningEpochStarted: 'intelligence.learning_epoch_started',
  LearningEpochCompleted: 'intelligence.learning_epoch_completed',
} as const;

// ─── Deterministic Embedding Hash ───────────────────────────

/**
 * Produces a deterministic unit-length float32 vector from text input.
 * Uses a simple but consistent hash-based approach (simulating ONNX inference).
 */
function hashTextToVector(text: string, dimensions: number): Vector {
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

// ─── LearningEpoch Aggregate Root ───────────────────────────

export class LearningEpoch {
  readonly epochId: UUID;
  readonly modelId: UUID;
  private _state: EpochState;
  private _samples: TrainingSample[] = [];
  private _ewc: EWCState;
  private _recallBefore: number = 0;
  private _recallAfter: number = 0;
  private _startedAt: number;
  private _completedAt: number | null = null;

  constructor(modelId: UUID, dimensions: number, lambda: number = 0.5) {
    this.epochId = generateId();
    this.modelId = modelId;
    this._state = EpochState.Collecting;
    this._startedAt = Date.now();
    this._ewc = {
      fisherDiagonal: new Float32Array(dimensions),
      previousWeights: new Float32Array(dimensions),
      lambda,
    };
  }

  get state(): EpochState {
    return this._state;
  }

  get samples(): ReadonlyArray<TrainingSample> {
    return this._samples;
  }

  get ewc(): Readonly<EWCState> {
    return this._ewc;
  }

  get recallBefore(): number {
    return this._recallBefore;
  }

  get recallAfter(): number {
    return this._recallAfter;
  }

  get startedAt(): number {
    return this._startedAt;
  }

  get completedAt(): number | null {
    return this._completedAt;
  }

  /** Add a training sample during the Collecting phase. */
  addSample(sample: TrainingSample): Result<void> {
    if (this._state !== EpochState.Collecting) {
      return err(new Error(`Cannot add samples in state: ${this._state}`));
    }
    this._samples.push(sample);
    return ok(undefined);
  }

  /** Begin training: compute EWC++ Fisher diagonal approximation. */
  startTraining(currentWeights: Float32Array): Result<void> {
    if (this._state !== EpochState.Collecting) {
      return err(new Error(`Cannot start training from state: ${this._state}`));
    }
    if (this._samples.length === 0) {
      return err(new Error('No training samples collected'));
    }

    this._state = EpochState.Training;

    // Store current weights as the reference for EWC++ penalty
    this._ewc.previousWeights = new Float32Array(currentWeights);

    // Approximate Fisher diagonal from sample gradients (simulated)
    this.computeFisherDiagonal();

    return ok(undefined);
  }

  /**
   * Simulated Fisher Information Matrix diagonal approximation.
   * In production this would use actual gradient squares from the loss.
   */
  private computeFisherDiagonal(): void {
    const fisher = this._ewc.fisherDiagonal;
    const n = this._samples.length;

    for (let d = 0; d < fisher.length; d++) {
      // Simulate gradient importance from samples
      let importance = 0;
      for (let s = 0; s < n; s++) {
        const sample = this._samples[s];
        const queryHash = simpleHash(sample.query);
        // Gradient magnitude approximation per dimension
        const grad = Math.sin(queryHash * (d + 1) * 0.001) * (sample.clickScore ?? 0.5);
        importance += grad * grad;
      }
      fisher[d] = importance / n;
    }
  }

  /** Move to validation phase with recall measurements. */
  validate(recallBefore: number, recallAfter: number): Result<void> {
    if (this._state !== EpochState.Training) {
      return err(new Error(`Cannot validate from state: ${this._state}`));
    }
    this._state = EpochState.Validating;
    this._recallBefore = recallBefore;
    this._recallAfter = recallAfter;
    return ok(undefined);
  }

  /** Apply the epoch results if validation passed. */
  apply(): Result<number> {
    if (this._state !== EpochState.Validating) {
      return err(new Error(`Cannot apply from state: ${this._state}`));
    }
    const improvement = this._recallAfter - this._recallBefore;
    if (improvement < -0.05) {
      // Catastrophic forgetting detected: auto-rollback
      return err(new Error(
        `Recall degraded by ${(-improvement * 100).toFixed(1)}%, refusing to apply`,
      ));
    }
    this._state = EpochState.Applied;
    this._completedAt = Date.now();
    return ok(improvement);
  }

  /** Roll back the epoch. */
  rollback(): Result<void> {
    if (this._state === EpochState.Applied || this._state === EpochState.RolledBack) {
      return err(new Error(`Cannot rollback from state: ${this._state}`));
    }
    this._state = EpochState.RolledBack;
    this._completedAt = Date.now();
    return ok(undefined);
  }

  /**
   * Compute the EWC++ regularization penalty.
   * penalty = (lambda / 2) * sum( F_i * (theta_i - theta*_i)^2 )
   */
  computeEWCPenalty(newWeights: Float32Array): number {
    const { fisherDiagonal, previousWeights, lambda } = this._ewc;
    let penalty = 0;
    const len = Math.min(fisherDiagonal.length, newWeights.length, previousWeights.length);
    for (let i = 0; i < len; i++) {
      const diff = newWeights[i] - previousWeights[i];
      penalty += fisherDiagonal[i] * diff * diff;
    }
    return (lambda / 2) * penalty;
  }
}

// ─── IntelligenceEngine Service ─────────────────────────────

export class IntelligenceEngine {
  private models: Map<UUID, EmbeddingModel> = new Map();
  private epochs: Map<UUID, LearningEpoch> = new Map();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Register a new embedding model and mark it ready. */
  async registerModel(name: string, dimensions: number): Promise<Result<EmbeddingModel>> {
    if (dimensions <= 0 || !Number.isInteger(dimensions)) {
      return err(new Error('Dimensions must be a positive integer'));
    }
    if (!name || name.trim().length === 0) {
      return err(new Error('Model name must not be empty'));
    }

    const model = new EmbeddingModel(name, dimensions);
    const activateResult = model.activate();
    if (!activateResult.ok) {
      return err(activateResult.error);
    }

    this.models.set(model.modelId, model);

    await this.eventBus.emit(
      createEvent(IntelligenceEvents.ModelRegistered, BoundedContext.Intelligence, {
        modelId: model.modelId,
        name,
        dimensions,
        version: model.version,
      }),
    );

    // Flush model domain events
    for (const event of model.drainEvents()) {
      await this.eventBus.emit(event);
    }

    return ok(model);
  }

  /** Generate a single embedding vector for the given text. */
  async generateEmbedding(modelId: UUID, text: string): Promise<Result<Vector>> {
    const model = this.models.get(modelId);
    if (!model) {
      return err(new Error(`Model not found: ${modelId}`));
    }

    const start = performance.now();
    const result = model.generateEmbedding(text);
    const durationMs = performance.now() - start;

    if (result.ok) {
      const payload: EmbeddingGeneratedPayload = {
        modelId,
        dimensions: model.dimensions,
        durationMs: Math.round(durationMs * 100) / 100,
      };
      await this.eventBus.emit(
        createEvent(IntelligenceEvents.EmbeddingGenerated, BoundedContext.Intelligence, payload),
      );
    }

    return result;
  }

  /** Generate embeddings for a batch of texts. */
  async generateBatchEmbeddings(modelId: UUID, texts: string[]): Promise<Result<Vector[]>> {
    const model = this.models.get(modelId);
    if (!model) {
      return err(new Error(`Model not found: ${modelId}`));
    }

    const vectors: Vector[] = [];
    const start = performance.now();

    for (const text of texts) {
      const result = model.generateEmbedding(text);
      if (!result.ok) {
        return err(result.error);
      }
      vectors.push(result.value);
    }

    const durationMs = performance.now() - start;

    const payload: EmbeddingGeneratedPayload = {
      modelId,
      dimensions: model.dimensions,
      durationMs: Math.round(durationMs * 100) / 100,
    };
    await this.eventBus.emit(
      createEvent(IntelligenceEvents.EmbeddingGenerated, BoundedContext.Intelligence, payload),
    );

    return ok(vectors);
  }

  /**
   * Enhance search results using Graph Neural Network message-passing.
   *
   * For each result, if it appears in the graph, we aggregate neighbor embeddings
   * to boost the result's score via a single-layer GNN-like update.
   */
  async enhanceWithGNN(
    results: SearchResult[],
    graphContext: GraphContext,
  ): Promise<Result<SearchResult[]>> {
    if (results.length === 0) {
      return ok([]);
    }

    // Build adjacency lookup from graph context
    const adjacency = new Map<string, { neighborIdx: number; weight: number }[]>();
    const nodeById = new Map<string, number>();
    for (let i = 0; i < graphContext.nodes.length; i++) {
      nodeById.set(graphContext.nodes[i].id, i);
      adjacency.set(graphContext.nodes[i].id, []);
    }

    for (let e = 0; e < graphContext.edges.length; e++) {
      const [srcIdx, dstIdx] = graphContext.edges[e];
      const srcId = graphContext.nodes[srcIdx]?.id;
      const dstId = graphContext.nodes[dstIdx]?.id;
      const weight = graphContext.edgeWeights?.[e] ?? 1.0;

      if (srcId && dstId) {
        adjacency.get(srcId)?.push({ neighborIdx: dstIdx, weight });
        adjacency.get(dstId)?.push({ neighborIdx: srcIdx, weight });
      }
    }

    // Enhance each search result
    let totalBoost = 0;
    const enhanced: SearchResult[] = results.map((result) => {
      const neighbors = adjacency.get(result.id);
      if (!neighbors || neighbors.length === 0) {
        return { ...result };
      }

      // Compute GNN attention-weighted boost from neighbors
      let boost = 0;
      let totalWeight = 0;

      for (const neighbor of neighbors) {
        const neighborNode = graphContext.nodes[neighbor.neighborIdx];
        if (neighborNode?.embedding) {
          // Neighbor embedding norm as a relevance signal
          let embNorm = 0;
          for (let d = 0; d < neighborNode.embedding.length; d++) {
            embNorm += neighborNode.embedding[d] * neighborNode.embedding[d];
          }
          embNorm = Math.sqrt(embNorm);
          boost += embNorm * neighbor.weight;
          totalWeight += neighbor.weight;
        } else {
          // Structural boost even without embeddings
          boost += 0.1 * neighbor.weight;
          totalWeight += neighbor.weight;
        }
      }

      if (totalWeight > 0) {
        boost /= totalWeight;
      }

      // Apply GNN boost: reduce distance proportionally
      const boostFactor = Math.max(0.5, 1 - boost * 0.2);
      const newDistance = result.distance * boostFactor;
      totalBoost += 1 - boostFactor;

      return {
        ...result,
        distance: newDistance,
        data: {
          ...result.data,
          gnnBoost: 1 - boostFactor,
          gnnNeighborCount: neighbors.length,
        },
      };
    });

    // Sort by enhanced distance (ascending = most similar first)
    enhanced.sort((a, b) => a.distance - b.distance);

    const avgBoost = results.length > 0 ? totalBoost / results.length : 0;
    const gnnPayload: GNNEnhancedPayload = {
      resultCount: enhanced.length,
      avgBoost: Math.round(avgBoost * 10000) / 10000,
    };
    await this.eventBus.emit(
      createEvent(IntelligenceEvents.GNNEnhanced, BoundedContext.Intelligence, gnnPayload),
    );

    return ok(enhanced);
  }

  /** Start a new learning epoch for a model. */
  async startLearningEpoch(modelId: UUID): Promise<Result<LearningEpoch>> {
    const model = this.models.get(modelId);
    if (!model) {
      return err(new Error(`Model not found: ${modelId}`));
    }
    if (model.state === ModelState.Retired) {
      return err(new Error('Cannot learn on a retired model'));
    }

    const epoch = new LearningEpoch(modelId, model.dimensions);
    this.epochs.set(epoch.epochId, epoch);

    await this.eventBus.emit(
      createEvent(IntelligenceEvents.LearningEpochStarted, BoundedContext.Intelligence, {
        epochId: epoch.epochId,
        modelId,
      }),
    );

    return ok(epoch);
  }

  /**
   * Complete a learning epoch with feedback.
   * Runs the training/validation/apply pipeline with EWC++ protection.
   */
  async completeLearningEpoch(
    epochId: UUID,
    feedback: LearningFeedback,
  ): Promise<Result<number>> {
    const epoch = this.epochs.get(epochId);
    if (!epoch) {
      return err(new Error(`Epoch not found: ${epochId}`));
    }

    const model = this.models.get(epoch.modelId);
    if (!model) {
      return err(new Error(`Model not found for epoch: ${epoch.modelId}`));
    }

    // 1. Add feedback samples to the epoch
    for (const sample of feedback.samples) {
      const addResult = epoch.addSample(sample);
      if (!addResult.ok) {
        return err(addResult.error);
      }
    }

    // 2. Start training with simulated current weights
    const currentWeights = hashTextToVector('model-weights-' + model.modelId, model.dimensions);
    const trainResult = epoch.startTraining(currentWeights);
    if (!trainResult.ok) {
      await this.rollbackEpoch(epoch);
      return err(trainResult.error);
    }

    // 3. Simulate micro-LoRA weight update (SONA adaptation)
    const updatedWeights = new Float32Array(currentWeights.length);
    for (let i = 0; i < currentWeights.length; i++) {
      // Small perturbation simulating learned update
      const delta = Math.sin(i * 0.1) * 0.01;
      updatedWeights[i] = currentWeights[i] + delta;
    }

    // 4. Check EWC++ penalty before applying
    const penalty = epoch.computeEWCPenalty(updatedWeights);
    const penaltyThreshold = 10.0;

    if (penalty > penaltyThreshold) {
      await this.rollbackEpoch(epoch);
      return err(new Error(
        `EWC++ penalty too high (${penalty.toFixed(4)}), would cause catastrophic forgetting`,
      ));
    }

    // 5. Validate recall
    const validateResult = epoch.validate(feedback.recallBefore, feedback.recallAfter);
    if (!validateResult.ok) {
      await this.rollbackEpoch(epoch);
      return err(validateResult.error);
    }

    // 6. Apply
    const applyResult = epoch.apply();
    if (!applyResult.ok) {
      await this.rollbackEpoch(epoch);
      return err(applyResult.error);
    }

    const improvement = applyResult.value;
    model.bumpVersion();
    model.updateQualityScore(Math.min(1, model.performance.qualityScore + improvement));

    // Emit completion events
    const completedPayload: LearningEpochCompletedPayload = {
      epochId: epoch.epochId,
      recallImprovement: Math.round(improvement * 10000) / 10000,
    };
    await this.eventBus.emit(
      createEvent(IntelligenceEvents.LearningEpochCompleted, BoundedContext.Intelligence, completedPayload),
    );

    const updatedPayload: ModelUpdatedPayload = {
      modelId: model.modelId,
      version: String(model.version),
    };
    await this.eventBus.emit(
      createEvent(IntelligenceEvents.ModelUpdated, BoundedContext.Intelligence, updatedPayload),
    );

    return ok(improvement);
  }

  /** Get performance metrics for a registered model. */
  getModelPerformance(modelId: UUID): Result<PerformanceMetrics> {
    const model = this.models.get(modelId);
    if (!model) {
      return err(new Error(`Model not found: ${modelId}`));
    }
    return ok(model.performance);
  }

  /** Retrieve a registered model by ID. */
  getModel(modelId: UUID): EmbeddingModel | undefined {
    return this.models.get(modelId);
  }

  /** Retrieve a learning epoch by ID. */
  getEpoch(epochId: UUID): LearningEpoch | undefined {
    return this.epochs.get(epochId);
  }

  /** List all registered models. */
  listModels(): EmbeddingModel[] {
    return Array.from(this.models.values());
  }

  private async rollbackEpoch(epoch: LearningEpoch): Promise<void> {
    epoch.rollback();
    await this.eventBus.emit(
      createEvent(IntelligenceEvents.LearningEpochCompleted, BoundedContext.Intelligence, {
        epochId: epoch.epochId,
        recallImprovement: 0,
        rolledBack: true,
      }),
    );
  }
}

// ─── Utility ────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash;
}
