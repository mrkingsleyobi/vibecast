# DPDK Network Architecture - Phase 2

**Agent:** infrastructure-agent
**Based on:** IMPLEMENTATION_PLAN.md Month 4-6
**Target:** 2-5μs network latency (from 50μs Phase 1)
**Expected Improvement:** 96% latency reduction
**AgentDB Success Rate:** 95%

---

## Overview

DPDK (Data Plane Development Kit) bypasses the kernel network stack, providing direct access to network hardware for ultra-low latency packet processing.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Trading Application                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌──────────────┐            │
│  │   Strategy   │────────▶│    DPDK      │            │
│  │   Engine     │         │   Market     │            │
│  │              │         │   Data RX    │            │
│  └──────────────┘         └──────────────┘            │
│         │                        │                      │
│         │                        ▼                      │
│         │              ┌──────────────┐                │
│         │              │  Lock-Free   │                │
│         └─────────────▶│    SPSC      │                │
│                        │    Queue     │                │
│                        └──────────────┘                │
│                               │                         │
│                               ▼                         │
│                     ┌──────────────┐                   │
│                     │ Memory Pool  │                   │
│                     │ (Huge Pages) │                   │
│                     └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                      DPDK PMD                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │  RX Queue  │  │  RX Queue  │  │  RX Queue  │       │
│  │   (Core 1) │  │   (Core 2) │  │   (Core 3) │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
                      ┌────────────┐
                      │   NIC      │
                      │  (10GbE)   │
                      └────────────┘
```

## Key Components

### 1. EAL (Environment Abstraction Layer)

Initialization and core management:

```cpp
// Initialize DPDK EAL
int dpdk_init(int argc, char** argv) {
    int ret = rte_eal_init(argc, argv);
    if (ret < 0) {
        rte_exit(EXIT_FAILURE, "EAL initialization failed\n");
    }

    // Get number of available cores
    unsigned nb_cores = rte_lcore_count();
    printf("DPDK initialized with %u cores\n", nb_cores);

    return ret;
}

// EAL arguments:
// --lcores='(0-3)@(4-7)' - Map logical cores 0-3 to physical 4-7
// --socket-mem=1024,1024 - 1GB per NUMA socket
// -n 4 - 4 memory channels
// --huge-dir=/mnt/huge - Huge pages directory
```

### 2. Port Configuration

Network port setup:

```cpp
#define RX_RING_SIZE 1024
#define TX_RING_SIZE 1024
#define NUM_MBUFS 8191
#define MBUF_CACHE_SIZE 250

struct rte_eth_conf port_conf = {
    .rxmode = {
        .mq_mode = ETH_MQ_RX_RSS,  // RSS for multi-queue
        .max_rx_pkt_len = RTE_ETHER_MAX_LEN,
        .offloads = DEV_RX_OFFLOAD_CHECKSUM,
    },
    .txmode = {
        .mq_mode = ETH_MQ_TX_NONE,
        .offloads = (DEV_TX_OFFLOAD_IPV4_CKSUM |
                     DEV_TX_OFFLOAD_UDP_CKSUM |
                     DEV_TX_OFFLOAD_TCP_CKSUM),
    },
    .rx_adv_conf = {
        .rss_conf = {
            .rss_key = NULL,
            .rss_hf = ETH_RSS_IP | ETH_RSS_TCP | ETH_RSS_UDP,
        },
    },
};

int port_init(uint16_t port, struct rte_mempool* mbuf_pool) {
    uint16_t nb_rxd = RX_RING_SIZE;
    uint16_t nb_txd = TX_RING_SIZE;

    // Configure port
    int ret = rte_eth_dev_configure(port, 1, 1, &port_conf);
    if (ret != 0) return ret;

    // Setup RX queue
    ret = rte_eth_rx_queue_setup(port, 0, nb_rxd,
        rte_eth_dev_socket_id(port), NULL, mbuf_pool);
    if (ret < 0) return ret;

    // Setup TX queue
    ret = rte_eth_tx_queue_setup(port, 0, nb_txd,
        rte_eth_dev_socket_id(port), NULL);
    if (ret < 0) return ret;

    // Start port
    ret = rte_eth_dev_start(port);
    if (ret < 0) return ret;

    // Enable promiscuous mode
    rte_eth_promiscuous_enable(port);

    return 0;
}
```

### 3. Memory Pool (Huge Pages)

```cpp
struct rte_mempool* create_mbuf_pool(void) {
    struct rte_mempool* mbuf_pool = rte_pktmbuf_pool_create(
        "MBUF_POOL",           // Name
        NUM_MBUFS,             // Number of mbufs
        MBUF_CACHE_SIZE,       // Cache size
        0,                      // Private data size
        RTE_MBUF_DEFAULT_BUF_SIZE,  // Data room size
        rte_socket_id()        // NUMA socket
    );

    if (mbuf_pool == NULL)
        rte_exit(EXIT_FAILURE, "Cannot create mbuf pool\n");

    return mbuf_pool;
}
```

### 4. Packet Reception (Zero-Copy)

```cpp
#define BURST_SIZE 32

