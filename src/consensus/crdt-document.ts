/**
 * Driftbase Consensus — CRDTDocument Aggregate Root
 * Manages Conflict-free Replicated Data Types for eventual consistency.
 * Per ADR-002 / ADR-005.
 */
import type { UUID, NodeId, HLCTimestamp } from '../common/types.js';
import { generateId, hlcCompare } from '../common/types.js';
import {
  CRDTType,
  type ORSetState, type LWWRegisterState,
  type GCounterState, type PNCounterState,
} from './crdt-types.js';

// ─── CRDTDocument Aggregate Root ─────────────────────────────

export class CRDTDocument {
  readonly documentId: UUID;
  private orSets: Map<string, ORSetState> = new Map();
  private lwwRegisters: Map<string, LWWRegisterState> = new Map();
  private gCounters: Map<string, GCounterState> = new Map();
  private pnCounters: Map<string, PNCounterState> = new Map();

  constructor(documentId?: UUID) {
    this.documentId = documentId ?? generateId();
  }

  // ── ORSet ────────────────────────────────────────────────

  orSetAdd(key: string, element: unknown): void {
    const set = this.getOrCreateORSet(key);
    const tag = generateId();
    const entryKey = `${tag}`;
    set.entries.set(entryKey, { value: element, tag });
    set.tombstones.delete(entryKey);
  }

  orSetRemove(key: string, element: unknown): void {
    const set = this.getOrCreateORSet(key);
    for (const [entryKey, entry] of set.entries) {
      if (this.deepEquals(entry.value, element)) {
        set.tombstones.add(entryKey);
        set.entries.delete(entryKey);
      }
    }
  }

  orSetValues(key: string): unknown[] {
    const set = this.getOrCreateORSet(key);
    const values: unknown[] = [];
    for (const [entryKey, entry] of set.entries) {
      if (!set.tombstones.has(entryKey)) {
        values.push(entry.value);
      }
    }
    return values;
  }

  orSetMerge(key: string, other: ORSetState): void {
    const local = this.getOrCreateORSet(key);
    // Union of entries minus union of tombstones
    for (const [entryKey, entry] of other.entries) {
      if (!local.tombstones.has(entryKey) && !other.tombstones.has(entryKey)) {
        local.entries.set(entryKey, entry);
      }
    }
    for (const t of other.tombstones) {
      local.tombstones.add(t);
      local.entries.delete(t);
    }
  }

  getORSetState(key: string): ORSetState {
    return this.getOrCreateORSet(key);
  }

  private getOrCreateORSet(key: string): ORSetState {
    let set = this.orSets.get(key);
    if (!set) {
      set = { type: CRDTType.ORSet, entries: new Map(), tombstones: new Set() };
      this.orSets.set(key, set);
    }
    return set;
  }

  // ── LWW Register ─────────────────────────────────────────

  lwwSet(key: string, value: unknown, timestamp: HLCTimestamp): void {
    const reg = this.getOrCreateLWWRegister(key);
    if (!reg.timestamp || hlcCompare(timestamp, reg.timestamp) > 0) {
      reg.value = value;
      reg.timestamp = timestamp;
    }
  }

  lwwGet(key: string): unknown | undefined {
    return this.getOrCreateLWWRegister(key).value;
  }

  lwwMerge(key: string, other: LWWRegisterState): void {
    const local = this.getOrCreateLWWRegister(key);
    if (!local.timestamp && other.timestamp) {
      local.value = other.value;
      local.timestamp = other.timestamp;
    } else if (local.timestamp && other.timestamp &&
               hlcCompare(other.timestamp, local.timestamp) > 0) {
      local.value = other.value;
      local.timestamp = other.timestamp;
    }
  }

  getLWWRegisterState(key: string): LWWRegisterState {
    return this.getOrCreateLWWRegister(key);
  }

  private getOrCreateLWWRegister(key: string): LWWRegisterState {
    let reg = this.lwwRegisters.get(key);
    if (!reg) {
      reg = { type: CRDTType.LWWRegister, value: undefined, timestamp: undefined };
      this.lwwRegisters.set(key, reg);
    }
    return reg;
  }

  // ── GCounter ─────────────────────────────────────────────

  gCounterIncrement(key: string, nodeId: NodeId, amount = 1): void {
    const counter = this.getOrCreateGCounter(key);
    const current = counter.counts.get(nodeId) ?? 0;
    counter.counts.set(nodeId, current + amount);
  }

  gCounterValue(key: string): number {
    const counter = this.getOrCreateGCounter(key);
    let total = 0;
    for (const v of counter.counts.values()) total += v;
    return total;
  }

  gCounterMerge(key: string, other: GCounterState): void {
    const local = this.getOrCreateGCounter(key);
    for (const [nodeId, count] of other.counts) {
      const localCount = local.counts.get(nodeId) ?? 0;
      local.counts.set(nodeId, Math.max(localCount, count));
    }
  }

  getGCounterState(key: string): GCounterState {
    return this.getOrCreateGCounter(key);
  }

  private getOrCreateGCounter(key: string): GCounterState {
    let counter = this.gCounters.get(key);
    if (!counter) {
      counter = { type: CRDTType.GCounter, counts: new Map() };
      this.gCounters.set(key, counter);
    }
    return counter;
  }

  // ── PNCounter ────────────────────────────────────────────

  pnCounterIncrement(key: string, nodeId: NodeId, amount = 1): void {
    const counter = this.getOrCreatePNCounter(key);
    const current = counter.increments.get(nodeId) ?? 0;
    counter.increments.set(nodeId, current + amount);
  }

  pnCounterDecrement(key: string, nodeId: NodeId, amount = 1): void {
    const counter = this.getOrCreatePNCounter(key);
    const current = counter.decrements.get(nodeId) ?? 0;
    counter.decrements.set(nodeId, current + amount);
  }

  pnCounterValue(key: string): number {
    const counter = this.getOrCreatePNCounter(key);
    let incTotal = 0;
    let decTotal = 0;
    for (const v of counter.increments.values()) incTotal += v;
    for (const v of counter.decrements.values()) decTotal += v;
    return incTotal - decTotal;
  }

  pnCounterMerge(key: string, other: PNCounterState): void {
    const local = this.getOrCreatePNCounter(key);
    for (const [nodeId, count] of other.increments) {
      const localCount = local.increments.get(nodeId) ?? 0;
      local.increments.set(nodeId, Math.max(localCount, count));
    }
    for (const [nodeId, count] of other.decrements) {
      const localCount = local.decrements.get(nodeId) ?? 0;
      local.decrements.set(nodeId, Math.max(localCount, count));
    }
  }

  getPNCounterState(key: string): PNCounterState {
    return this.getOrCreatePNCounter(key);
  }

  private getOrCreatePNCounter(key: string): PNCounterState {
    let counter = this.pnCounters.get(key);
    if (!counter) {
      counter = {
        type: CRDTType.PNCounter,
        increments: new Map(),
        decrements: new Map(),
      };
      this.pnCounters.set(key, counter);
    }
    return counter;
  }

  // ── Utility ──────────────────────────────────────────────

  private deepEquals(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
