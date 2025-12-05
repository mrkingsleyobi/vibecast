#!/bin/bash

# List of known crate name patterns from @ruv.io NPM packages
# We'll search for exact matches on crates.io

KNOWN_NAMES=(
  "aimds-core" "aimds-detection" "aimds-analysis" "aimds-response"
  "daa-ai" "goalie" "veritas-nexus" "kimi-expert-analyzer"
  "ruv-swarm-core" "ruv-swarm-agents" "ruv-swarm-ml" "ruv-swarm-ml-training"
  "ruv-swarm-persistence" "ruv-swarm-transport" "ruv-swarm-wasm" "ruv-swarm-daa"
  "ruv-swarm-mcp" "ruv-swarm-cli"
  "code-mesh-core" "code-mesh-cli" "code-mesh-tui" "code-mesh-wasm"
  "synaptic-daa-swarm" "synaptic-neural-mesh"
  "ruv-fann" "neuro-divergent" "neuro-divergent-core" "neuro-divergent-models"
  "neuro-divergent-registry" "neuro-divergent-training"
  "micro_core" "micro_cartan_attn" "micro_metrics" "micro_routing" "micro_swarm"
  "kimi-fann-core" "neurodna" "temporal-neural-solver" "nano-consciousness"
  "nt-core" "nt-backtesting" "nt-execution" "nt-features" "nt-market-data"
  "nt-memory" "nt-napi-bindings" "nt-neural" "nt-portfolio" "nt-streaming"
  "nt-utils" "nt-agentdb-client"
  "qudag" "qudag-crypto" "qudag-cli" "qudag-dag" "qudag-exchange"
  "qudag-exchange-core" "qudag-exchange-standalone-cli" "qudag-mcp"
  "qudag-network" "qudag-protocol" "qudag-vault-core" "qudag-wasm"
  "bitchat-qudag" "claude_market" "agentic-payments"
  "temporal-compare" "temporal-lead-solver" "temporal-attractor-studio"
  "nanosecond-scheduler" "strange-loop" "subjective-time-expansion"
  "midstreamer-attractor" "midstreamer-neural-solver" "midstreamer-quic"
  "midstreamer-scheduler" "midstreamer-strange-loop" "midstreamer-temporal-compare"
)

echo "Checking which crates exist on crates.io..."
echo ""

> ruv_found_crates.txt

for crate in "${KNOWN_NAMES[@]}"; do
  response=$(curl -s -H "User-Agent: vibecast-crate-fetcher" \
    "https://crates.io/api/v1/crates/$crate" 2>/dev/null)

  if echo "$response" | jq -e '.crate.name' > /dev/null 2>&1; then
    version=$(echo "$response" | jq -r '.crate.max_version // "unknown"')
    downloads=$(echo "$response" | jq -r '.crate.downloads // 0')
    echo "✓ $crate ($version) - $downloads downloads"
    echo "$crate" >> ruv_found_crates.txt
  else
    echo "✗ $crate (not found)"
  fi

  sleep 0.1
done

echo ""
echo "=== Summary ==="
found=$(wc -l < ruv_found_crates.txt)
total=${#KNOWN_NAMES[@]}
echo "Found: $found / $total crates"
echo ""
echo "Now searching for additional crates with ruv/qudag/nt/temporal/ruvector prefixes..."

# Search for additional crates
for prefix in "ruv-" "ruv_" "qudag-" "nt-" "temporal-" "ruvector-" "daa-" "kimi-" "micro_" "midstreamer-"; do
  curl -s -H "User-Agent: vibecast-crate-fetcher" \
    "https://crates.io/api/v1/crates?q=${prefix}&per_page=100" | \
    jq -r ".crates[] | select(.name | startswith(\"$prefix\")) | .name" >> ruv_all_crates_temp.txt 2>/dev/null
  sleep 0.2
done

sort -u ruv_all_crates_temp.txt > ruv_complete_list.txt
rm ruv_all_crates_temp.txt

total_found=$(wc -l < ruv_complete_list.txt)
echo "Total unique crates found: $total_found"
echo "Saved to: ruv_complete_list.txt"
