/**
 * VibeCast Consensus Bounded Context
 * Hybrid consensus: Raft for strong consistency (OLTP writes),
 * CRDT for eventual consistency (vector index propagation).
 * Per ADR-005.
 */
import {
  UUID, NodeId, generateId, VectorClock,
  HLCTimestamp, hlcNow, hlcCompare, Result, ok, err,
} from '../common/types.js';
import {
  DomainEvent, BoundedContext, createEvent, EventBus,
} from '../common/events.js';

// ─── Raft Types ──────────────────────────────────────────────

export enum RaftState {
  Follower = 'follower',
  Candidate = 'candidate',
  Leader = 'leader',
  Learner = 'learner',
}

export interface LogEntry {
  index: number;
  term: number;
  command: unknown;
}

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

// ─── CRDT Types ──────────────────────────────────────────────

export enum CRDTType {
  ORSet = 'or-set',
  LWWRegister = 'lww-register',
  GCounter = 'g-counter',
  PNCounter = 'pn-counter',
}

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

export type CRDTState = ORSetState | LWWRegisterState | GCounterState | PNCounterState;

// ─── Raft Node Aggregate Root ────────────────────────────────

const ELECTION_TIMEOUT_MIN = 150;
const ELECTION_TIMEOUT_MAX = 300;
const HEARTBEAT_INTERVAL = 50;

function randomElectionTimeout(): number {
  return ELECTION_TIMEOUT_MIN +
    Math.floor(Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN));
}

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

// ─── CRDT Document Aggregate Root ────────────────────────────

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

// ─── Consensus Engine Service ────────────────────────────────

export interface ClusterConfig {
  nodeIds: NodeId[];
}

export class ConsensusEngine {
  private nodes: Map<NodeId, RaftNode> = new Map();
  private crdtDocuments: Map<UUID, CRDTDocument> = new Map();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  // ── Raft Cluster Management ──────────────────────────────

  createCluster(config: ClusterConfig): Result<Map<NodeId, RaftNode>> {
    if (config.nodeIds.length < 3) {
      return err(new Error('Raft cluster requires at least 3 nodes'));
    }

    this.nodes.clear();
    for (const nodeId of config.nodeIds) {
      const peers = config.nodeIds.filter(id => id !== nodeId);
      const node = new RaftNode(nodeId, peers, this.eventBus);
      this.nodes.set(nodeId, node);
    }

    return ok(this.nodes);
  }

  getNode(nodeId: NodeId): RaftNode | undefined {
    return this.nodes.get(nodeId);
  }

  getLeader(): NodeId | undefined {
    for (const [nodeId, node] of this.nodes) {
      if (node.getState() === RaftState.Leader) return nodeId;
    }
    return undefined;
  }

  proposeWrite(command: unknown): Result<LogEntry> {
    const leaderId = this.getLeader();
    if (leaderId === undefined) {
      return err(new Error('No leader elected'));
    }

    const leader = this.nodes.get(leaderId)!;
    const result = leader.appendToLog(command);
    if (!result.ok) return result;

    // Replicate to all followers in the local cluster
    for (const peerId of leader.getPeers()) {
      const peer = this.nodes.get(peerId);
      if (!peer) continue;

      const req = leader.buildAppendEntries(peerId);
      const resp = peer.appendEntries(
        req.term, req.leaderId, req.entries,
        req.prevLogIndex, req.prevLogTerm, req.leaderCommit,
      );
      leader.handleAppendResponse(peerId, resp);
    }

    // Apply any newly committed entries on all nodes
    for (const [, node] of this.nodes) {
      node.applyCommitted();
    }

    return result;
  }

  /**
   * Simulate a single tick across all nodes.
   * Drives election timeouts and heartbeat logic.
   */
  tick(): void {
    for (const [, node] of this.nodes) {
      node.tick();
    }

    // If any node started an election, process votes
    for (const [nodeId, node] of this.nodes) {
      if (node.getState() === RaftState.Candidate) {
        const request = {
          term: node.getCurrentTerm(),
          candidateId: nodeId,
          lastLogIndex: node.getLog().length > 0
            ? node.getLog()[node.getLog().length - 1].index : 0,
          lastLogTerm: node.getLog().length > 0
            ? node.getLog()[node.getLog().length - 1].term : 0,
        };

        for (const peerId of node.getPeers()) {
          const peer = this.nodes.get(peerId);
          if (!peer) continue;
          const response = peer.requestVote(
            request.term, request.candidateId,
            request.lastLogIndex, request.lastLogTerm,
          );
          node.handleVoteResponse(peerId, response);
        }
      }
    }

    // Heartbeats from leader
    for (const [, node] of this.nodes) {
      if (node.needsHeartbeat()) {
        for (const peerId of node.getPeers()) {
          const peer = this.nodes.get(peerId);
          if (!peer) continue;
          const req = node.buildAppendEntries(peerId);
          const resp = peer.appendEntries(
            req.term, req.leaderId, req.entries,
            req.prevLogIndex, req.prevLogTerm, req.leaderCommit,
          );
          node.handleAppendResponse(peerId, resp);
        }
      }
    }
  }

  /**
   * Drive ticks until a leader is elected (bounded).
   * Returns the elected leader's NodeId.
   */
  electLeader(maxTicks = 1000): Result<NodeId> {
    for (let i = 0; i < maxTicks; i++) {
      this.tick();
      const leader = this.getLeader();
      if (leader !== undefined) return ok(leader);
    }
    return err(new Error('Leader election did not converge'));
  }

  // ── CRDT Management ──────────────────────────────────────

  createCRDT(documentId?: UUID): CRDTDocument {
    const doc = new CRDTDocument(documentId);
    this.crdtDocuments.set(doc.documentId, doc);
    return doc;
  }

  getCRDT(documentId: UUID): CRDTDocument | undefined {
    return this.crdtDocuments.get(documentId);
  }

  mergeCRDT(
    documentId: UUID,
    key: string,
    remoteState: CRDTState,
    fromNode: NodeId,
  ): Result<void> {
    const doc = this.crdtDocuments.get(documentId);
    if (!doc) {
      return err(new Error(`CRDT document ${documentId} not found`));
    }

    switch (remoteState.type) {
      case CRDTType.ORSet:
        doc.orSetMerge(key, remoteState);
        break;
      case CRDTType.LWWRegister:
        doc.lwwMerge(key, remoteState);
        break;
      case CRDTType.GCounter:
        doc.gCounterMerge(key, remoteState);
        break;
      case CRDTType.PNCounter:
        doc.pnCounterMerge(key, remoteState);
        break;
      default:
        return err(new Error('Unknown CRDT type'));
    }

    this.eventBus.emit(createEvent(
      'CRDTMerged',
      BoundedContext.Consensus,
      { documentId, fromNode, operations: 1 },
    ));

    return ok(undefined);
  }
}
