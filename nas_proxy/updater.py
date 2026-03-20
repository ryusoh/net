#!/usr/bin/env python3
import json
import os
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

"""
NAS Proxy Auto-Updater with Health Checking
--------------------------------------------
1. Parses SOCKS5 proxy list from proxies.html
2. Tests each proxy against tianditu.gov.cn (418 = geo-blocked = skip)
3. Only deploys proxies that actually return 200 (Chinese exit IP)
"""

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "config.json")
PROXIES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "proxies.json")
PROXY_FILE = os.path.join(os.path.dirname(__file__), "proxies.html")

TEST_URL = "https://map.tianditu.gov.cn/"
CONNECT_TIMEOUT = 6
MAX_TIME = 10
MAX_WORKERS = 30  # parallel health checks
MAX_WORKING_PROXIES = 5  # stop after finding enough


def test_proxy(ip, port):
    """Test if a SOCKS5 proxy can reach tianditu without getting 418 (geo-blocked)."""
    try:
        result = subprocess.run(
            [
                "curl", "-s", "-o", "/dev/null",
                "-w", "%{http_code}",
                "--proxy", f"socks5h://{ip}:{port}",
                "--connect-timeout", str(CONNECT_TIMEOUT),
                "--max-time", str(MAX_TIME),
                TEST_URL
            ],
            capture_output=True, text=True,
            timeout=MAX_TIME + 5
        )
        code = result.stdout.strip()
        if code in ("200", "301", "302"):
            print(f"  [OK] {ip}:{port} -> HTTP {code}")
            return True
        else:
            print(f"  [--] {ip}:{port} -> HTTP {code}")
            return False
    except Exception as e:
        print(f"  [--] {ip}:{port} -> {e}")
        return False


def update_v2ray_config():
    if not os.path.exists(PROXY_FILE):
        print(f"[-] {PROXY_FILE} not found. Run scraper first.")
        return

    # 1. Parse raw IP:Port list
    proxies = []
    try:
        with open(PROXY_FILE, 'r') as f:
            content = f.read()
            matches = re.findall(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)', content)
            for ip, port in matches:
                if ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("127."):
                    continue
                proxies.append({"address": ip, "port": int(port)})
    except Exception as e:
        print(f"[-] Error reading proxy file: {e}")
        return

    if not proxies:
        print("[-] No valid proxies found in file.")
        return

    print(f"[*] Parsed {len(proxies)} proxies. Health-checking against tianditu...")

    # 2. Health-check proxies in parallel, stop early when we have enough
    working = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_proxy = {
            executor.submit(test_proxy, p["address"], p["port"]): p
            for p in proxies
        }
        for future in as_completed(future_to_proxy):
            if len(working) >= MAX_WORKING_PROXIES:
                # Cancel remaining futures
                for f in future_to_proxy:
                    f.cancel()
                break
            proxy = future_to_proxy[future]
            try:
                if future.result():
                    working.append(proxy)
            except Exception:
                pass

    if not working:
        print("[-] No working Chinese-exit proxies found. Try running scraper again.")
        return

    print(f"[+] Found {len(working)} working Chinese-exit proxies!")

    # 3. Create SOCKS5 outbound config
    proxies_config = {
        "outbounds": [
            {
                "protocol": "socks",
                "settings": {"servers": working},
                "tag": "china-proxy"
            }
        ]
    }

    # 4. Save config
    try:
        os.makedirs(os.path.dirname(PROXIES_CONFIG_PATH), exist_ok=True)
        with open(PROXIES_CONFIG_PATH, 'w') as f:
            json.dump(proxies_config, f, indent=2)
        print(f"[+] Deployed {len(working)} verified proxies to proxies.json")
    except Exception as e:
        print(f"[-] Error writing config: {e}")
        return

    # 5. Reload V2Ray
    print("[*] Restarting nas_proxy container...")
    subprocess.run(["sudo", "docker", "restart", "nas_proxy"])


if __name__ == "__main__":
    update_v2ray_config()
