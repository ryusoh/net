#!/usr/bin/env python3
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

CONFIG_PATH = "./config/config.json"

class ConfigUpdater(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        new_ip = data.get('ip')
        new_port = int(data.get('port'))

        print(f"[Updater] Received new proxy: {new_ip}:{new_port}")

        # Update the JSON config
        with open(CONFIG_PATH, 'r') as f:
            config = json.load(f)

        # Update the china-proxy outbound
        for outbound in config['outbounds']:
            if outbound.get('tag') == 'china-proxy':
                outbound['settings']['servers'][0]['address'] = new_ip
                outbound['settings']['servers'][0]['port'] = new_port

        with open(CONFIG_PATH, 'w') as f:
            json.dump(config, f, indent=2)

        # Restart the v2ray container to apply changes
        # Note: In a real Synology environment, we'd use 'docker restart nas_proxy'
        subprocess.run(["docker", "restart", "nas_proxy"])

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Config Updated and Proxy Restarted")

if __name__ == "__main__":
    print("Proxy Config Updater listening on port 8081...")
    server = HTTPServer(('0.0.0.0', 8081), ConfigUpdater)
    server.serve_forever()
