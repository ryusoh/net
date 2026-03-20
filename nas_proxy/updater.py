#!/usr/bin/env python3
import json
import os
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

"""
NAS Proxy Auto-Updater with Health Checking
--------------------------------------------
1. Parses proxy list from proxies.html (populated by C scraper)
2. Also fetches from Geonode JSON API directly (China-filtered)
3. Tests each proxy against tianditu.gov.cn
4. Only deploys proxies that return 200 (Chinese exit IP confirmed)
"""

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "config.json")
PROXIES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "proxies.json")
PROXY_FILE = os.path.join(os.path.dirname(__file__), "proxies.html")

TEST_URL = "https://map.tianditu.gov.cn/"
CONNECT_TIMEOUT = 8
MAX_TIME = 12
MAX_WORKERS = 40
MAX_WORKING_PROXIES = 5

# Additional API sources fetched directly from Python
GEONODE_APIS = [
    "https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&country=CN&protocols=socks5",
    "https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&country=CN&protocols=socks4",
]


def fetch_geonode_proxies():
    """Fetch proxies from Geonode JSON API (country=CN)."""
    proxies = []
    for url in GEONODE_APIS:
        try:
            result = subprocess.run(
                ["curl", "-s", "--max-time", "15", url],
                capture_output=True, text=True, timeout=20
            )
            data = json.loads(result.stdout)
            for p in data.get("data", []):
                ip = p.get("ip", "")
                port = p.get("port", "")
                if ip and port:
                    proxies.append({"address": ip, "port": int(port)})
                    print(f"  [Geonode] {ip}:{port}")
        except Exception as e:
            print(f"  [Geonode] Failed: {e}")
    return proxies


def test_proxy(ip, port):
    """Test if a proxy can reach tianditu without getting 418/000."""
    # Try socks5h first (DNS through proxy), then socks5, then socks4
    for scheme in ["socks5h", "socks5", "socks4"]:
        try:
            result = subprocess.run(
                [
                    "curl", "-s", "-o", "/dev/null",
                    "-w", "%{http_code}",
                    "--proxy", f"{scheme}://{ip}:{port}",
                    "--connect-timeout", str(CONNECT_TIMEOUT),
                    "--max-time", str(MAX_TIME),
                    TEST_URL
                ],
                capture_output=True, text=True,
                timeout=MAX_TIME + 5
            )
            code = result.stdout.strip()
            if code in ("200", "301", "302"):
                print(f"  [OK] {ip}:{port} ({scheme}) -> HTTP {code}")
                return scheme
            elif code != "000":
                print(f"  [--] {ip}:{port} ({scheme}) -> HTTP {code}")
                return None  # Got a response but wrong code, don't retry other schemes
        except Exception:
            pass
    return None


def update_v2ray_config():
    # 1. Parse proxies from scraper output
    proxies = []
    if os.path.exists(PROXY_FILE):
        with open(PROXY_FILE, 'r') as f:
            content = f.read()
            matches = re.findall(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)', content)
            for ip, port in matches:
                if ip.startswith(("10.", "192.168.", "127.", "0.")):
                    continue
                proxies.append({"address": ip, "port": int(port)})
    else:
        print(f"[*] {PROXY_FILE} not found, using API sources only.")

    # 2. Also fetch from Geonode API
    print("[*] Fetching from Geonode API (country=CN)...")
    geonode = fetch_geonode_proxies()

    # Deduplicate, prioritize Geonode (China-filtered) first
    seen = set()
    all_proxies = []
    for p in geonode + proxies:
        key = f"{p['address']}:{p['port']}"
        if key not in seen:
            seen.add(key)
            all_proxies.append(p)

    if not all_proxies:
        print("[-] No proxies found from any source.")
        return

    print(f"\n[*] Testing {len(all_proxies)} proxies against tianditu...")

    # 3. Health-check in parallel
    working = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_proxy = {
            executor.submit(test_proxy, p["address"], p["port"]): p
            for p in all_proxies
        }
        for future in as_completed(future_to_proxy):
            if len(working) >= MAX_WORKING_PROXIES:
                for f in future_to_proxy:
                    f.cancel()
                break
            proxy = future_to_proxy[future]
            try:
                scheme = future.result()
                if scheme:
                    working.append(proxy)
            except Exception:
                pass

    if not working:
        print("\n[-] No working Chinese-exit proxies found from any source.")
        print("[-] All proxies either timed out (000) or returned 418 (geo-blocked).")
        return

    print(f"\n[+] Found {len(working)} VERIFIED Chinese-exit proxies!")
    for p in working:
        print(f"    {p['address']}:{p['port']}")

    # 4. Create outbound config
    proxies_config = {
        "outbounds": [
            {
                "protocol": "socks",
                "settings": {"servers": working},
                "tag": "china-proxy"
            }
        ]
    }

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
    print("[+] Done! Reload Chrome extension and try map.tianditu.gov.cn")


if __name__ == "__main__":
    update_v2ray_config()
