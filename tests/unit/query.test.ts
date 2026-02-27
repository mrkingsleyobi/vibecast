/**
 * Tests for VibeCast Query Engine Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  QueryEngine,
  VectorIndex,
  parseSQL,
  cosineDistance,
  l2Distance,
  innerProductDistance,
} from '../../src/query/index.js';
import { EventBus } from '../../src/common/events.js';
import { DistanceMetric, ArrowDataType } from '../../src/common/types.js';

describe('Query Engine', () => {
  let engine: QueryEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new QueryEngine(eventBus);
  });

  describe('SQL Parsing', () => {
    it('should parse SELECT statement', () => {
      const result = engine.parseSQL('SELECT id, name FROM users WHERE id = 1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sql).toBe('SELECT id, name FROM users WHERE id = 1');
        expect(result.value.ast.type).toBe('SELECT');
        expect(result.value.ast.table).toBe('users');
      }
    });

    it('should parse INSERT statement', () => {
      const result = engine.parseSQL("INSERT INTO users (id, name) VALUES (1, 'alice')");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ast.type).toBe('INSERT');
        expect(result.value.ast.table).toBe('users');
      }
    });

    it('should parse CREATE TABLE statement', () => {
      const result = engine.parseSQL('CREATE TABLE users (id INT, name TEXT)');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ast.type).toBe('CREATE_TABLE');
      }
    });

    it('should parse UPDATE statement', () => {
      const result = engine.parseSQL("UPDATE users SET name = 'bob' WHERE id = 1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ast.type).toBe('UPDATE');
      }
    });

    it('should parse DELETE statement', () => {
      const result = engine.parseSQL('DELETE FROM users WHERE id = 1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ast.type).toBe('DELETE');
      }
    });

    it('should parse VECTOR_SEARCH statement', () => {
      const result = engine.parseSQL(
        'SELECT VECTOR_SEARCH(embedding, [1.0, 0.0, 0.0], 5) FROM docs',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ast.type).toBe('VECTOR_SEARCH');
        expect(result.value.ast.vectorSearch?.k).toBe(5);
      }
    });

    it('should return error for invalid SQL', () => {
      const result = engine.parseSQL('INVALID QUERY');
      expect(result.ok).toBe(false);
    });

    it('should strip trailing semicolons', () => {
      const result = engine.parseSQL('SELECT * FROM users;');
      expect(result.ok).toBe(true);
    });
  });

  describe('Query Execution', () => {
    it('should execute CREATE TABLE and INSERT', () => {
      const createPlan = parseSQL('CREATE TABLE test (id INT, name TEXT)');
      const createResult = engine.executeQuery(createPlan);
      expect(createResult.ok).toBe(true);

      const insertPlan = parseSQL("INSERT INTO test (id, name) VALUES (1, 'alice')");
      const insertResult = engine.executeQuery(insertPlan);
      expect(insertResult.ok).toBe(true);

      const selectPlan = parseSQL('SELECT * FROM test');
      const selectResult = engine.executeQuery(selectPlan);
      expect(selectResult.ok).toBe(true);
    });

    it('should execute SELECT with WHERE clause', () => {
      const createPlan = parseSQL('CREATE TABLE items (id INT, value INT)');
      engine.executeQuery(createPlan);
      engine.executeQuery(parseSQL('INSERT INTO items (id, value) VALUES (1, 10)'));
      engine.executeQuery(parseSQL('INSERT INTO items (id, value) VALUES (2, 20)'));

      const selectPlan = parseSQL('SELECT * FROM items WHERE value = 20');
      const result = engine.executeQuery(selectPlan);
      expect(result.ok).toBe(true);
    });

    it('should execute DELETE', () => {
      const createPlan = parseSQL('CREATE TABLE del (id INT)');
      engine.executeQuery(createPlan);
      engine.executeQuery(parseSQL('INSERT INTO del (id) VALUES (1)'));

      const deletePlan = parseSQL('DELETE FROM del WHERE id = 1');
      const result = engine.executeQuery(deletePlan);
      expect(result.ok).toBe(true);
    });

    it('should reject operations on nonexistent tables', () => {
      const plan = parseSQL('SELECT * FROM nonexistent');
      const result = engine.executeQuery(plan);
      expect(result.ok).toBe(false);
    });
  });
});

describe('Vector Index (HNSW)', () => {
  describe('Insert and Search', () => {
    it('should insert and find vectors', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      index.insertVector('v1', new Float32Array([1, 0, 0, 0]));
      index.insertVector('v2', new Float32Array([0, 1, 0, 0]));
      index.insertVector('v3', new Float32Array([0.9, 0.1, 0, 0]));

      const results = index.search(new Float32Array([1, 0, 0, 0]), 2);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('v1');
      expect(results[0].distance).toBeCloseTo(0, 1);
    });

    it('should respect k parameter', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      for (let i = 0; i < 10; i++) {
        const vec = new Float32Array(4);
        vec[i % 4] = 1;
        index.insertVector(`v${i}`, vec);
      }

      const results = index.search(new Float32Array([1, 0, 0, 0]), 3);
      expect(results).toHaveLength(3);
    });

    it('should return results sorted by distance ascending', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      index.insertVector('v1', new Float32Array([1, 0, 0, 0]));
      index.insertVector('v2', new Float32Array([0.5, 0.5, 0, 0]));
      index.insertVector('v3', new Float32Array([0, 0, 0, 1]));

      const results = index.search(new Float32Array([1, 0, 0, 0]), 3);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should return empty for empty index', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      const results = index.search(new Float32Array([1, 0, 0, 0]), 5);
      expect(results).toHaveLength(0);
    });

    it('should reject dimension mismatch', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      expect(() => {
        index.insertVector('v1', new Float32Array([1, 0]));
      }).toThrow('dimension mismatch');
    });
  });

  describe('Distance Metrics', () => {
    it('should compute cosine distance correctly', () => {
      const index = new VectorIndex('table1', 'embedding', 3, DistanceMetric.Cosine);
      index.insertVector('same', new Float32Array([1, 0, 0]));
      index.insertVector('orthogonal', new Float32Array([0, 1, 0]));
      index.insertVector('opposite', new Float32Array([-1, 0, 0]));

      const results = index.search(new Float32Array([1, 0, 0]), 3);
      expect(results[0].distance).toBeCloseTo(0, 1);
      expect(results[1].distance).toBeCloseTo(1, 1);
      expect(results[2].distance).toBeCloseTo(2, 1);
    });

    it('should compute L2 distance correctly', () => {
      const index = new VectorIndex('table1', 'embedding', 2, DistanceMetric.L2);
      index.insertVector('origin', new Float32Array([0, 0]));
      index.insertVector('near', new Float32Array([1, 0]));
      index.insertVector('far', new Float32Array([3, 4]));

      const results = index.search(new Float32Array([0, 0]), 3);
      expect(results[0].id).toBe('origin');
      expect(results[0].distance).toBeCloseTo(0, 5);
      expect(results[1].id).toBe('near');
      expect(results[1].distance).toBeCloseTo(1, 5);
      expect(results[2].id).toBe('far');
      expect(results[2].distance).toBeCloseTo(5, 5);
    });
  });

  describe('Delete', () => {
    it('should remove vectors from index', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      index.insertVector('v1', new Float32Array([1, 0, 0, 0]));
      index.insertVector('v2', new Float32Array([0, 1, 0, 0]));

      const deleted = index.deleteVector('v1');
      expect(deleted).toBe(true);

      const results = index.search(new Float32Array([1, 0, 0, 0]), 10);
      expect(results.every(r => r.id !== 'v1')).toBe(true);
    });

    it('should return false for nonexistent vector', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      expect(index.deleteVector('nonexistent')).toBe(false);
    });
  });

  describe('Filtered Search', () => {
    it('should filter results by data predicate', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      index.insertVector('v1', new Float32Array([1, 0, 0, 0]), { category: 'a' });
      index.insertVector('v2', new Float32Array([0.9, 0.1, 0, 0]), { category: 'b' });
      index.insertVector('v3', new Float32Array([0.8, 0.2, 0, 0]), { category: 'a' });

      const results = index.searchFiltered(
        new Float32Array([1, 0, 0, 0]),
        10,
        (data) => data?.category === 'a',
      );
      expect(results.every(r => r.data?.category === 'a')).toBe(true);
    });
  });

  describe('Size tracking', () => {
    it('should track index size', () => {
      const index = new VectorIndex('table1', 'embedding', 4, DistanceMetric.Cosine);
      expect(index.size).toBe(0);
      index.insertVector('v1', new Float32Array([1, 0, 0, 0]));
      index.insertVector('v2', new Float32Array([0, 1, 0, 0]));
      expect(index.size).toBe(2);
      index.deleteVector('v1');
      expect(index.size).toBe(1);
    });
  });

  describe('Scale', () => {
    it('should handle 1000 vectors', () => {
      const dim = 32;
      const index = new VectorIndex('table1', 'embedding', dim, DistanceMetric.Cosine);
      for (let i = 0; i < 1000; i++) {
        const vec = new Float32Array(dim);
        for (let j = 0; j < dim; j++) {
          vec[j] = Math.sin(i * 0.1 + j);
        }
        index.insertVector(`v${i}`, vec);
      }

      const query = new Float32Array(dim);
      query[0] = 1;
      const start = performance.now();
      const results = index.search(query, 10);
      const elapsed = performance.now() - start;

      expect(results).toHaveLength(10);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});

describe('Distance Functions', () => {
  it('cosineDistance: identical vectors = 0', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineDistance(a, a)).toBeCloseTo(0, 5);
  });

  it('cosineDistance: orthogonal vectors = 1', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineDistance(a, b)).toBeCloseTo(1, 5);
  });

  it('l2Distance: same point = 0', () => {
    const a = new Float32Array([3, 4]);
    expect(l2Distance(a, a)).toBeCloseTo(0, 5);
  });

  it('l2Distance: known distance', () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([3, 4]);
    expect(l2Distance(a, b)).toBeCloseTo(5, 5);
  });

  it('innerProductDistance: negated dot product', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0]);
    expect(innerProductDistance(a, b)).toBeCloseTo(-1, 5);
  });
});
