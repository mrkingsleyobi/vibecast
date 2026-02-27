/**
 * Tests for Driftbase Intelligence Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntelligenceEngine,
  EmbeddingModel,
  ModelState,
  LearningEpoch,
  EpochState,
} from '../../src/intelligence/index.js';
import { EventBus } from '../../src/common/events.js';
import { generateId } from '../../src/common/types.js';

describe('Intelligence Engine', () => {
  let engine: IntelligenceEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new IntelligenceEngine(eventBus);
  });

  describe('Model Registration', () => {
    it('should register an embedding model', async () => {
      const result = await engine.registerModel('test-model', 128);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-model');
        expect(result.value.dimensions).toBe(128);
        expect(result.value.state).toBe(ModelState.Ready);
      }
    });

    it('should reject invalid dimensions', async () => {
      const result = await engine.registerModel('bad', 0);
      expect(result.ok).toBe(false);
    });

    it('should reject empty name', async () => {
      const result = await engine.registerModel('', 128);
      expect(result.ok).toBe(false);
    });

    it('should list models', async () => {
      await engine.registerModel('m1', 64);
      await engine.registerModel('m2', 128);
      expect(engine.listModels()).toHaveLength(2);
    });
  });

  describe('Embedding Generation', () => {
    let modelId: string;

    beforeEach(async () => {
      const result = await engine.registerModel('embed-model', 64);
      if (result.ok) modelId = result.value.modelId;
    });

    it('should generate a single embedding', async () => {
      const result = await engine.generateEmbedding(modelId, 'hello world');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Float32Array);
        expect(result.value.length).toBe(64);
      }
    });

    it('should generate deterministic embeddings', async () => {
      const r1 = await engine.generateEmbedding(modelId, 'test');
      const r2 = await engine.generateEmbedding(modelId, 'test');
      if (r1.ok && r2.ok) {
        expect(Array.from(r1.value)).toEqual(Array.from(r2.value));
      }
    });

    it('should generate different embeddings for different text', async () => {
      const r1 = await engine.generateEmbedding(modelId, 'cat');
      const r2 = await engine.generateEmbedding(modelId, 'dog');
      if (r1.ok && r2.ok) {
        expect(Array.from(r1.value)).not.toEqual(Array.from(r2.value));
      }
    });

    it('should generate batch embeddings', async () => {
      const result = await engine.generateBatchEmbeddings(modelId, ['a', 'b', 'c']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        for (const vec of result.value) {
          expect(vec.length).toBe(64);
        }
      }
    });

    it('should generate unit-length vectors', async () => {
      const result = await engine.generateEmbedding(modelId, 'normalize test');
      if (result.ok) {
        let norm = 0;
        for (const v of result.value) norm += v * v;
        norm = Math.sqrt(norm);
        expect(norm).toBeCloseTo(1.0, 2);
      }
    });

    it('should reject nonexistent model', async () => {
      const result = await engine.generateEmbedding('nonexistent', 'test');
      expect(result.ok).toBe(false);
    });
  });

  describe('GNN Enhancement', () => {
    it('should enhance results with graph context', async () => {
      const results = [
        { id: 'n1', distance: 0.3 },
        { id: 'n2', distance: 0.5 },
        { id: 'n3', distance: 0.7 },
      ];

      const graphContext = {
        nodes: [
          { id: 'n1', embedding: new Float32Array([1, 0, 0]) },
          { id: 'n2', embedding: new Float32Array([0, 1, 0]) },
          { id: 'n3', embedding: new Float32Array([0, 0, 1]) },
        ],
        edges: [[0, 1], [1, 2]] as [number, number][],
        edgeWeights: [0.8, 0.5],
      };

      const enhanced = await engine.enhanceWithGNN(results, graphContext);
      expect(enhanced.ok).toBe(true);
      if (enhanced.ok) {
        expect(enhanced.value).toHaveLength(3);
        // Connected nodes should get a boost (lower distance)
        expect(enhanced.value[0].distance).toBeLessThanOrEqual(results[0].distance);
      }
    });

    it('should handle empty results', async () => {
      const result = await engine.enhanceWithGNN([], { nodes: [], edges: [] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  describe('Learning Epochs', () => {
    let modelId: string;

    beforeEach(async () => {
      const result = await engine.registerModel('learn-model', 32);
      if (result.ok) modelId = result.value.modelId;
    });

    it('should start a learning epoch', async () => {
      const result = await engine.startLearningEpoch(modelId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.state).toBe(EpochState.Collecting);
        expect(result.value.modelId).toBe(modelId);
      }
    });

    it('should complete a learning epoch with improvement', async () => {
      const epochResult = await engine.startLearningEpoch(modelId);
      if (epochResult.ok) {
        const feedback = {
          recallBefore: 0.8,
          recallAfter: 0.85,
          samples: [
            { query: 'test query', clickScore: 0.7, timestamp: Date.now() },
            { query: 'another query', clickScore: 0.9, timestamp: Date.now() },
          ],
        };
        const result = await engine.completeLearningEpoch(epochResult.value.epochId, feedback);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBeCloseTo(0.05, 2);
        }
      }
    });

    it('should reject epoch completion with recall degradation', async () => {
      const epochResult = await engine.startLearningEpoch(modelId);
      if (epochResult.ok) {
        const feedback = {
          recallBefore: 0.9,
          recallAfter: 0.7, // severe degradation
          samples: [{ query: 'test', clickScore: 0.5, timestamp: Date.now() }],
        };
        const result = await engine.completeLearningEpoch(epochResult.value.epochId, feedback);
        expect(result.ok).toBe(false);
      }
    });

    it('should bump model version after successful epoch', async () => {
      const model = engine.getModel(modelId);
      const initialVersion = model?.version ?? 0;

      const epochResult = await engine.startLearningEpoch(modelId);
      if (epochResult.ok) {
        await engine.completeLearningEpoch(epochResult.value.epochId, {
          recallBefore: 0.8,
          recallAfter: 0.82,
          samples: [{ query: 'q', clickScore: 0.5, timestamp: Date.now() }],
        });
      }

      expect(model?.version).toBe(initialVersion + 1);
    });
  });

  describe('Model Performance', () => {
    it('should track model performance metrics', async () => {
      const regResult = await engine.registerModel('perf-model', 32);
      if (regResult.ok) {
        // Generate a few embeddings to accumulate metrics
        await engine.generateEmbedding(regResult.value.modelId, 'text1');
        await engine.generateEmbedding(regResult.value.modelId, 'text2');

        const perfResult = engine.getModelPerformance(regResult.value.modelId);
        expect(perfResult.ok).toBe(true);
        if (perfResult.ok) {
          expect(perfResult.value.totalInferences).toBeGreaterThanOrEqual(2);
          expect(perfResult.value.avgLatencyMs).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Domain Events', () => {
    it('should emit model registered event', async () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      await engine.registerModel('ev-model', 32);
      expect(events).toContain('intelligence.model_registered');
    });

    it('should emit embedding generated event', async () => {
      const result = await engine.registerModel('ev-embed', 32);
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      if (result.ok) {
        await engine.generateEmbedding(result.value.modelId, 'test');
      }
      expect(events).toContain('intelligence.embedding_generated');
    });
  });
});

describe('EmbeddingModel', () => {
  it('should transition through lifecycle states', () => {
    const model = new EmbeddingModel('test', 64);
    expect(model.state).toBe(ModelState.Loading);

    model.activate();
    expect(model.state).toBe(ModelState.Ready);

    model.degrade();
    expect(model.state).toBe(ModelState.Degraded);

    model.recover();
    expect(model.state).toBe(ModelState.Ready);

    model.retire();
    expect(model.state).toBe(ModelState.Retired);
  });

  it('should reject invalid transitions', () => {
    const model = new EmbeddingModel('test', 64);
    expect(model.degrade().ok).toBe(false); // can't degrade from Loading
    model.activate();
    expect(model.activate().ok).toBe(false); // can't activate from Ready
  });
});

describe('LearningEpoch', () => {
  it('should track samples', () => {
    const epoch = new LearningEpoch('model1', 32);
    epoch.addSample({ query: 'test', clickScore: 0.5, timestamp: Date.now() });
    expect(epoch.samples).toHaveLength(1);
  });

  it('should compute EWC penalty', () => {
    const epoch = new LearningEpoch('model1', 4, 0.5);
    epoch.addSample({ query: 'test', clickScore: 0.5, timestamp: Date.now() });
    epoch.startTraining(new Float32Array([1, 2, 3, 4]));

    const newWeights = new Float32Array([1.1, 2.2, 3.3, 4.4]);
    const penalty = epoch.computeEWCPenalty(newWeights);
    expect(penalty).toBeGreaterThanOrEqual(0);
  });

  it('should reject sample addition after training starts', () => {
    const epoch = new LearningEpoch('model1', 4);
    epoch.addSample({ query: 'test', clickScore: 0.5, timestamp: Date.now() });
    epoch.startTraining(new Float32Array(4));
    const result = epoch.addSample({ query: 'late', timestamp: Date.now() });
    expect(result.ok).toBe(false);
  });
});
