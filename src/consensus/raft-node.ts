/**
 * Driftbase Consensus — RaftNode Aggregate Root
 * Implements the Raft consensus algorithm for strong consistency.
 * Per ADR-002 / ADR-005.
 */
import type { NodeId, Result } from '../common/types.js';
import { ok, err } from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';
import type {
  LogEntry, VoteRequest, VoteResponse,
  AppendEntriesRequest, AppendEntriesResponse,
} from './raft-types.js';
import { RaftState } from './raft-types.js';

// ─── Constants ───────────────────────────────────────────────

export const ELECTION_TIMEOUT_MIN = 150;
export const ELECTION_TIMEOUT_MAX = 300;
export const HEARTBEAT_INTERVAL = 50;

export function randomElectionTimeout(): number {
  return ELECTION_TIMEOUT_MIN +
    Math.floor(Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN));
}

// ─── RaftNode Aggregate Root ─────────────────────────────────

export class RaftNode {
  readonly id: NodeId;
  private state: RaftState = RaftState.Follower;
  private currentTerm = 0;
  private votedFor: NodeId | null = null;
  private log: LogEntry[] = [];
  private commitIndex = 0;
  private lastApplied = 0;

  // Leader-only volatile state
  private nextIndex: Map<NodeId, number> = new Map();
  private matchIndex: Map<NodeId, number> = new Map();

  // Election / heartbeat timers (tick-based)
  private electionTimeout: number;
  private ticksSinceHeartbeat = 0;
  private votesReceived: Set<NodeId> = new Set();
  private peers: NodeId[] = [];

  private readonly eventBus: EventBus;
  private readonly appliedCommands: unknown[] = [];

  constructor(id: NodeId, peers: NodeId[], eventBus: EventBus) {
    this.id = id;
    this.peers = peers;
    this.eventBus = eventBus;
    this.electionTimeout = randomElectionTimeout();
  }

  // ── Getters ──────────────────────────────────────────────

  getState(): RaftState { return this.state; }
  getCurrentTerm(): number { return this.currentTerm; }
  getCommitIndex(): number { return this.commitIndex; }
  getLastApplied(): number { return this.lastApplied; }
  getLog(): ReadonlyArray<LogEntry> { return this.log; }
  getAppliedCommands(): ReadonlyArray<unknown> { return this.appliedCommands; }
  getPeers(): ReadonlyArray<NodeId> { return this.peers; }

  // ── Vote Handling ────────────────────────────────────────

  requestVote(
    term: number,
    candidateId: NodeId,
    lastLogIndex: number,
    lastLogTerm: number,
  ): VoteResponse {
    if (term > this.currentTerm) {
      this.stepDown(term);
    }

    if (term < this.currentTerm) {
      return { term: this.currentTerm, voteGranted: false };
    }

    const canVote = this.votedFor === null || this.votedFor === candidateId;
    const logOk = this.isLogUpToDate(lastLogIndex, lastLogTerm);

    if (canVote && logOk) {
      this.votedFor = candidateId;
      this.ticksSinceHeartbeat = 0;
      return { term: this.currentTerm, voteGranted: true };
    }

    return { term: this.currentTerm, voteGranted: false };
  }

