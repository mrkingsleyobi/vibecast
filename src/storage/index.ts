/**
 * Driftbase Storage Bounded Context — Arrow-native columnar storage with MVCC, WAL, event sourcing.
 * ADR-001: Arrow-native storage (columnar RecordBatch format)
 * ADR-002: MVCC with version chains, GC watermark, WAL with monotonic LSN
 */
import {
  UUID, TxId, LSN, HLCTimestamp, ArrowSchema, ArrowDataType,
  RecordBatch, createRecordBatch, generateId, hlcNow, Result, ok, err,
} from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';

// ─── Storage Domain Events ─────────────────────────────────
export const StorageEvents = {
  TableCreated: 'TableCreated',
  RowInserted: 'RowInserted',
  RowUpdated: 'RowUpdated',
  RowDeleted: 'RowDeleted',
  SnapshotCreated: 'SnapshotCreated',
  WALTruncated: 'WALTruncated',
} as const;

// ─── Interfaces ────────────────────────────────────────────
export interface VersionedRow {
  rowId: UUID;
  data: Record<string, unknown>;
  createdTxId: TxId;
  deletedTxId: TxId | null;
  version: number;
  timestamp: HLCTimestamp;
}

export interface VersionChain { rowId: UUID; versions: VersionedRow[] }

export interface Partition {
  partitionId: UUID;
  rows: Map<UUID, VersionChain>;
  rowCount: number;
}

export interface WALEntry {
  lsn: LSN;
  txId: TxId;
  operation: 'insert' | 'update' | 'delete';
  tableId: UUID;
  rowId: UUID;
  data?: Record<string, unknown>;
  checksum: number;
  timestamp: HLCTimestamp;
}

export interface Transaction {
  txId: TxId;
  status: 'active' | 'committed' | 'aborted';
  startTimestamp: HLCTimestamp;
  writeSet: WALEntry[];
}

export interface ScanPredicate {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: unknown;
}

// ─── WALSegment Aggregate Root ─────────────────────────────
export class WALSegment {
  readonly segmentId: number;
  private entries: WALEntry[] = [];
  private currentLSN: LSN = 0n;

  constructor(segmentId: number, startLSN: LSN = 0n) {
    this.segmentId = segmentId;
    this.currentLSN = startLSN;
  }

  append(
    txId: TxId, operation: WALEntry['operation'],
    tableId: UUID, rowId: UUID, data?: Record<string, unknown>,
  ): WALEntry {
    this.currentLSN += 1n;
    const entry: WALEntry = {
      lsn: this.currentLSN, txId, operation, tableId, rowId, data,
      checksum: this.computeChecksum(this.currentLSN, txId, operation, tableId, rowId),
      timestamp: hlcNow(0),
    };
    this.entries.push(entry);
    return entry;
  }

  getEntries(): ReadonlyArray<WALEntry> { return this.entries; }
  getEntriesForTx(txId: TxId): WALEntry[] { return this.entries.filter(e => e.txId === txId); }
  getCurrentLSN(): LSN { return this.currentLSN; }

