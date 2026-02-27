/**
 * VibeCast Consensus — ConsensusEngine Service
 * Orchestrates Raft (strong consistency) and CRDT (eventual consistency).
 * Per ADR-002 / ADR-005.
 */
import type { UUID, NodeId, Result } from '../common/types.js';
import { ok, err } from '../common/types.js';
import { BoundedContext, createEvent, EventBus } from '../common/events.js';
import type { LogEntry } from './raft-types.js';
import { RaftState } from './raft-types.js';
import type { CRDTState } from './crdt-types.js';
import { CRDTType } from './crdt-types.js';
import { RaftNode } from './raft-node.js';
import { CRDTDocument } from './crdt-document.js';

// ─── Cluster Configuration ──────────────────────────────────

export interface ClusterConfig {
  nodeIds: NodeId[];
}

// ─── ConsensusEngine Service ─────────────────────────────────

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