// RX loop on dedicated core
static int lcore_rx(__attribute__((unused)) void* arg) {
    uint16_t port = 0;
    struct rte_mbuf* bufs[BURST_SIZE];

    printf("RX thread starting on core %u\n", rte_lcore_id());

    while (running) {
        // Receive burst of packets
        const uint16_t nb_rx = rte_eth_rx_burst(port, 0, bufs, BURST_SIZE);

        if (unlikely(nb_rx == 0))
            continue;

        // Process packets
        for (uint16_t i = 0; i < nb_rx; i++) {
            struct rte_mbuf* mbuf = bufs[i];

            // Get packet data (zero-copy)
            uint8_t* pkt_data = rte_pktmbuf_mtod(mbuf, uint8_t*);
            uint16_t pkt_len = rte_pktmbuf_pkt_len(mbuf);

            // Parse packet (FIX protocol)
            process_market_data_packet(pkt_data, pkt_len);

            // Free mbuf
            rte_pktmbuf_free(mbuf);
        }

        rx_packets += nb_rx;
    }

    return 0;
}
```

### 5. Packet Transmission

```cpp
static int lcore_tx(__attribute__((unused)) void* arg) {
    uint16_t port = 0;
    struct rte_mbuf* tx_bufs[BURST_SIZE];
    uint16_t nb_tx = 0;

    printf("TX thread starting on core %u\n", rte_lcore_id());

    while (running) {
        // Get orders from queue
        while (nb_tx < BURST_SIZE && !order_queue_empty()) {
            Order* order = order_queue_pop();

            // Allocate mbuf
            struct rte_mbuf* mbuf = rte_pktmbuf_alloc(mbuf_pool);
            if (mbuf == NULL) break;

            // Build FIX message
            uint8_t* pkt_data = rte_pktmbuf_mtod(mbuf, uint8_t*);
            uint16_t pkt_len = build_fix_order_message(order, pkt_data);

            mbuf->data_len = pkt_len;
            mbuf->pkt_len = pkt_len;

            tx_bufs[nb_tx++] = mbuf;
        }

        if (nb_tx > 0) {
            // Send burst
            uint16_t nb_sent = rte_eth_tx_burst(port, 0, tx_bufs, nb_tx);

            // Free unsent packets
            for (uint16_t i = nb_sent; i < nb_tx; i++) {
                rte_pktmbuf_free(tx_bufs[i]);
            }

            tx_packets += nb_sent;
            nb_tx = 0;
        }
    }

    return 0;
}
```

## CPU Core Assignment

```
Core 0: OS & management (not isolated)
Core 1: DPDK RX (isolated, pinned)
Core 2: Strategy Engine (isolated, pinned)
Core 3: DPDK TX (isolated, pinned)
Core 4-7: Available for scaling
```

## System Configuration

### Huge Pages Setup

```bash
#!/bin/bash
# setup_hugepages.sh

# Reserve 2GB of 2MB huge pages
echo 1024 > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages

# Mount huge pages
mkdir -p /mnt/huge
mount -t hugetlbfs nodev /mnt/huge

# Verify
cat /proc/meminfo | grep Huge
```

### CPU Isolation

```bash
# /etc/default/grub
GRUB_CMDLINE_LINUX="isolcpus=1-3 nohz_full=1-3 rcu_nocbs=1-3"

# Update grub
sudo update-grub
sudo reboot
```

### NUMA Configuration

```bash
# Check NUMA topology
numactl --hardware

# Run with NUMA awareness
numactl --cpunodebind=0 --membind=0 ./trading_engine
```

## Performance Optimizations

### 1. Batch Processing

```cpp
// Process packets in batches for better cache utilization
for (int batch = 0; batch < nb_rx; batch += 8) {
    __builtin_prefetch(bufs[batch + 8]);  // Prefetch next batch

    for (int i = 0; i < 8 && (batch + i) < nb_rx; i++) {
        process_packet(bufs[batch + i]);
    }
}
```

### 2. RSS (Receive Side Scaling)

```cpp
// Distribute packets across multiple RX queues based on hash
struct rte_eth_rss_conf rss_conf = {
    .rss_key = rss_key,
    .rss_key_len = 40,
    .rss_hf = ETH_RSS_IP | ETH_RSS_TCP,
};
```

### 3. Hardware Offloads

```cpp
// Offload checksum calculation to NIC
port_conf.txmode.offloads = (
    DEV_TX_OFFLOAD_IPV4_CKSUM |
    DEV_TX_OFFLOAD_UDP_CKSUM |
    DEV_TX_OFFLOAD_TCP_CKSUM
);
```

## Performance Targets

| Metric | Phase 1 | Phase 2 (DPDK) | Improvement |
|--------|---------|----------------|-------------|
| Network RX Latency | 50μs | 2μs | 96% |
| Packet Processing | 10K/s | 500K/s | 50x |
| CPU Utilization | 80% | 40% | 50% reduction |
| Cache Misses | High | Low | Better locality |

## Monitoring

```cpp
// DPDK statistics
struct rte_eth_stats stats;
rte_eth_stats_get(port, &stats);

printf("RX packets: %lu\n", stats.ipackets);
printf("TX packets: %lu\n", stats.opackets);
printf("RX errors: %lu\n", stats.ierrors);
printf("RX dropped: %lu\n", stats.imissed);
```

## Integration with Trading Platform

```cpp
// Main trading engine with DPDK
int main(int argc, char** argv) {
    // Initialize DPDK
    dpdk_init(argc, argv);

    // Create memory pool
    mbuf_pool = create_mbuf_pool();

    // Initialize port
    port_init(0, mbuf_pool);

    // Launch RX thread on core 1
    rte_eal_remote_launch(lcore_rx, NULL, 1);

    // Launch strategy engine on core 2
    rte_eal_remote_launch(lcore_strategy, NULL, 2);

    // Launch TX thread on core 3
    rte_eal_remote_launch(lcore_tx, NULL, 3);

    // Wait for threads
    rte_eal_mp_wait_lcore();

    return 0;
}
```

## Based On

- IMPLEMENTATION_PLAN.md Month 4-6
- AgentDB Learning: DPDK reduces network latency by 96% (Success Rate: 95%)
- Intel DPDK documentation
- Phase 2 performance targets
