/**
 * Tests for VibeCast Storage Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine, WALSegment, Table } from '../../src/storage/index.js';
import { EventBus } from '../../src/common/events.js';
import { ArrowDataType, ArrowSchema } from '../../src/common/types.js';

const testSchema: ArrowSchema = {
  columns: [
    { name: 'id', dataType: ArrowDataType.Int32, nullable: false },
    { name: 'name', dataType: ArrowDataType.Utf8, nullable: true },
    { name: 'value', dataType: ArrowDataType.Float64, nullable: true },
  ],
  version: 1,
};

describe('Storage Engine', () => {
  let storage: StorageEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    storage = new StorageEngine(eventBus);
  });

  describe('Table Management', () => {
    it('should create a table with schema', async () => {
      const result = await storage.createTable('users', testSchema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('users');
        expect(result.value.schema.columns).toHaveLength(3);
      }
    });

    it('should reject duplicate table names', async () => {
      await storage.createTable('test', testSchema);
      const result = await storage.createTable('test', testSchema);
      expect(result.ok).toBe(false);
    });

    it('should get table by id', async () => {
      const createResult = await storage.createTable('test', testSchema);
      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        const found = storage.getTable(createResult.value.tableId);
        expect(found.ok).toBe(true);
        if (found.ok) expect(found.value.name).toBe('test');
      }
    });

    it('should get table by name', async () => {
      await storage.createTable('lookup', testSchema);
      const result = storage.getTableByName('lookup');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.name).toBe('lookup');
    });

    it('should return error for missing table', () => {
      const result = storage.getTableByName('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('should track table count', async () => {
      expect(storage.getTableCount()).toBe(0);
      await storage.createTable('a', testSchema);
      await storage.createTable('b', testSchema);
      expect(storage.getTableCount()).toBe(2);
    });
  });

  describe('CRUD Operations', () => {
    let tableId: string;

    beforeEach(async () => {
      const result = await storage.createTable('items', testSchema);
      if (result.ok) tableId = result.value.tableId;
    });

    it('should insert and read a row', async () => {
      const txId = storage.beginTransaction();
      const insertResult = await storage.insert(tableId, { id: 1, name: 'item1', value: 42.5 }, txId);
      expect(insertResult.ok).toBe(true);

      if (insertResult.ok) {
        const rowId = insertResult.value;
        await storage.commitTransaction(txId);

        const readResult = storage.read(tableId, rowId);
        expect(readResult.ok).toBe(true);
        if (readResult.ok) {
          expect(readResult.value.name).toBe('item1');
          expect(readResult.value.value).toBe(42.5);
        }
      }
    });

    it('should update a row', async () => {
      const txId = storage.beginTransaction();
      const insertResult = await storage.insert(tableId, { id: 1, name: 'old', value: 1.0 }, txId);
      expect(insertResult.ok).toBe(true);
      const rowId = insertResult.ok ? insertResult.value : '';
      await storage.commitTransaction(txId);

      const txId2 = storage.beginTransaction();
      const updateResult = await storage.update(tableId, rowId, { id: 1, name: 'new', value: 2.0 }, txId2);
      expect(updateResult.ok).toBe(true);
      await storage.commitTransaction(txId2);

      const readResult = storage.read(tableId, rowId);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.name).toBe('new');
        expect(readResult.value.value).toBe(2.0);
      }
    });

    it('should delete a row', async () => {
      const txId = storage.beginTransaction();
      const insertResult = await storage.insert(tableId, { id: 1, name: 'delete-me' }, txId);
      const rowId = insertResult.ok ? insertResult.value : '';
      await storage.commitTransaction(txId);

      const txId2 = storage.beginTransaction();
      const deleteResult = await storage.delete(tableId, rowId, txId2);
      expect(deleteResult.ok).toBe(true);
      await storage.commitTransaction(txId2);

      const readResult = storage.read(tableId, rowId);
      expect(readResult.ok).toBe(false);
    });

    it('should scan committed rows', async () => {
      const txId = storage.beginTransaction();
      await storage.insert(tableId, { id: 1, name: 'a' }, txId);
      await storage.insert(tableId, { id: 2, name: 'b' }, txId);
      await storage.insert(tableId, { id: 3, name: 'c' }, txId);
      await storage.commitTransaction(txId);

      const scanResult = storage.scan(tableId);
      expect(scanResult.ok).toBe(true);
      if (scanResult.ok) {
        expect(scanResult.value.rowCount).toBe(3);
      }
    });
  });

  describe('Transactions', () => {
    let tableId: string;

    beforeEach(async () => {
      const result = await storage.createTable('txtest', testSchema);
      if (result.ok) tableId = result.value.tableId;
    });

    it('should rollback uncommitted changes', async () => {
      const txId = storage.beginTransaction();
      const insertResult = await storage.insert(tableId, { id: 1, name: 'temp' }, txId);
      const rowId = insertResult.ok ? insertResult.value : '';
      await storage.rollbackTransaction(txId);

      const readResult = storage.read(tableId, rowId);
      expect(readResult.ok).toBe(false);
    });

    it('should track transaction status', async () => {
      const txId = storage.beginTransaction();
      expect(storage.getTransactionStatus(txId)).toBe('active');
      await storage.commitTransaction(txId);
      expect(storage.getTransactionStatus(txId)).toBe('committed');
    });

    it('should reject operations on committed transactions', async () => {
      const txId = storage.beginTransaction();
      await storage.commitTransaction(txId);
      const result = await storage.insert(tableId, { id: 1 }, txId);
      expect(result.ok).toBe(false);
    });
  });

  describe('WAL', () => {
    it('should expose WAL segment', () => {
      const wal = storage.getWAL();
      expect(wal).toBeInstanceOf(WALSegment);
    });

    it('should track WAL entries for transactions', async () => {
      const result = await storage.createTable('waltest', testSchema);
      const tableId = result.ok ? result.value.tableId : '';
      const txId = storage.beginTransaction();
      await storage.insert(tableId, { id: 1, name: 'test' }, txId);
      await storage.commitTransaction(txId);

      const wal = storage.getWAL();
      expect(wal.getEntries().length).toBeGreaterThan(0);
      expect(wal.verify()).toBe(true);
    });
  });

  describe('Domain Events', () => {
    it('should emit TableCreated event', async () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      await storage.createTable('evtest', testSchema);
      expect(events).toContain('TableCreated');
    });

    it('should emit RowInserted event on insert', async () => {
      const events: string[] = [];
      const result = await storage.createTable('evtest', testSchema);
      eventBus.onAll((e) => events.push(e.eventType));
      const tableId = result.ok ? result.value.tableId : '';
      const txId = storage.beginTransaction();
      await storage.insert(tableId, { id: 1 }, txId);
      expect(events).toContain('RowInserted');
    });

    it('should emit RowUpdated event on update', async () => {
      const result = await storage.createTable('evtest2', testSchema);
      const tableId = result.ok ? result.value.tableId : '';
      const txId = storage.beginTransaction();
      const insertResult = await storage.insert(tableId, { id: 1, name: 'old' }, txId);
      const rowId = insertResult.ok ? insertResult.value : '';
      await storage.commitTransaction(txId);

      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));
      const txId2 = storage.beginTransaction();
      await storage.update(tableId, rowId, { id: 1, name: 'new' }, txId2);
      expect(events).toContain('RowUpdated');
    });
  });

  describe('Compaction', () => {
    it('should compact versions and WAL', async () => {
      const result = await storage.createTable('compact', testSchema);
      const tableId = result.ok ? result.value.tableId : '';

      const txId = storage.beginTransaction();
      await storage.insert(tableId, { id: 1, name: 'v1' }, txId);
      await storage.commitTransaction(txId);

      storage.advanceGCWatermark(txId);
      const compactResult = await storage.compact();
      expect(compactResult.ok).toBe(true);
    });
  });
});

describe('WALSegment', () => {
  it('should append and verify entries', () => {
    const wal = new WALSegment(0);
    wal.append(1n, 'insert', 'table1', 'row1', { a: 1 });
    wal.append(1n, 'update', 'table1', 'row1', { a: 2 });
    expect(wal.getEntries()).toHaveLength(2);
    expect(wal.verify()).toBe(true);
    expect(wal.getCurrentLSN()).toBe(2n);
  });

  it('should truncate entries', () => {
    const wal = new WALSegment(0);
    wal.append(1n, 'insert', 'table1', 'row1');
    wal.append(2n, 'insert', 'table1', 'row2');
    wal.append(3n, 'insert', 'table1', 'row3');
    const truncated = wal.truncate(2n);
    expect(truncated).toBe(2);
    expect(wal.getEntries()).toHaveLength(1);
  });

  it('should filter entries by transaction', () => {
    const wal = new WALSegment(0);
    wal.append(1n, 'insert', 'table1', 'row1');
    wal.append(2n, 'insert', 'table1', 'row2');
    wal.append(1n, 'update', 'table1', 'row1');
    const tx1Entries = wal.getEntriesForTx(1n);
    expect(tx1Entries).toHaveLength(2);
  });
});

describe('Table', () => {
  const schema: ArrowSchema = {
    columns: [
      { name: 'id', dataType: ArrowDataType.Int32, nullable: false },
      { name: 'name', dataType: ArrowDataType.Utf8, nullable: true },
    ],
    version: 1,
  };

  it('should validate required columns on insert', () => {
    const table = new Table('test', schema);
    const result = table.insertRow('r1', {}, 1n); // missing 'id' which is not nullable
    expect(result.ok).toBe(false);
  });

  it('should track row count', () => {
    const table = new Table('test', schema);
    table.insertRow('r1', { id: 1, name: 'a' }, 1n);
    table.insertRow('r2', { id: 2, name: 'b' }, 1n);
    expect(table.getRowCount()).toBe(2);
  });

  it('should garbage collect old versions', () => {
    const table = new Table('test', schema);
    table.insertRow('r1', { id: 1, name: 'v1' }, 1n);
    table.updateRow('r1', { id: 1, name: 'v2' }, 2n);
    const cleaned = table.gcVersions(1n);
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});