  truncate(upToLSN: LSN): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.lsn > upToLSN);
    return before - this.entries.length;
  }

  verify(): boolean {
    return this.entries.every(entry => {
      const expected = this.computeChecksum(
        entry.lsn, entry.txId, entry.operation, entry.tableId, entry.rowId,
      );
      return entry.checksum === expected;
    });
  }

  private computeChecksum(lsn: LSN, txId: TxId, op: string, tableId: UUID, rowId: UUID): number {
    const input = `${lsn}:${txId}:${op}:${tableId}:${rowId}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }
}

// ─── Table Aggregate Root ──────────────────────────────────
export class Table {
  readonly tableId: UUID;
  readonly name: string;
  readonly schema: ArrowSchema;
  readonly createdAt: HLCTimestamp;
  private partitions: Map<UUID, Partition> = new Map();
  private defaultPartitionId: UUID;

  constructor(name: string, schema: ArrowSchema) {
    this.tableId = generateId();
    this.name = name;
    this.schema = schema;
    this.createdAt = hlcNow(0);
    this.defaultPartitionId = generateId();
    this.partitions.set(this.defaultPartitionId, {
      partitionId: this.defaultPartitionId, rows: new Map(), rowCount: 0,
    });
  }

  insertRow(rowId: UUID, data: Record<string, unknown>, txId: TxId): Result<VersionedRow> {
    const validation = this.validateData(data);
    if (!validation.ok) return validation;
    const partition = this.partitions.get(this.defaultPartitionId)!;
    const row: VersionedRow = {
      rowId, data, createdTxId: txId, deletedTxId: null, version: 1, timestamp: hlcNow(0),
    };
    partition.rows.set(rowId, { rowId, versions: [row] });
    partition.rowCount++;
    return ok(row);
  }

  readRow(rowId: UUID, txId?: TxId): Result<VersionedRow> {
    const chain = this.findChain(rowId);
    if (!chain) return err(new Error(`Row ${rowId} not found`));
    const visible = this.resolveVisible(chain, txId);
    if (!visible) return err(new Error(`Row ${rowId} not visible for transaction`));
    return ok(visible);
  }

  updateRow(rowId: UUID, data: Record<string, unknown>, txId: TxId): Result<VersionedRow> {
    const validation = this.validateData(data);
    if (!validation.ok) return validation;
    const chain = this.findChain(rowId);
    if (!chain) return err(new Error(`Row ${rowId} not found`));
    const current = this.resolveVisible(chain, txId);
    if (!current) return err(new Error(`Row ${rowId} not visible for transaction`));
    const newVersion: VersionedRow = {
      rowId, data: { ...current.data, ...data }, createdTxId: txId,
      deletedTxId: null, version: current.version + 1, timestamp: hlcNow(0),
    };
    current.deletedTxId = txId;
    chain.versions.push(newVersion);
    return ok(newVersion);
  }

  deleteRow(rowId: UUID, txId: TxId): Result<void> {
    const chain = this.findChain(rowId);
    if (!chain) return err(new Error(`Row ${rowId} not found`));
    const current = this.resolveVisible(chain, txId);
    if (!current) return err(new Error(`Row ${rowId} not visible for transaction`));
    current.deletedTxId = txId;
    this.partitions.get(this.defaultPartitionId)!.rowCount--;
    return ok(undefined);
  }

  scan(committedTxIds: Set<TxId>, predicate?: ScanPredicate): RecordBatch {
    const rows: VersionedRow[] = [];
    for (const partition of this.partitions.values()) {
      for (const chain of partition.rows.values()) {
        const visible = this.resolveVisibleByCommitted(chain, committedTxIds);
        if (!visible) continue;
        if (predicate && !this.matchesPredicate(visible, predicate)) continue;
        rows.push(visible);
      }
    }
    return this.rowsToBatch(rows);
  }

  getRowCount(): number {
    let count = 0;
    for (const p of this.partitions.values()) count += p.rowCount;
    return count;
  }

  gcVersions(watermark: TxId): number {
    let cleaned = 0;
    for (const partition of this.partitions.values()) {
      for (const chain of partition.rows.values()) {
        const before = chain.versions.length;
        chain.versions = chain.versions.filter(v =>
          v.deletedTxId === null || v.deletedTxId > watermark,
        );
        cleaned += before - chain.versions.length;
      }
    }
    return cleaned;
  }

  private findChain(rowId: UUID): VersionChain | undefined {
    for (const partition of this.partitions.values()) {
      const chain = partition.rows.get(rowId);
      if (chain) return chain;
    }
    return undefined;
  }

  private resolveVisible(chain: VersionChain, txId?: TxId): VersionedRow | undefined {
    for (let i = chain.versions.length - 1; i >= 0; i--) {
      const v = chain.versions[i];
      if (v.deletedTxId !== null) continue;
      if (txId !== undefined && v.createdTxId > txId) continue;
      return v;
    }
    return undefined;
  }

  private resolveVisibleByCommitted(
    chain: VersionChain, committed: Set<TxId>,
  ): VersionedRow | undefined {
    for (let i = chain.versions.length - 1; i >= 0; i--) {
      const v = chain.versions[i];
      if (v.deletedTxId !== null && committed.has(v.deletedTxId)) continue;
      if (committed.has(v.createdTxId)) return v;
    }
    return undefined;
  }

  private matchesPredicate(row: VersionedRow, pred: ScanPredicate): boolean {
    const val = row.data[pred.column];
    switch (pred.op) {
      case 'eq': return val === pred.value;
      case 'neq': return val !== pred.value;
      case 'gt': return (val as number) > (pred.value as number);
      case 'gte': return (val as number) >= (pred.value as number);
      case 'lt': return (val as number) < (pred.value as number);
      case 'lte': return (val as number) <= (pred.value as number);
      default: return false;
    }
  }

  private validateData(data: Record<string, unknown>): Result<void> {
    for (const col of this.schema.columns) {
      if (!col.nullable && data[col.name] === undefined) {
        return err(new Error(`Missing required column: ${col.name}`));
      }
    }
    return ok(undefined);
  }

  private rowsToBatch(rows: VersionedRow[]): RecordBatch {
    const data: Record<string, unknown[]> = {};
    for (const col of this.schema.columns) {
      data[col.name] = rows.map(r => r.data[col.name] ?? null);
    }
    data['_rowId'] = rows.map(r => r.rowId);
    const batchSchema: ArrowSchema = {
      columns: [
        ...this.schema.columns,
        { name: '_rowId', dataType: ArrowDataType.Utf8, nullable: false },
      ],
      version: this.schema.version,
    };
    return createRecordBatch(batchSchema, data);
  }
}

// ─── StorageEngine Service ─────────────────────────────────
export class StorageEngine {
  private tables: Map<UUID, Table> = new Map();
  private tablesByName: Map<string, UUID> = new Map();
  private transactions: Map<TxId, Transaction> = new Map();
  private committedTxIds: Set<TxId> = new Set();
  private wal: WALSegment;
  private nextTxId: TxId = 1n;
  private gcWatermark: TxId = 0n;
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.wal = new WALSegment(0);
  }

  async createTable(name: string, schema: ArrowSchema): Promise<Result<Table>> {
    if (this.tablesByName.has(name)) return err(new Error(`Table "${name}" already exists`));
    const table = new Table(name, schema);
    this.tables.set(table.tableId, table);
    this.tablesByName.set(name, table.tableId);
    await this.eventBus.emit(createEvent(
      StorageEvents.TableCreated, BoundedContext.Storage,
      { tableId: table.tableId, name, columnCount: schema.columns.length },
    ));
    return ok(table);
  }

  getTable(tableId: UUID): Result<Table> {
    const table = this.tables.get(tableId);
    return table ? ok(table) : err(new Error(`Table ${tableId} not found`));
  }

  getTableByName(name: string): Result<Table> {
    const id = this.tablesByName.get(name);
    return id ? this.getTable(id) : err(new Error(`Table "${name}" not found`));
  }

  beginTransaction(): TxId {
    const txId = this.nextTxId++;
    this.transactions.set(txId, {
      txId, status: 'active', startTimestamp: hlcNow(0), writeSet: [],
    });
    return txId;
  }

  async commitTransaction(txId: TxId): Promise<Result<void>> {
    const tx = this.transactions.get(txId);
    if (!tx) return err(new Error(`Transaction ${txId} not found`));
    if (tx.status !== 'active') return err(new Error(`Transaction ${txId} is ${tx.status}`));
    tx.status = 'committed';
    this.committedTxIds.add(txId);
    return ok(undefined);
  }

  async rollbackTransaction(txId: TxId): Promise<Result<void>> {
    const tx = this.transactions.get(txId);
    if (!tx) return err(new Error(`Transaction ${txId} not found`));
    if (tx.status !== 'active') return err(new Error(`Transaction ${txId} is ${tx.status}`));
    for (const entry of tx.writeSet) {
      const table = this.tables.get(entry.tableId);
      if (table && entry.operation === 'insert') table.deleteRow(entry.rowId, txId);
    }
    tx.status = 'aborted';
    return ok(undefined);
  }

  private getActiveTx(txId: TxId): Result<Transaction> {
    const tx = this.transactions.get(txId);
    if (!tx) return err(new Error(`Transaction ${txId} not found`));
    if (tx.status !== 'active') return err(new Error(`Transaction ${txId} is ${tx.status}`));
    return ok(tx);
  }

  async insert(tableId: UUID, data: Record<string, unknown>, txId: TxId): Promise<Result<UUID>> {
    const txResult = this.getActiveTx(txId);
    if (!txResult.ok) return err(txResult.error);
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    const rowId = generateId();
    const insertResult = tableResult.value.insertRow(rowId, data, txId);
    if (!insertResult.ok) return err(insertResult.error);
    const walEntry = this.wal.append(txId, 'insert', tableId, rowId, data);
    txResult.value.writeSet.push(walEntry);
    await this.eventBus.emit(createEvent(
      StorageEvents.RowInserted, BoundedContext.Storage,
      { tableId, rowId, txId: String(txId) },
    ));
    return ok(rowId);
  }

  read(tableId: UUID, rowId: UUID, txId?: TxId): Result<Record<string, unknown>> {
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    const rowResult = tableResult.value.readRow(rowId, txId);
    if (!rowResult.ok) return err(rowResult.error);
    return ok(rowResult.value.data);
  }

  async update(
    tableId: UUID, rowId: UUID, data: Record<string, unknown>, txId: TxId,
  ): Promise<Result<void>> {
    const txResult = this.getActiveTx(txId);
    if (!txResult.ok) return err(txResult.error);
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    const updateResult = tableResult.value.updateRow(rowId, data, txId);
    if (!updateResult.ok) return err(updateResult.error);
    const walEntry = this.wal.append(txId, 'update', tableId, rowId, data);
    txResult.value.writeSet.push(walEntry);
    await this.eventBus.emit(createEvent(
      StorageEvents.RowUpdated, BoundedContext.Storage,
      { tableId, rowId, txId: String(txId) },
    ));
    return ok(undefined);
  }

  async delete(tableId: UUID, rowId: UUID, txId: TxId): Promise<Result<void>> {
    const txResult = this.getActiveTx(txId);
    if (!txResult.ok) return err(txResult.error);
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    const deleteResult = tableResult.value.deleteRow(rowId, txId);
    if (!deleteResult.ok) return err(deleteResult.error);
    const walEntry = this.wal.append(txId, 'delete', tableId, rowId);
    txResult.value.writeSet.push(walEntry);
    await this.eventBus.emit(createEvent(
      StorageEvents.RowDeleted, BoundedContext.Storage,
      { tableId, rowId, txId: String(txId) },
    ));
    return ok(undefined);
  }

  scan(tableId: UUID, predicate?: ScanPredicate): Result<RecordBatch> {
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    return ok(tableResult.value.scan(this.committedTxIds, predicate));
  }

  async createSnapshot(tableId: UUID): Promise<Result<UUID>> {
    const tableResult = this.getTable(tableId);
    if (!tableResult.ok) return err(tableResult.error);
    const snapshotId = generateId();
    await this.eventBus.emit(createEvent(
      StorageEvents.SnapshotCreated, BoundedContext.Storage,
      { tableId, snapshotId, rowCount: tableResult.value.getRowCount() },
    ));
    return ok(snapshotId);
  }

  async compact(): Promise<Result<{ versionsCleaned: number; walTruncated: number }>> {
    let versionsCleaned = 0;
    for (const table of this.tables.values()) {
      versionsCleaned += table.gcVersions(this.gcWatermark);
    }
    const walTruncated = this.wal.truncate(BigInt(this.gcWatermark));
    if (walTruncated > 0) {
      await this.eventBus.emit(createEvent(
        StorageEvents.WALTruncated, BoundedContext.Storage,
        { segmentId: this.wal.segmentId, upToLSN: String(this.gcWatermark) },
      ));
    }
    return ok({ versionsCleaned, walTruncated });
  }

  advanceGCWatermark(txId: TxId): void {
    if (txId > this.gcWatermark) this.gcWatermark = txId;
  }

  getWAL(): WALSegment { return this.wal; }
  getTransactionStatus(txId: TxId): Transaction['status'] | undefined {
    return this.transactions.get(txId)?.status;
  }
  getTableCount(): number { return this.tables.size; }
}
