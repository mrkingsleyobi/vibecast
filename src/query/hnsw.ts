/**
 * VibeCast Query — HNSW Vector Index
 * Hierarchical Navigable Small World graph for approximate nearest neighbor search.
 * ADR-001: sub-100us vector search target for 1M vectors.
 * ADR-002: Split from monolithic query module into DDD-compliant submodule.
 */
import {
  UUID, Vector, DistanceMetric, SearchResult, generateId,
} from '../common/types.js';
import { DomainEvent } from '../common/events.js';
import { distanceFunction } from './distance.js';

// ─── HNSW Node ───────────────────────────────────────────────

export interface HnswNode {
  id: UUID;
  vector: Vector;
  neighbors: UUID[][];  // neighbors[layer] = list of neighbor ids
  data?: Record<string, unknown>;
}

// ─── HNSW Configuration ─────────────────────────────────────

export interface HnswConfig {
  m: number;            // max neighbors per layer
  mMax0: number;        // max neighbors at layer 0
  efConstruction: number;
  efSearch: number;
  ml: number;           // level generation factor (1/ln(m))
}

export const DEFAULT_HNSW_CONFIG: HnswConfig = {
  m: 16,
  mMax0: 32,
  efConstruction: 200,
  efSearch: 50,
  ml: 1 / Math.log(16),
};

// ─── VectorIndex — Aggregate Root ────────────────────────────

export class VectorIndex {
  readonly indexId: UUID;
  readonly tableId: UUID;
  readonly column: string;
  readonly dimensions: number;
  readonly metric: DistanceMetric;
  readonly config: HnswConfig;

  private nodes: Map<UUID, HnswNode> = new Map();
  private entryPoint: UUID | null = null;
  private maxLevel = 0;
  private boundaryDistances: Map<UUID, number> = new Map();

  private readonly events: DomainEvent[] = [];

  constructor(
    tableId: UUID,
    column: string,
    dimensions: number,
    metric: DistanceMetric = DistanceMetric.Cosine,
    config: Partial<HnswConfig> = {},
  ) {
    this.indexId = generateId();
    this.tableId = tableId;
    this.column = column;
    this.dimensions = dimensions;
    this.metric = metric;
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
  }