  private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
    const myLastTerm = this.lastLogTerm();
    const myLastIndex = this.lastLogIndex();
    if (lastLogTerm !== myLastTerm) return lastLogTerm > myLastTerm;
    return lastLogIndex >= myLastIndex;
  }

  private lastLogIndex(): number {
    return this.log.length > 0 ? this.log[this.log.length - 1].index : 0;
  }

  private lastLogTerm(): number {
    return this.log.length > 0 ? this.log[this.log.length - 1].term : 0;
  }

  // ── AppendEntries Handling ───────────────────────────────

  appendEntries(
    term: number,
    leaderId: NodeId,
    entries: LogEntry[],
    prevLogIndex: number,
    prevLogTerm: number,
    leaderCommit: number,
  ): AppendEntriesResponse {
    if (term > this.currentTerm) {
      this.stepDown(term);
    }

    if (term < this.currentTerm) {
      return { term: this.currentTerm, success: false, matchIndex: 0 };
    }

    // Valid leader heartbeat: reset election timer, step down if candidate
    this.ticksSinceHeartbeat = 0;
    if (this.state === RaftState.Candidate) {
      this.state = RaftState.Follower;
    }

    // Log consistency check
    if (prevLogIndex > 0) {
      const entry = this.log.find(e => e.index === prevLogIndex);
      if (!entry || entry.term !== prevLogTerm) {
        return { term: this.currentTerm, success: false, matchIndex: 0 };
      }
    }

    // Append new entries, resolving conflicts
    for (const entry of entries) {
      const existing = this.log.find(e => e.index === entry.index);
      if (existing) {
        if (existing.term !== entry.term) {
          // Truncate from conflicting entry onward
          this.log = this.log.filter(e => e.index < entry.index);
          this.log.push(entry);
        }
      } else {
        this.log.push(entry);
      }
    }

    // Advance commit index
    if (leaderCommit > this.commitIndex) {
      const lastNew = entries.length > 0
        ? entries[entries.length - 1].index
        : this.lastLogIndex();
      this.commitIndex = Math.min(leaderCommit, lastNew);
    }

    const matchIdx = this.lastLogIndex();
    return { term: this.currentTerm, success: true, matchIndex: matchIdx };
  }

  // ── Election ─────────────────────────────────────────────

  startElection(): VoteRequest {
    this.currentTerm++;
    this.state = RaftState.Candidate;
    this.votedFor = this.id;
    this.votesReceived = new Set([this.id]);
    this.ticksSinceHeartbeat = 0;
    this.electionTimeout = randomElectionTimeout();

    return {
      term: this.currentTerm,
      candidateId: this.id,
      lastLogIndex: this.lastLogIndex(),
      lastLogTerm: this.lastLogTerm(),
    };
  }

  handleVoteResponse(fromNode: NodeId, response: VoteResponse): void {
    if (response.term > this.currentTerm) {
      this.stepDown(response.term);
      return;
    }
    if (this.state !== RaftState.Candidate) return;
    if (response.term !== this.currentTerm) return;

    if (response.voteGranted) {
      this.votesReceived.add(fromNode);
      const majority = Math.floor((this.peers.length + 1) / 2) + 1;
      if (this.votesReceived.size >= majority) {
        this.becomeLeader();
      }
    }
  }

  private becomeLeader(): void {
    this.state = RaftState.Leader;
    // Initialize leader volatile state
    const nextIdx = this.lastLogIndex() + 1;
    for (const peer of this.peers) {
      this.nextIndex.set(peer, nextIdx);
      this.matchIndex.set(peer, 0);
    }
    this.eventBus.emit(createEvent(
      'LeaderElected',
      BoundedContext.Consensus,
      { nodeId: this.id, term: this.currentTerm },
    ));
  }

  private stepDown(newTerm: number): void {
    this.currentTerm = newTerm;
    this.state = RaftState.Follower;
    this.votedFor = null;
    this.votesReceived.clear();
  }

  // ── Tick (timer driver) ──────────────────────────────────

  tick(): void {
    this.ticksSinceHeartbeat++;

    if (this.state === RaftState.Leader) {
      if (this.ticksSinceHeartbeat >= HEARTBEAT_INTERVAL) {
        this.ticksSinceHeartbeat = 0;
        // Heartbeat will be driven by ConsensusEngine
      }
    } else {
      if (this.ticksSinceHeartbeat >= this.electionTimeout) {
        this.startElection();
      }
    }
  }

  needsHeartbeat(): boolean {
    return this.state === RaftState.Leader &&
      this.ticksSinceHeartbeat >= HEARTBEAT_INTERVAL;
  }

  // ── Log Replication (Leader) ─────────────────────────────

  appendToLog(command: unknown): Result<LogEntry> {
    if (this.state !== RaftState.Leader) {
      return err(new Error('Not the leader'));
    }

    const entry: LogEntry = {
      index: this.lastLogIndex() + 1,
      term: this.currentTerm,
      command,
    };
    this.log.push(entry);

    // Leader counts itself as matching
    this.matchIndex.set(this.id, entry.index);

    this.eventBus.emit(createEvent(
      'LogAppended',
      BoundedContext.Consensus,
      { nodeId: this.id, index: entry.index, term: entry.term },
    ));

    return ok(entry);
  }

  buildAppendEntries(peerId: NodeId): AppendEntriesRequest {
    const nextIdx = this.nextIndex.get(peerId) ?? (this.lastLogIndex() + 1);
    const prevIdx = nextIdx - 1;
    const prevEntry = this.log.find(e => e.index === prevIdx);

    return {
      term: this.currentTerm,
      leaderId: this.id,
      prevLogIndex: prevIdx,
      prevLogTerm: prevEntry?.term ?? 0,
      entries: this.log.filter(e => e.index >= nextIdx),
      leaderCommit: this.commitIndex,
    };
  }

  handleAppendResponse(peerId: NodeId, response: AppendEntriesResponse): void {
    if (response.term > this.currentTerm) {
      this.stepDown(response.term);
      return;
    }
    if (this.state !== RaftState.Leader) return;

    if (response.success) {
      this.matchIndex.set(peerId, response.matchIndex);
      this.nextIndex.set(peerId, response.matchIndex + 1);
      this.advanceCommitIndex();
    } else {
      // Decrement nextIndex and retry
      const current = this.nextIndex.get(peerId) ?? 1;
      this.nextIndex.set(peerId, Math.max(1, current - 1));
    }
  }

  private advanceCommitIndex(): void {
    // Find the highest index replicated on a majority
    const allMatchIndices = [this.lastLogIndex()];
    for (const peer of this.peers) {
      allMatchIndices.push(this.matchIndex.get(peer) ?? 0);
    }
    allMatchIndices.sort((a, b) => b - a);

    const majority = Math.floor((this.peers.length + 1) / 2) + 1;
    const candidateCommit = allMatchIndices[majority - 1] ?? 0;

    // Only advance if the entry at candidateCommit is from current term
    if (candidateCommit > this.commitIndex) {
      const entry = this.log.find(e => e.index === candidateCommit);
      if (entry && entry.term === this.currentTerm) {
        this.commitIndex = candidateCommit;
      }
    }
  }

  // ── State Machine Application ────────────────────────────

  applyCommitted(): unknown[] {
    const applied: unknown[] = [];
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log.find(e => e.index === this.lastApplied);
      if (entry) {
        this.appliedCommands.push(entry.command);
        applied.push(entry.command);
      }
    }
    return applied;
  }
}
