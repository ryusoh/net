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
    
    # 1. Try standard ip link commands
    if ip link set dev "$i" xdp obj "$p" sec xdp 2>/dev/null || \
       ip link set dev "$i" xdp generic obj "$p" sec xdp 2>/dev/null; then
        echo "[SUCCESS] $p active on $i (via ip-link)."
        return 0
    fi

    # 2. Advanced Fallback: Use bpftool (Often works when ip-link fails)
    echo "[!] ip-link failed. Attempting bpftool fallback..."
    local prog_path="/sys/fs/bpf/xdp_$i"
    rm -f "$prog_path" # Clean old pin
    
    if bpftool prog load "$p" "$prog_path" type xdp 2>/dev/null; then
        if bpftool net attach xdp pinned "$prog_path" dev "$i" 2>/dev/null; then
            echo "[SUCCESS] $p active on $i (via bpftool)."
            return 0
        fi
    fi

    echo "[ERROR] All load methods failed. Your NAS might have XDP disabled in the kernel."
    echo "Check 'zcat /proc/config.gz | grep XDP' if possible."
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
