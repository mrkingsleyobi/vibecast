#!/bin/bash

MISSING_CRATES=(
  "aimds-core" "aimds-detection" "aimds-analysis" "aimds-response"
  "code-mesh-core" "code-mesh-cli" "code-mesh-tui" "code-mesh-wasm"
  "synaptic-daa-swarm" "synaptic-neural-mesh"
  "neuro-divergent" "neuro-divergent-core" "neuro-divergent-models"
  "neuro-divergent-registry" "neuro-divergent-training"
  "nano-consciousness" "neurodna" "goalie" "veritas-nexus"
  "bitchat-qudag" "claude_market" "agentic-payments"
  "nanosecond-scheduler" "strange-loop" "subjective-time-expansion" "qudag"
)

for crate in "${MISSING_CRATES[@]}"; do
  if ! grep -q "^${crate}$" /home/user/vibecast/ruv_complete_list.txt; then
    response=$(curl -s -H "User-Agent: vibecast-crate-fetcher" "https://crates.io/api/v1/crates/$crate")
    if echo "$response" | jq -e '.crate.name' > /dev/null 2>&1; then
      echo "$crate" >> /home/user/vibecast/ruv_complete_list.txt
      echo "✓ Added: $crate"
    fi
    sleep 0.1
  fi
done

sort -u /home/user/vibecast/ruv_complete_list.txt > /tmp/sorted_crates.txt
mv /tmp/sorted_crates.txt /home/user/vibecast/ruv_complete_list.txt

echo ""
echo "Total crates: $(wc -l < /home/user/vibecast/ruv_complete_list.txt)"
