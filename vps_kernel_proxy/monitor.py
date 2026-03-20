#!/usr/bin/env python3
import subprocess
import json
import time
import os
import sys

"""
eBPF Monitor Dashboard
----------------------
A simple Python tool to interact with our eBPF maps and programs.
Uses 'bpftool' under the hood.
"""

def run_cmd(cmd):
    try:
        result = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        return result.decode('utf-8')
    except subprocess.CalledProcessError as e:
        return f"Error: {e.output.decode('utf-8')}"

def get_map_id(map_name):
    output = run_cmd("bpftool map show -j")
    try:
        maps = json.loads(output)
        for m in maps:
            if m.get('name') == map_name:
                return m['id']
    except:
        pass
    return None

def show_dns_hits():
    map_id = get_map_id("dns_hits")
    if not map_id:
        print("[-] DNS Hits map not found. Is dns_filter.bpf.o loaded?")
        return

    print("\n--- [ DNS MONITOR ] ---")
    output = run_cmd(f"bpftool map dump id {map_id} -j")
    try:
        entries = json.loads(output)
        if not entries:
            print("No hits yet...")
        for entry in entries:
            # BPF stores keys as hex/bytes
            key_bytes = bytes.fromhex(entry['key'].replace(' ', ''))
            domain = key_bytes.decode('utf-8').strip('\x00')
            count = int(entry['value'], 16)
            print(f"Domain: {domain:15} | Hits: {count}")
    except Exception as e:
        print(f"Error parsing map: {e}")

def add_to_blocklist(ip):
    map_id = get_map_id("blocklist_map")
    if not map_id:
        print("[-] Blocklist map not found. Is adblock.bpf.o loaded?")
        return

    # Convert IP to hex for bpftool (simple version)
    try:
        import socket
        import struct
        packed_ip = socket.inet_aton(ip)
        hex_ip = packed_ip.hex()
        # BPF wants the key in a specific format for bpftool
        run_cmd(f"bpftool map update id {map_id} key hex {hex_ip} value hex 00 00 00 00")
        print(f"[+] IP {ip} added to Kernel Blocklist!")
    except Exception as e:
        print(f"Error adding IP: {e}")

def block_domain(domain):
    """Resolves a domain to its IPs and blocks each one in the kernel."""
    import socket
    print(f"[*] Resolving {domain}...")
    try:
        # Get all unique IP addresses for the domain (IPv4 only for now)
        info = socket.getaddrinfo(domain, None, socket.AF_INET)
        ips = {item[4][0] for item in info}
        
        if not ips:
            print(f"[-] No IPs found for {domain}")
            return

        for ip in ips:
            add_to_blocklist(ip)
            
    except Exception as e:
        print(f"[-] Resolution failed for {domain}: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: ./monitor.py [status|dns|block <ip>|block-domain <domain>]")
        return

    cmd = sys.argv[1]
    if cmd == "status":
        print("--- [ LOADED BPF PROGRAMS ] ---")
        print(run_cmd("bpftool prog show"))
    elif cmd == "dns":
        show_dns_hits()
    elif cmd == "block" and len(sys.argv) == 3:
        add_to_blocklist(sys.argv[2])
    elif cmd == "block-domain" and len(sys.argv) == 3:
        block_domain(sys.argv[2])
    else:
        print("Unknown command.")

if __name__ == "__main__":
    main()
