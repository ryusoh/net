#!/usr/bin/env python3
import json
import os
import subprocess

"""
NAS Proxy Auto-Updater
----------------------
Parses proxies.html and injects them into V2Ray config.json.
Ensures your NAS always uses the fastest working Chinese proxies.
"""
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "config.json")
PROXIES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "proxies.json")
PROXY_FILE = "./proxies.html"

def update_v2ray_config():
...
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
    with open(PROXIES_CONFIG_PATH, 'w') as f:
        json.dump(proxies_config, f, indent=2)
    print(f"[+] Injected {len(proxies[:10])} fresh Chinese proxies into proxies.json.")

    # 4. Reload V2Ray (Docker)
    print("[*] Restarting nas_proxy container...")
    subprocess.run(["sudo", "docker", "restart", "nas_proxy"])


if __name__ == "__main__":
    update_v2ray_config()