  get size(): number {
    return this.nodes.size;
  }

  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events.length = 0;
  }

  /** Generate a random level for a new node using the skip-list probability. */
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.config.ml && level < 32) level++;
    return level;
  }

  /** Return the max number of neighbors allowed at a given layer. */
  private maxNeighbors(layer: number): number {
    return layer === 0 ? this.config.mMax0 : this.config.m;
  }

  /** Greedy search at a single layer, returning ef closest candidates. */
  private searchLayer(
    query: Vector,
    entryIds: UUID[],
    ef: number,
    layer: number,
    dist: (a: Vector, b: Vector) => number,
  ): Array<{ id: UUID; distance: number }> {
    const visited = new Set<UUID>(entryIds);
    const candidates: Array<{ id: UUID; distance: number }> = [];
    const results: Array<{ id: UUID; distance: number }> = [];

    for (const eid of entryIds) {
      const node = this.nodes.get(eid)!;
      const d = dist(query, node.vector);
      candidates.push({ id: eid, distance: d });
      results.push({ id: eid, distance: d });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    results.sort((a, b) => a.distance - b.distance);

    while (candidates.length > 0) {
      const closest = candidates.shift()!;
      const farthestResult = results[results.length - 1];

      if (results.length >= ef && closest.distance > farthestResult.distance) {
        break;
      }

      const closestNode = this.nodes.get(closest.id)!;
      const neighbors = closestNode.neighbors[layer] ?? [];

      for (const nid of neighbors) {
        if (visited.has(nid)) continue;
        visited.add(nid);

        const neighborNode = this.nodes.get(nid);
        if (!neighborNode) continue;

        const d = dist(query, neighborNode.vector);
        const worstResult = results[results.length - 1];

        if (results.length < ef || d < worstResult.distance) {
          candidates.push({ id: nid, distance: d });
          results.push({ id: nid, distance: d });
          results.sort((a, b) => a.distance - b.distance);

          if (results.length > ef) results.pop();

          // Keep candidates sorted for greedy traversal
          candidates.sort((a, b) => a.distance - b.distance);
        }
      }
    }

    return results;
  }

  /** Prune neighbors to keep only the closest maxN. */
  private pruneNeighbors(
    nodeId: UUID,
    neighborIds: UUID[],
    maxN: number,
    dist: (a: Vector, b: Vector) => number,
  ): UUID[] {
    const node = this.nodes.get(nodeId)!;
    const scored = neighborIds
      .filter(nid => this.nodes.has(nid) && nid !== nodeId)
      .map(nid => ({ id: nid, distance: dist(node.vector, this.nodes.get(nid)!.vector) }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, maxN).map(s => s.id);
  }

  /** Insert a vector into the HNSW index. */
  insertVector(id: UUID, vector: Vector, data?: Record<string, unknown>): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }

    const level = this.randomLevel();
    const neighbors: UUID[][] = Array.from({ length: level + 1 }, () => []);
    const newNode: HnswNode = { id, vector, neighbors, data };
    this.nodes.set(id, newNode);

    const dist = distanceFunction(this.metric);

    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentEntries = [this.entryPoint];

    // Traverse from top layer down to the node's insertion level + 1
    for (let lc = this.maxLevel; lc > level; lc--) {
      const nearest = this.searchLayer(vector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Insert at each layer from min(level, maxLevel) down to 0
    const topInsertLayer = Math.min(level, this.maxLevel);
    for (let lc = topInsertLayer; lc >= 0; lc--) {
      const nearest = this.searchLayer(
        vector, currentEntries, this.config.efConstruction, lc, dist,
      );

      const maxN = this.maxNeighbors(lc);
      const selectedNeighbors = nearest.slice(0, maxN).map(n => n.id);

      newNode.neighbors[lc] = selectedNeighbors;

      // Add bidirectional connections and prune if needed
      for (const nid of selectedNeighbors) {
        const neighbor = this.nodes.get(nid)!;
        while (neighbor.neighbors.length <= lc) neighbor.neighbors.push([]);
        neighbor.neighbors[lc].push(id);

        if (neighbor.neighbors[lc].length > maxN) {
          neighbor.neighbors[lc] = this.pruneNeighbors(
            nid, neighbor.neighbors[lc], maxN, dist,
          );
        }
      }

      currentEntries = nearest.map(n => n.id);
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  /** Delete a vector from the index by removing all neighbor references. */
  deleteVector(id: UUID): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove this node from all its neighbors' neighbor lists
    for (let layer = 0; layer < node.neighbors.length; layer++) {
      for (const nid of node.neighbors[layer]) {
        const neighbor = this.nodes.get(nid);
        if (neighbor && neighbor.neighbors[layer]) {
          neighbor.neighbors[layer] = neighbor.neighbors[layer].filter(x => x !== id);
        }
      }
    }

    this.nodes.delete(id);
    this.boundaryDistances.delete(id);

    // If we deleted the entry point, pick a new one
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.maxLevel = 0;
      } else {
        this.entryPoint = this.nodes.keys().next().value!;
        const ep = this.nodes.get(this.entryPoint)!;
        this.maxLevel = ep.neighbors.length - 1;
      }
    }

    return true;
  }

  /** Top-k nearest neighbor search. */
  search(
    queryVector: Vector,
    k: number,
    metric?: DistanceMetric,
  ): SearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) return [];

    const dist = distanceFunction(metric ?? this.metric);
    let currentEntries = [this.entryPoint];

    // Descend from top layer to layer 1, greedy nearest
    for (let lc = this.maxLevel; lc > 0; lc--) {
      const nearest = this.searchLayer(queryVector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Search at layer 0 with ef >= k
    const ef = Math.max(this.config.efSearch, k);
    const results = this.searchLayer(queryVector, currentEntries, ef, 0, dist);

    const topK = results.slice(0, k);

    // Track boundary distance for subscription delta computation
    if (topK.length > 0) {
      const boundaryDist = topK[topK.length - 1].distance;
      const queryKey = Array.from(queryVector.slice(0, 4)).join(',');
      this.boundaryDistances.set(queryKey as UUID, boundaryDist);
    }

    return topK.map(r => {
      const node = this.nodes.get(r.id)!;
      return { id: r.id, distance: r.distance, data: node.data };
    });
  }

  /** Top-k search with a predicate filter applied to node data. */
  searchFiltered(
    queryVector: Vector,
    k: number,
    filter: (data?: Record<string, unknown>) => boolean,
    metric?: DistanceMetric,
  ): SearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) return [];

    const dist = distanceFunction(metric ?? this.metric);
    let currentEntries = [this.entryPoint];

    for (let lc = this.maxLevel; lc > 0; lc--) {
      const nearest = this.searchLayer(queryVector, currentEntries, 1, lc, dist);
      currentEntries = nearest.length > 0 ? [nearest[0].id] : currentEntries;
    }

    // Over-fetch to account for filtered-out results
    const ef = Math.max(this.config.efSearch, k * 4);
    const candidates = this.searchLayer(queryVector, currentEntries, ef, 0, dist);

    const filtered: SearchResult[] = [];
    for (const c of candidates) {
      const node = this.nodes.get(c.id)!;
      if (filter(node.data)) {
        filtered.push({ id: c.id, distance: c.distance, data: node.data });
        if (filtered.length >= k) break;
      }
    }

    return filtered;
  }

  /** Get the boundary distance for the last search (for subscription deltas). */
  getBoundaryDistance(queryFingerprint: UUID): number | undefined {
    return this.boundaryDistances.get(queryFingerprint);
  }
}
