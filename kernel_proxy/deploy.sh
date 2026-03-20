#!/bin/bash

# eBPF Deployment Tool
# --------------------
# Automates the loading and unloading of eBPF programs 
# on your NAS network interface.

# Default network interface (Change to 'eth0' or 'ovs_eth0' for Synology)
IFACE="eth0"
PROG="adblock.bpf.o"

show_help() {
    echo "Usage: sudo ./deploy.sh [load|unload|status] [program.o] [interface]"
    echo ""
    echo "Example:"
    echo "  sudo ./deploy.sh load adblock.bpf.o eth0"
    echo "  sudo ./deploy.sh unload eth0"
    echo "  sudo ./deploy.sh status"
}

load_prog() {
    local p=$1
    local i=$2
    echo "[+] Loading $p onto $i..."
    # Attach XDP program in 'skb' mode for maximum compatibility with NAS drivers
    ip link set dev "$i" xdp obj "$p" sec xdp || \
    ip link set dev "$i" xdp generic obj "$p" sec xdp
    
    if [ $? -eq 0 ]; then
        echo "[SUCCESS] $p is now active on $i."
    else
        echo "[ERROR] Failed to load $p. Check 'dmesg' for kernel logs."
    fi
}

unload_prog() {
    local i=$1
    echo "[-] Unloading eBPF from $i..."
    ip link set dev "$i" xdp off
    echo "[DONE] Interface $i is now clean."
}

show_status() {
    echo "--- [ INTERFACE STATUS ] ---"
    ip link show | grep xdp
    echo ""
    echo "--- [ LOADED BPF PROGS ] ---"
    bpftool prog show
}

# Main Logic
case "$1" in
    load)
        load_prog "${2:-$PROG}" "${3:-$IFACE}"
        ;;
    unload)
        unload_prog "${2:-$IFACE}"
        ;;
    status)
        show_status
        ;;
    *)
        show_help
        ;;
esac
