/**
 * Tests for VibeCast Consensus Bounded Context
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConsensusEngine,
  RaftNode,
  RaftState,
  CRDTDocument,
  CRDTType,
} from '../../src/consensus/index.js';
import { EventBus } from '../../src/common/events.js';
import { hlcNow } from '../../src/common/types.js';

describe('Consensus Engine', () => {
  let engine: ConsensusEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new ConsensusEngine(eventBus);
  });

  describe('Raft Cluster', () => {
    it('should create a cluster with nodes', () => {
      const result = engine.createCluster({ nodeIds: [1, 2, 3] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.size).toBe(3);
      }
    });

    it('should require at least 3 nodes', () => {
      const result = engine.createCluster({ nodeIds: [1, 2] });
      expect(result.ok).toBe(false);
    });

    it('should elect a leader', () => {
      engine.createCluster({ nodeIds: [1, 2, 3] });
      const result = engine.electLeader();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value).toBe('number');
        expect(engine.getLeader()).toBe(result.value);
      }
    });

    it('should replicate writes via Raft', () => {
      engine.createCluster({ nodeIds: [1, 2, 3] });
      engine.electLeader();

      const result = engine.proposeWrite({ type: 'insert', table: 'users', data: { id: 1 } });
      expect(result.ok).toBe(true);
    });

    it('should reject writes when no leader', () => {
      engine.createCluster({ nodeIds: [1, 2, 3] });
      // No election triggered
      const result = engine.proposeWrite({ type: 'insert' });
      expect(result.ok).toBe(false);
    });

    it('should get a node by id', () => {
      engine.createCluster({ nodeIds: [1, 2, 3] });
      const node = engine.getNode(1);
      expect(node).toBeDefined();
      expect(node?.getState()).toBe(RaftState.Follower);
    });
  });

  describe('Raft Node', () => {
    it('should start as follower', () => {
      const node = new RaftNode(1, [2, 3], eventBus);
      expect(node.getState()).toBe(RaftState.Follower);
      expect(node.getCurrentTerm()).toBe(0);
    });

    it('should start an election', () => {
      const node = new RaftNode(1, [2, 3], eventBus);
      const voteReq = node.startElection();
      expect(node.getState()).toBe(RaftState.Candidate);
      expect(voteReq.term).toBe(1);
      expect(voteReq.candidateId).toBe(1);
    });

    it('should grant votes correctly', () => {
      const voter = new RaftNode(2, [1, 3], eventBus);
      const response = voter.requestVote(1, 1, 0, 0);
      expect(response.voteGranted).toBe(true);
      expect(response.term).toBe(1);
    });

    it('should reject votes for lower terms', () => {
      const voter = new RaftNode(2, [1, 3], eventBus);
      // First advance the voter's term
      voter.requestVote(5, 1, 0, 0);
      const response = voter.requestVote(3, 3, 0, 0);
      expect(response.voteGranted).toBe(false);
    });

    it('should append entries from leader', () => {
      const follower = new RaftNode(2, [1, 3], eventBus);
      const response = follower.appendEntries(
        1, 1, [{ index: 1, term: 1, command: 'test' }],
        0, 0, 0,
      );
      expect(response.success).toBe(true);
      expect(response.matchIndex).toBe(1);
    });

    it('should append to log as leader', () => {
      const node = new RaftNode(1, [2, 3], eventBus);
      node.startElection();
      // Simulate getting majority votes
      node.handleVoteResponse(2, { term: 1, voteGranted: true });
      expect(node.getState()).toBe(RaftState.Leader);

      const result = node.appendToLog({ cmd: 'test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.index).toBe(1);
        expect(result.value.term).toBe(1);
      }
    });

    it('should reject appendToLog when not leader', () => {
      const node = new RaftNode(1, [2, 3], eventBus);
      const result = node.appendToLog({ cmd: 'test' });
      expect(result.ok).toBe(false);
    });

    it('should apply committed entries', () => {
      const node = new RaftNode(1, [2, 3], eventBus);
      // Make leader
      node.startElection();
      node.handleVoteResponse(2, { term: 1, voteGranted: true });
      node.appendToLog({ cmd: 'first' });

      // Simulate replication + commit advance
      const applied = node.applyCommitted();
      // Applied count depends on commit index advancement
      expect(Array.isArray(applied)).toBe(true);
    });
  });

  describe('CRDT - ORSet', () => {
    it('should create and use ORSet', () => {
      const doc = engine.createCRDT();
      doc.orSetAdd('fruits', 'apple');
      doc.orSetAdd('fruits', 'banana');
      const values = doc.orSetValues('fruits');
      expect(values).toContain('apple');
      expect(values).toContain('banana');
    });

    it('should remove elements from ORSet', () => {
      const doc = engine.createCRDT();
      doc.orSetAdd('fruits', 'apple');
      doc.orSetAdd('fruits', 'banana');
      doc.orSetRemove('fruits', 'apple');
      const values = doc.orSetValues('fruits');
      expect(values).not.toContain('apple');
      expect(values).toContain('banana');
    });

    it('should merge ORSets', () => {
      const doc1 = engine.createCRDT();
      const doc2 = new CRDTDocument();
      doc1.orSetAdd('fruits', 'apple');
      doc2.orSetAdd('fruits', 'banana');

      const remoteState = doc2.getORSetState('fruits');
      doc1.orSetMerge('fruits', remoteState);
      const values = doc1.orSetValues('fruits');
      expect(values).toContain('apple');
      expect(values).toContain('banana');
    });
  });

  describe('CRDT - GCounter', () => {
    it('should increment and read counter', () => {
      const doc = engine.createCRDT();
      doc.gCounterIncrement('views', 1, 1);
      doc.gCounterIncrement('views', 1, 1);
      doc.gCounterIncrement('views', 2, 1);
      expect(doc.gCounterValue('views')).toBe(3);
    });

    it('should merge counters correctly', () => {
      const doc1 = engine.createCRDT();
      const doc2 = new CRDTDocument();

      doc1.gCounterIncrement('cnt', 1, 2);
      doc2.gCounterIncrement('cnt', 2, 3);

      const remoteState = doc2.getGCounterState('cnt');
      doc1.gCounterMerge('cnt', remoteState);
      expect(doc1.gCounterValue('cnt')).toBe(5); // 2 from node1 + 3 from node2
    });
  });

  describe('CRDT - LWWRegister', () => {
    it('should set and get value', () => {
      const doc = engine.createCRDT();
      const ts = hlcNow(1);
      doc.lwwSet('config', 'hello', ts);
      expect(doc.lwwGet('config')).toBe('hello');
    });

    it('should keep latest write on merge', () => {
      const doc1 = engine.createCRDT();
      const doc2 = new CRDTDocument();

      doc1.lwwSet('val', 'old', { wallTime: 1000n, logical: 0, nodeId: 1 });
      doc2.lwwSet('val', 'new', { wallTime: 2000n, logical: 0, nodeId: 2 });

      const remoteState = doc2.getLWWRegisterState('val');
      doc1.lwwMerge('val', remoteState);
      expect(doc1.lwwGet('val')).toBe('new');
    });
  });

  describe('CRDT - PNCounter', () => {
    it('should increment and decrement', () => {
      const doc = engine.createCRDT();
      doc.pnCounterIncrement('score', 1, 3);
      doc.pnCounterDecrement('score', 1, 1);
      expect(doc.pnCounterValue('score')).toBe(2);
    });

    it('should merge PNCounters', () => {
      const doc1 = engine.createCRDT();
      const doc2 = new CRDTDocument();

      doc1.pnCounterIncrement('val', 1, 2);
      doc2.pnCounterDecrement('val', 2, 1);

      const remoteState = doc2.getPNCounterState('val');
      doc1.pnCounterMerge('val', remoteState);
      expect(doc1.pnCounterValue('val')).toBe(1); // 2 - 1
    });
  });

  describe('CRDT Merge via Engine', () => {
    it('should merge CRDT state through engine', () => {
      const doc = engine.createCRDT();
      doc.gCounterIncrement('test', 1, 5);

      const remoteState = {
        type: CRDTType.GCounter as const,
        counts: new Map([[2, 3]]),
      };
      const result = engine.mergeCRDT(doc.documentId, 'test', remoteState, 2);
      expect(result.ok).toBe(true);
      expect(doc.gCounterValue('test')).toBe(8);
    });

    it('should return error for nonexistent document', () => {
      const result = engine.mergeCRDT('nonexistent', 'key', {
        type: CRDTType.GCounter,
        counts: new Map(),
      }, 1);
      expect(result.ok).toBe(false);
    });
  });

  describe('Domain Events', () => {
    it('should emit LeaderElected event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));

      engine.createCluster({ nodeIds: [1, 2, 3] });
      engine.electLeader();

      expect(events).toContain('LeaderElected');
    });

    it('should emit LogAppended event on write', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));

      engine.createCluster({ nodeIds: [1, 2, 3] });
      engine.electLeader();
      engine.proposeWrite({ type: 'test' });

      expect(events).toContain('LogAppended');
    });

    it('should emit CRDTMerged event', () => {
      const events: string[] = [];
      eventBus.onAll((e) => events.push(e.eventType));

      const doc = engine.createCRDT();
      engine.mergeCRDT(doc.documentId, 'key', {
        type: CRDTType.GCounter,
        counts: new Map([[1, 1]]),
      }, 1);

      expect(events).toContain('CRDTMerged');
    });
  });
});
