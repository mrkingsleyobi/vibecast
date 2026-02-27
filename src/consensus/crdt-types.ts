/**
 * Driftbase Consensus — CRDT Types
 * Type definitions for Conflict-free Replicated Data Types.
 * Per ADR-002 / ADR-005.
 */
import type { UUID, NodeId, HLCTimestamp } from '../common/types.js';

// ─── CRDT Type Enum ──────────────────────────────────────────

export enum CRDTType {
  ORSet = 'or-set',
  LWWRegister = 'lww-register',
  GCounter = 'g-counter',
  PNCounter = 'pn-counter',
}

// ─── State Interfaces ────────────────────────────────────────

export interface ORSetState<T = unknown> {
  type: CRDTType.ORSet;
  entries: Map<string, { value: T; tag: UUID }>;
  tombstones: Set<string>;
}

export interface LWWRegisterState<T = unknown> {
  type: CRDTType.LWWRegister;
  value: T | undefined;
  timestamp: HLCTimestamp | undefined;
}

export interface GCounterState {
  type: CRDTType.GCounter;
  counts: Map<NodeId, number>;
}

export interface PNCounterState {
  type: CRDTType.PNCounter;
  increments: Map<NodeId, number>;
  decrements: Map<NodeId, number>;
}

// ─── Union Type ──────────────────────────────────────────────

export type CRDTState = ORSetState | LWWRegisterState | GCounterState | PNCounterState;
