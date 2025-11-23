#!/bin/bash
# System Setup for Phase 2 - Low-Latency Trading
#
# Agent: infrastructure-agent
# Based on: IMPLEMENTATION_PLAN.md Month 10-12
# Reference: plans/optimization/optimization-strategies.md

set -e

echo "========================================="
echo "Trading Platform Phase 2 System Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    exit 1
fi

# Configuration
ISOLATED_CPUS="1-3"          # CPUs for trading (isolated from OS)
HOUSEKEEPING_CPUS="0,4-7"    # CPUs for OS and other tasks
HUGEPAGE_SIZE="2M"
HUGEPAGE_COUNT=1024          # 2GB of huge pages

echo "Step 1: CPU Isolation"
echo "====================="
echo "Isolated CPUs: $ISOLATED_CPUS (for trading)"
echo "Housekeeping CPUs: $HOUSEKEEPING_CPUS (for OS)"
echo ""

# Update GRUB configuration
GRUB_FILE="/etc/default/grub"
GRUB_BACKUP="${GRUB_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "Backing up GRUB config to $GRUB_BACKUP"
cp "$GRUB_FILE" "$GRUB_BACKUP"

# Add kernel parameters for CPU isolation
GRUB_CMDLINE="isolcpus=$ISOLATED_CPUS nohz_full=$ISOLATED_CPUS rcu_nocbs=$ISOLATED_CPUS"
GRUB_CMDLINE="$GRUB_CMDLINE intel_pstate=disable processor.max_cstate=1"
GRUB_CMDLINE="$GRUB_CMDLINE intel_idle.max_cstate=0 idle=poll"
GRUB_CMDLINE="$GRUB_CMDLINE tsc=reliable clocksource=tsc"

# Check if parameters already exist
if grep -q "isolcpus=" "$GRUB_FILE"; then
    echo "CPU isolation parameters already configured"
else
    echo "Adding CPU isolation parameters to GRUB"
    sed -i "s/GRUB_CMDLINE_LINUX=\"/GRUB_CMDLINE_LINUX=\"$GRUB_CMDLINE /" "$GRUB_FILE"
fi

echo ""
echo "Step 2: Huge Pages"
echo "=================="
echo "Setting up ${HUGEPAGE_COUNT}x ${HUGEPAGE_SIZE} huge pages ($(( HUGEPAGE_COUNT * 2 ))MB)"
echo ""

# Reserve huge pages
if [ "$HUGEPAGE_SIZE" = "2M" ]; then
    echo $HUGEPAGE_COUNT > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
elif [ "$HUGEPAGE_SIZE" = "1G" ]; then
    echo $HUGEPAGE_COUNT > /sys/kernel/mm/hugepages/hugepages-1048576kB/nr_hugepages
fi

# Create mount point
HUGEPAGE_MOUNT="/mnt/huge"
mkdir -p "$HUGEPAGE_MOUNT"

# Mount huge pages
if ! mount | grep -q "$HUGEPAGE_MOUNT"; then
    mount -t hugetlbfs nodev "$HUGEPAGE_MOUNT"
    echo "Mounted huge pages at $HUGEPAGE_MOUNT"
fi

# Make huge pages persistent
if ! grep -q "$HUGEPAGE_MOUNT" /etc/fstab; then
    echo "nodev $HUGEPAGE_MOUNT hugetlbfs defaults 0 0" >> /etc/fstab
    echo "Added huge pages to /etc/fstab for persistence"
fi

# Verify huge pages
echo ""
echo "Huge Pages Status:"
cat /proc/meminfo | grep Huge

echo ""
echo "Step 3: IRQ Affinity"
echo "===================="
echo "Moving IRQs away from isolated CPUs"
echo ""

# Move all IRQs to housekeeping CPUs
for irq in /proc/irq/*/smp_affinity_list; do
    if [ -f "$irq" ]; then
        echo "$HOUSEKEEPING_CPUS" > "$irq" 2>/dev/null || true
    fi
done

echo "IRQs moved to CPUs: $HOUSEKEEPING_CPUS"

echo ""
echo "Step 4: Disable C-States and P-States"
echo "======================================"

# Disable Intel P-state driver (handled by GRUB)
echo "P-states disabled via GRUB (intel_pstate=disable)"

# Set CPU governor to performance
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    if [ -f "$cpu/cpufreq/scaling_governor" ]; then
        echo "performance" > "$cpu/cpufreq/scaling_governor"
    fi
done

echo "CPU governor set to 'performance'"

# Disable CPU idle states
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    for state in "$cpu/cpuidle/state"*/disable; do
        if [ -f "$state" ]; then
            echo 1 > "$state"
        fi
    done
done

echo "CPU idle states disabled"

echo ""
echo "Step 5: Network Tuning"
echo "======================"

# Increase network buffer sizes
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
sysctl -w net.core.rmem_default=134217728
sysctl -w net.core.wmem_default=134217728
sysctl -w net.ipv4.tcp_rmem="4096 87380 134217728"
sysctl -w net.ipv4.tcp_wmem="4096 65536 134217728"

# Disable network features that add latency
sysctl -w net.ipv4.tcp_timestamps=0
sysctl -w net.ipv4.tcp_sack=0

echo "Network buffers increased, latency features disabled"

echo ""
echo "Step 6: Transparent Huge Pages"
echo "==============================="

# Disable THP (can cause latency spikes)
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag

echo "Transparent Huge Pages disabled"

echo ""
echo "Step 7: NUMA Configuration"
echo "=========================="

# Show NUMA topology
echo "NUMA Topology:"
numactl --hardware

echo ""
echo "Step 8: Create systemd service"
echo "================================"

# Create systemd service for trading engine
cat > /etc/systemd/system/trading-engine.service << EOF
[Unit]
Description=Trading Platform Engine
After=network.target

[Service]
Type=simple
User=trading
Group=trading
WorkingDirectory=/opt/trading-platform

# CPU Affinity (isolated cores)
CPUAffinity=$ISOLATED_CPUS

# Real-time priority
Nice=-20
IOSchedulingClass=realtime
IOSchedulingPriority=0

# Memory locking
LimitMEMLOCK=infinity

# Core dumps
LimitCORE=infinity

# NUMA binding (assuming node 0)
ExecStart=/usr/bin/numactl --cpunodebind=0 --membind=0 /opt/trading-platform/bin/trading_engine

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Created /etc/systemd/system/trading-engine.service"

systemctl daemon-reload

echo ""
echo "========================================="
echo "Phase 2 System Setup Complete!"
echo "========================================="
echo ""
echo "IMPORTANT: Reboot required for CPU isolation to take effect"
echo ""
echo "After reboot, verify with:"
echo "  - cat /proc/cmdline  (check kernel parameters)"
echo "  - cat /proc/meminfo | grep Huge  (check huge pages)"
echo "  - numactl --hardware  (check NUMA topology)"
echo "  - cat /sys/devices/system/cpu/cpu1/cpufreq/scaling_governor"
echo ""
echo "To start trading engine:"
echo "  systemctl start trading-engine"
echo "  systemctl status trading-engine"
echo ""
echo "Reboot now? (y/n)"
read -r answer
if [ "$answer" = "y" ]; then
    echo "Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    echo "Skipping reboot. Remember to reboot later!"
fi
