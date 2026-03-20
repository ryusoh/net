#!/usr/bin/env python3
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

CONFIG_PATH = "./config/config.json"

class ConfigUpdater(BaseHTTPRequestHandler):
    def _set_headers(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        proxies = data.get('proxies', [])
        if not proxies:
            # Fallback for old single-proxy format if needed
            proxies = [data]

        print(f"[Updater] Received {len(proxies)} proxies for update.")

        # Update the JSON config
        with open(CONFIG_PATH, 'r') as f:
            config = json.load(f)

        # Build the new server list
        new_servers = []
        for p in proxies:
            new_servers.append({
                "address": p.get('ip'),
                "port": int(p.get('port'))
            })

        # Update the china-proxy outbound with multiple servers
        for outbound in config['outbounds']:
            if outbound.get('tag') == 'china-proxy':
                outbound['settings']['servers'] = new_servers

        with open(CONFIG_PATH, 'w') as f:
            json.dump(config, f, indent=2)

        # Restart the v2ray container
        subprocess.run(["docker", "restart", "nas_proxy"])

        self._set_headers()
        self.wfile.write(b"Config Updated with Multiple Servers and Proxy Restarted")

if __name__ == "__main__":
    print("Proxy Config Updater listening on port 8081...")
    server = HTTPServer(('0.0.0.0', 8081), ConfigUpdater)
    server.serve_forever()
