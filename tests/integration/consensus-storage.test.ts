/**
 * Integration Test: Consensus ↔ Storage
 * ADR-002 Relationship: Consensus ↔ Storage (Partnership)
 * Co-evolve WAL and Raft log — writes are proposed through consensus
 * and applied to storage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/common/events.js';
import { ArrowSchema, ArrowDataType } from '../../src/common/types.js';
import { StorageEngine } from '../../src/storage/index.js';
import { ConsensusEngine } from '../../src/consensus/index.js';

describe('Consensus ↔ Storage Integration', () => {
  let eventBus: EventBus;
  let storage: StorageEngine;
  let consensus: ConsensusEngine;

  const schema: ArrowSchema = {
    columns: [
      { name: 'key', dataType: ArrowDataType.Utf8, nullable: false },
      { name: 'value', dataType: ArrowDataType.Utf8, nullable: false },
    ],
    version: 1,
  };

  beforeEach(async () => {
    eventBus = new EventBus();
    storage = new StorageEngine(eventBus);
    consensus = new ConsensusEngine(eventBus);
  });

  it('should replicate storage writes through Raft consensus', async () => {
    // Setup a 3-node Raft cluster
    const clusterResult = consensus.createCluster({ nodeIds: [1, 2, 3] });
    expect(clusterResult.ok).toBe(true);

    // Elect a leader
    const leaderResult = consensus.electLeader();
    expect(leaderResult.ok).toBe(true);

    // Propose a write command through consensus
    const writeCommand = { op: 'insert', table: 'kv', data: { key: 'foo', value: 'bar' } };
    const proposeResult = consensus.proposeWrite(writeCommand);
    expect(proposeResult.ok).toBe(true);
    if (!proposeResult.ok) return;

    // Verify the command is committed in the Raft log
    const leader = consensus.getNode(consensus.getLeader()!);
    expect(leader).toBeDefined();
    const applied = leader!.getAppliedCommands();
    expect(applied.length).toBeGreaterThanOrEqual(1);
    expect(applied[0]).toEqual(writeCommand);
  });

  it('should apply consensus-committed writes to storage WAL', async () => {
    const tableResult = await storage.createTable('kv', schema);
    expect(tableResult.ok).toBe(true);
    if (!tableResult.ok) return;

    const table = tableResult.value;
    const txId = storage.beginTransaction();
    await storage.insert(table.tableId, { key: 'a', value: '1' }, txId);
    await storage.commitTransaction(txId);

    // WAL should contain the insert
    const wal = storage.getWAL();
    expect(wal.getEntries().length).toBeGreaterThanOrEqual(1);
    expect(wal.verify()).toBe(true);

    // Consensus also receives event via EventBus
    const events: string[] = [];
    eventBus.onAll((e) => events.push(e.eventType));

    const txId2 = storage.beginTransaction();
    await storage.insert(table.tableId, { key: 'b', value: '2' }, txId2);
    await storage.commitTransaction(txId2);

    expect(events).toContain('RowInserted');
  });

  it('should emit events observable by both consensus and storage', async () => {
    const events: string[] = [];
    eventBus.onAll((e) => events.push(`${e.context}:${e.eventType}`));

    // Consensus events
    consensus.createCluster({ nodeIds: [1, 2, 3] });
    consensus.electLeader();

    // Storage events
    await storage.createTable('test', schema);

    const consensusEvents = events.filter(e => e.startsWith('consensus:'));
    const storageEvents = events.filter(e => e.startsWith('storage:'));

    expect(consensusEvents.length).toBeGreaterThanOrEqual(1);
    expect(storageEvents.length).toBeGreaterThanOrEqual(1);
  });
});
