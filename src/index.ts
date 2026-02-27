/**
 * VibeCast — Real-Time Reactive Vector Database
 * SpacetimeDB × ruvector Fusion Architecture
 *
 * A distributed, real-time vector database that pushes semantic
 * search results to connected clients.
 */

export * from './common/index.js';
export * from './server/index.js';

// Bounded contexts are exported individually to maintain DDD boundaries
export { StorageEngine } from './storage/index.js';
export { QueryEngine, VectorIndex } from './query/index.js';
export { SubscriptionEngine } from './subscription/index.js';
export { RuntimeEngine } from './runtime/index.js';
export { ConsensusEngine } from './consensus/index.js';
export { IntelligenceEngine } from './intelligence/index.js';
export { SecurityEngine } from './security/index.js';
export { IntegrationEngine } from './integration/index.js';
