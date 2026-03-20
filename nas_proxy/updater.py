#!/usr/bin/env python3
import json
import os
import subprocess
import re

"""
NAS Proxy Auto-Updater
----------------------
Parses proxies.html and injects them into proxies.json.
Ensures your NAS always uses the fastest working Chinese proxies.
"""
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "config.json")
PROXIES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "proxies.json")
PROXY_FILE = os.path.join(os.path.dirname(__file__), "proxies.html")

def update_v2ray_config():
    if not os.path.exists(PROXY_FILE):
        print(f"[-] {PROXY_FILE} not found. Run scraper first.")
        return

    # 1. Parse raw IP:Port list using Regex for robustness
    proxies = []
    try:
        with open(PROXY_FILE, 'r') as f:
            content = f.read()
            matches = re.findall(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)', content)
            for ip, port in matches:
                if ip.startswith("10.") or ip.startswith("192.168."): continue
                proxies.append({"address": ip, "port": int(port)})
    except Exception as e:
        print(f"[-] Error reading proxy file: {e}")
        return

    if not proxies:
        print("[-] No valid proxies found in file.")
        return

    # 2. Create small outbound config
    proxies_config = {
        "outbounds": [
            {
                "protocol": "http",
                "settings": {"servers": proxies[:10]},
                "tag": "china-proxy"
            }
        ]
    }

    # 3. Save to the ignored file
    try:
        os.makedirs(os.path.dirname(PROXIES_CONFIG_PATH), exist_ok=True)
        with open(PROXIES_CONFIG_PATH, 'w') as f:
            json.dump(proxies_config, f, indent=2)
        print(f"[+] Injected {len(proxies[:10])} fresh Chinese proxies into proxies.json.")
    except Exception as e:
        print(f"[-] Error writing config: {e}")
        return

    # 4. Reload V2Ray (Docker)
    print("[*] Restarting nas_proxy container...")
    subprocess.run(["sudo", "docker", "restart", "nas_proxy"])

if __name__ == "__main__":
    update_v2ray_config()
