# Ruv.io Crates Analysis & Missing NPM Wrappers

**Generated:** 2025-12-05
**Repository:** vibecast

## Summary

- **Total Rust Crates on crates.io:** 160
- **NPM Packages (@ruv.io):** 78 (documented in catalog)
- **Missing NPM Wrappers:** 82 crates

## Missing Crates by Category

### 🔧 DAA (Detection/Analysis) Ecosystem (10 crates)
These are additional DAA framework crates not yet wrapped:

- `daa-chain` - Chain orchestration
- `daa-cli` - Command-line interface
- `daa-economy` - Economic modeling
- `daa-orchestrator` - System orchestration
- `daa-prime-cli` - Prime CLI
- `daa-prime-coordinator` - Coordinator
- `daa-prime-core` - Core functionality
- `daa-prime-dht` - DHT implementation
- `daa-prime-trainer` - Training system
- `daa-rules` - Rules engine

### 🎮 Micro Framework Extensions (22 crates)
Extended micro framework components:

- `micro_autotile` - Autotiling system
- `micro_banimate` - Animation system
- `micro_bevy_splash` - Bevy splash screens
- `micro_bevy_web_utils` - Bevy web utilities
- `micro_bevy_world_utils` - Bevy world utilities
- `micro_errors` - Error handling
- `micro_framebuffer` - Framebuffer management
- `micro_games_macros` - Game macros
- `micro_grad` - Gradient computation
- `micro_http_async` - Async HTTP
- `micro_http_server` - HTTP server
- `micro_ihex` - Intel HEX format
- `micro_lambda` - Lambda functions
- `micro_ldtk` - LDTK integration
- `micro_musicbox` - Music system
- `micro_ndarray` - N-dimensional arrays
- `micro_png` - PNG handling
- `micro_quest` - Quest system
- `micro_rand` - Random number generation
- `micro_tp` - Thread pool
- `micro_traffic_sim_core` - Traffic simulation
- `micro_types` - Type definitions

### 💹 Neural Trader Extensions (17 crates)
Additional NT ecosystem crates:

- `nt-apiset` - API set definitions
- `nt-dll-sys` - DLL system bindings
- `nt-hive` - Hive storage
- `nt-leb128` - LEB128 encoding
- `nt-list` - List structures
- `nt-list_macros` - List macros
- `nt-load-order` - Load order management
- `nt-load-order-gui` - Load order GUI
- `nt-network` - Network layer
- `nt-packet` - Packet handling
- `nt-packet-derive` - Packet derivation macros
- `nt-primes` - Prime number utilities
- `nt-rs` - Core Rust bindings
- `nt-string` - String handling
- `nt-time` - Time utilities
- `nt-token` - Token management
- `nt-user-call` - User call handling

### 🗄️ RuVector Ecosystem (29 crates)
The entire RuVector distributed vector database:

- `ruvector-attention` - Attention mechanisms
- `ruvector-cli` - Command-line interface
- `ruvector-cluster` - Clustering
- `ruvector-collections` - Collection types
- `ruvector-core` - Core functionality
- `ruvector-filter` - Filtering
- `ruvector-gnn` - Graph Neural Networks
- `ruvector-gnn-node` - GNN Node.js bindings
- `ruvector-gnn-wasm` - GNN WASM
- `ruvector-graph` - Graph operations
- `ruvector-graph-node` - Graph Node.js bindings
- `ruvector-graph-wasm` - Graph WASM
- `ruvector-metrics` - Metrics collection
- `ruvector-node` - Node.js bindings
- `ruvector-postgres` - PostgreSQL extension
- `ruvector-raft` - Raft consensus
- `ruvector-replication` - Replication
- `ruvector-router-cli` - Router CLI
- `ruvector-router-core` - Router core
- `ruvector-router-ffi` - Router FFI
- `ruvector-router-wasm` - Router WASM
- `ruvector-scipix` - SciPix integration
- `ruvector-server` - Server implementation
- `ruvector-snapshot` - Snapshotting
- `ruvector-sona` - SONA runtime adaptation
- `ruvector-tiny-dancer-core` - Tiny Dancer core
- `ruvector-tiny-dancer-node` - Tiny Dancer Node.js
- `ruvector-tiny-dancer-wasm` - Tiny Dancer WASM
- `ruvector-wasm` - WASM bindings

