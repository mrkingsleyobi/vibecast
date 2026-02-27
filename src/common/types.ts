/**
 * Driftbase Common Types — Shared Kernel
 * Used across all bounded contexts per ADR-002
 */
import { randomUUID } from 'crypto';

// ─── Identifiers ────────────────────────────────────────────

export type UUID = string;
export type NodeId = number;
export type TxId = bigint;
export type LSN = bigint;

export function generateId(): UUID {
  return randomUUID();
}

// ─── Timestamps ─────────────────────────────────────────────

export interface HLCTimestamp {
  wallTime: bigint;
  logical: number;
  nodeId: NodeId;
}

export function hlcNow(nodeId: NodeId): HLCTimestamp {
  return {
    wallTime: BigInt(Date.now()),
    logical: 0,
    nodeId,
  };
}

export function hlcCompare(a: HLCTimestamp, b: HLCTimestamp): number {
  if (a.wallTime !== b.wallTime) return a.wallTime < b.wallTime ? -1 : 1;
  if (a.logical !== b.logical) return a.logical - b.logical;
  return a.nodeId - b.nodeId;
}

// ─── Arrow-compatible Schema Types ──────────────────────────

export enum ArrowDataType {
  Utf8 = 'utf8',
  Int32 = 'int32',
  Int64 = 'int64',
  Float32 = 'float32',
  Float64 = 'float64',
  Boolean = 'boolean',
  Binary = 'binary',
  Timestamp = 'timestamp',
  List = 'list',
  FixedSizeList = 'fixed_size_list',
  Struct = 'struct',
}

export interface ColumnDef {
  name: string;
  dataType: ArrowDataType;
  nullable: boolean;
  metadata?: Record<string, string>;
}

export interface ArrowSchema {
  columns: ColumnDef[];
  version: number;
}

// ─── Record Batch (Arrow-compatible) ────────────────────────

export interface RecordBatch {
  schema: ArrowSchema;
  columns: Map<string, unknown[]>;
  rowCount: number;
}

export function createRecordBatch(schema: ArrowSchema, data: Record<string, unknown[]>): RecordBatch {
  const columns = new Map<string, unknown[]>();
  let rowCount = 0;
  for (const col of schema.columns) {
    const values = data[col.name] ?? [];
    columns.set(col.name, values);
    rowCount = Math.max(rowCount, values.length);
  }
  return { schema, columns, rowCount };
}

// ─── Vector Types ───────────────────────────────────────────

export type Vector = Float32Array;

export enum DistanceMetric {
  Cosine = 'cosine',
  L2 = 'l2',
  InnerProduct = 'inner_product',
}

export interface SearchResult {
  id: UUID;
  distance: number;
  data?: Record<string, unknown>;
}

// ─── Result Types ───────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: Error): Result<T> {
  return { ok: false, error };
}

// ─── Vector Clock ───────────────────────────────────────────

export class VectorClock {
  private clocks: Map<NodeId, bigint>;

  constructor(initial?: Map<NodeId, bigint>) {
    this.clocks = new Map(initial ?? []);
  }

  increment(nodeId: NodeId): void {
    const current = this.clocks.get(nodeId) ?? 0n;
    this.clocks.set(nodeId, current + 1n);
  }

  get(nodeId: NodeId): bigint {
    return this.clocks.get(nodeId) ?? 0n;
  }

  merge(other: VectorClock): VectorClock {
    const merged = new Map(this.clocks);
    for (const [nodeId, time] of other.clocks) {
      const current = merged.get(nodeId) ?? 0n;
      merged.set(nodeId, current > time ? current : time);
    }
    return new VectorClock(merged);
  }

  happensBefore(other: VectorClock): boolean {
    let atLeastOneLess = false;
    const allNodes = new Set([...this.clocks.keys(), ...other.clocks.keys()]);
    for (const node of allNodes) {
      const a = this.get(node);
      const b = other.get(node);
      if (a > b) return false;
      if (a < b) atLeastOneLess = true;
    }
    return atLeastOneLess;
  }

  isConcurrent(other: VectorClock): boolean {
    return !this.happensBefore(other) && !other.happensBefore(this);
  }

  toJSON(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of this.clocks) {
      result[String(k)] = String(v);
    }
    return result;
  }

  clone(): VectorClock {
    return new VectorClock(new Map(this.clocks));
  }
}
