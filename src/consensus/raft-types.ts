/**
 * Driftbase Consensus — Raft Types
 * Type definitions for the Raft consensus protocol.
 * Per ADR-002 / ADR-005.
 */
import type { NodeId } from '../common/types.js';

// ─── Raft State ──────────────────────────────────────────────

export enum RaftState {
  Follower = 'follower',
  Candidate = 'candidate',
  Leader = 'leader',
  Learner = 'learner',
}

// ─── Log Entry ───────────────────────────────────────────────

export interface LogEntry {
  index: number;
  term: number;
  command: unknown;
}

// ─── Vote RPC ────────────────────────────────────────────────

export interface VoteRequest {
  term: number;
  candidateId: NodeId;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface VoteResponse {
  term: number;
  voteGranted: boolean;
}

// ─── AppendEntries RPC ───────────────────────────────────────

export interface AppendEntriesRequest {
  term: number;
  leaderId: NodeId;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponse {
  term: number;
  success: boolean;
  matchIndex: number;
}