### ⏰ Temporal SDK (4 crates)
Temporal workflow SDK components:

- `temporal-ai-core` - AI core functionality
- `temporal-sdk-core` - SDK core
- `temporal-sdk-core-api` - SDK API
- `temporal-sdk-core-protos` - SDK protocol buffers

## Recommendations for Integration

### Priority 1: High-Value Packages
These packages provide significant functionality and should be prioritized:

1. **RuVector Ecosystem** - Complete distributed vector database with GNN
   - Start with: `ruvector-core`, `ruvector-node`, `ruvector-gnn-node`
   - ~29 packages, major missing feature set

2. **DAA Prime Suite** - Advanced detection/analysis capabilities
   - Start with: `daa-prime-core`, `daa-prime-coordinator`, `daa-cli`
   - ~10 packages, extends existing DAA functionality

3. **Temporal SDK** - Production-grade workflow orchestration
   - Start with: `temporal-sdk-core`, `temporal-ai-core`
   - ~4 packages, industry-standard workflow engine

### Priority 2: Framework Extensions
Useful but lower priority:

4. **NT System Extensions** - Additional Neural Trader capabilities
   - ~17 packages, mostly internal/utility crates

5. **Micro Framework Extensions** - Game dev and utility functions
   - ~22 packages, specialized use cases

## Tracking Updates

### Automated Monitoring
Set up these tools to track new ruv.io releases:

```json
{
  "scripts": {
    "check-updates": "npx npm-check-updates -f \"@ruv.io/*\"",
    "update-ruv": "npx npm-check-updates -u -f \"@ruv.io/*\" && npm install"
  }
}
```

### Using Renovate Bot
Add to `renovate.json`:

```json
{
  "packageRules": [
    {
      "matchPackagePatterns": ["^@ruv\\.io/"],
      "groupName": "ruv.io packages",
      "automerge": false,
      "schedule": ["before 10am on Monday"]
    }
  ]
}
```

### Manual Checking
Periodically check these sources:
- NPM: https://www.npmjs.com/org/ruv.io
- GitHub: https://github.com/ruvnet/ruv.io
- Crates.io: Search for "ruv-", "qudag-", "ruvector-", etc.

## Package Installation Examples

### Install specific missing functionality:
```bash
# Vector database
npm install @ruv.io/ruvector-core @ruv.io/ruvector-node

# Advanced DAA
npm install @ruv.io/daa-prime-core @ruv.io/daa-cli

# Temporal workflows
npm install @ruv.io/temporal-sdk-core @ruv.io/temporal-ai-core
```

### Monitor all ruv.io packages:
```bash
# List all installed ruv.io packages
npm list --depth=0 | grep @ruv.io

# Check for updates
npm outdated --scope=@ruv.io
```

## Files Generated

- `all_ruv_crates.txt` - Legacy search results
- `ruv_complete_list.txt` - Complete list of 160 crates (✓)
- `npm_packages_list.txt` - 78 NPM packages (✓)
- `missing_npm_wrappers.txt` - 82 missing wrappers (✓)
- `RUV_CRATES_ANALYSIS.md` - This document (✓)

## Next Steps

1. **Review Priority 1 packages** - Determine which ones fit your use case
2. **Test availability** - Check if any missing packages have been recently published
3. **Set up monitoring** - Implement Renovate or Dependabot
4. **Contact maintainer** - Request specific packages if needed
5. **Consider contributing** - Help wrap priority crates as NPM packages

---

**Note:** The ruv.io ecosystem is actively developed. Check the GitHub repo regularly for new releases and package additions.
