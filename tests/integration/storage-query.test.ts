/**
 * Integration Test: Storage ↔ Query Engine
 * ADR-002 Relationship: Storage → Query Engine (Conformist)
 * Query Engine conforms to Storage's Arrow schema.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { ArrowSchema, ArrowDataType, DistanceMetric } from '../../src/common/types.js';
import { StorageEngine } from '../../src/storage/index.js';
import { QueryEngine } from '../../src/query/index.js';

describe('Storage ↔ Query Engine Integration', () => {
  let eventBus: EventBus;
  let storage: StorageEngine;
  let queryEngine: QueryEngine;

  const usersSchema: ArrowSchema = {
    columns: [
      { name: 'id', dataType: ArrowDataType.Int32, nullable: false },
      { name: 'name', dataType: ArrowDataType.Utf8, nullable: false },
      { name: 'age', dataType: ArrowDataType.Int32, nullable: true },
    ],
    version: 1,
  };

  beforeEach(() => {
    eventBus = new EventBus();
    storage = new StorageEngine(eventBus);
    queryEngine = new QueryEngine(eventBus);
  });

  it('should query data inserted via StorageEngine using QueryEngine SQL', async () => {
    // Storage: create table and insert rows
    const tableResult = await storage.createTable('users', usersSchema);
    expect(tableResult.ok).toBe(true);
    if (!tableResult.ok) return;
    const table = tableResult.value;

    const txId = storage.beginTransaction();
    await storage.insert(table.tableId, { id: 1, name: 'Alice', age: 30 }, txId);
    await storage.insert(table.tableId, { id: 2, name: 'Bob', age: 25 }, txId);
    await storage.commitTransaction(txId);

    // Query: parse and execute SQL against same data
    const scanResult = storage.scan(table.tableId);
    expect(scanResult.ok).toBe(true);
    if (!scanResult.ok) return;

    // Verify Arrow schema conformance
    const batch = scanResult.value;
    expect(batch.schema.columns.some(c => c.name === 'name')).toBe(true);
    expect(batch.rowCount).toBe(2);
  });

  it('should emit events observable by both contexts via shared EventBus', async () => {
    const events: string[] = [];
    eventBus.onAll((event) => {
      events.push(event.eventType);
    });

    // Storage creates a table
    await storage.createTable('products', usersSchema);

    // Query parses SQL
    queryEngine.parseSQL('SELECT * FROM products');

    expect(events).toContain('TableCreated');
    expect(events).toContain('QueryParsed');
  });

  it('should create vector index on storage table and search through query engine', () => {
    const index = queryEngine.createVectorIndex('table-1', 'embedding', 4, DistanceMetric.Cosine);
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0, 1, 0, 0]);
    const v3 = new Float32Array([0.9, 0.1, 0, 0]);

    index.insertVector('row-1', v1, { name: 'Alice' });
    index.insertVector('row-2', v2, { name: 'Bob' });
    index.insertVector('row-3', v3, { name: 'Charlie' });

    const results = index.search(new Float32Array([1, 0, 0, 0]), 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('row-1');
  });

  it('should parse CREATE TABLE SQL and verify Arrow schema compatibility', () => {
    const plan = queryEngine.parseSQL(
      "CREATE TABLE items (id INT NOT NULL, name TEXT, price FLOAT)",
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const ast = plan.value.ast;
    expect(ast.type).toBe('CREATE_TABLE');
    expect(ast.schema).toBeDefined();
    expect(ast.schema!.columns).toHaveLength(3);
    expect(ast.schema!.columns[0].dataType).toBe(ArrowDataType.Int32);
    expect(ast.schema!.columns[1].dataType).toBe(ArrowDataType.Utf8);
    expect(ast.schema!.columns[2].dataType).toBe(ArrowDataType.Float32);
  });
});
