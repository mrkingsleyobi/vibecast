/**
 * VibeCast Intelligence Bounded Context — Type Definitions
 *
 * All enums, interfaces, and event type constants for the Intelligence domain.
 * ADR-002: DDD-compliant type separation
 * ADR-007: Intelligence subsystem design
 */
import type { UUID, Vector } from '../common/types.js';

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
