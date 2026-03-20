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
            echo "[SUCCESS] $p active on $i (via bpftool xdp)."
            return 0
        fi
    fi

    # 3. Universal Fallback: Use TC (Traffic Control)
    # TC works on almost every Linux kernel, even when XDP is disabled.
    echo "[!] bpftool XDP failed. Attempting TC fallback (more compatible)..."
    
    # Ensure clsact qdisc exists
    tc qdisc add dev "$i" clsact 2>/dev/null
    
    # Attach to ingress hook
    if tc filter add dev "$i" ingress bpf obj "$p" sec xdp direct-action 2>/dev/null || \
       tc filter add dev "$i" ingress bpf obj "$p" sec classifier direct-action 2>/dev/null; then
        echo "[SUCCESS] $p active on $i (via TC ingress)."
        return 0
    fi

    echo "[ERROR] All load methods (XDP & TC) failed."
    echo "This usually means your NAS kernel is too old or lacks BPF support."
}

unload_prog() {
    local i=$1
    echo "[-] Unloading eBPF from $i..."
    ip link set dev "$i" xdp off 2>/dev/null
    tc qdisc del dev "$i" clsact 2>/dev/null
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
