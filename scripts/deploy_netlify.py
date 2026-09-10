#!/usr/bin/env python3
"""
Deployment script for Netlify using direct ZIP upload to Netlify API.
Reads NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN from .env.
"""

import os
import io
import sys
import ssl
import json
import time
import zipfile
import urllib.request
import urllib.error
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "web" / "dist"
ENV_FILE = ROOT_DIR / ".env"

def load_env():
    env = {}
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip("'\"")
    return env

def main():
    if not DIST_DIR.exists():
        print(f"Error: {DIST_DIR} does not exist. Run 'npm run build' first.")
        sys.exit(1)

    env = load_env()
    token = os.environ.get("NETLIFY_AUTH_TOKEN") or env.get("NETLIFY_AUTH_TOKEN")
    site_id = os.environ.get("NETLIFY_SITE_ID") or env.get("NETLIFY_SITE_ID")

    if not token or not site_id:
        print("Error: NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID must be set in .env or environment.")
        sys.exit(1)

    print(f"[deploy] Packaging {DIST_DIR} into memory zip...")
    zip_buffer = io.BytesIO()
    file_count = 0
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(DIST_DIR):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(DIST_DIR)
                zf.write(file_path, arcname)
                file_count += 1

    zip_bytes = zip_buffer.getvalue()
    size_mb = len(zip_bytes) / (1024 * 1024)
    print(f"[deploy] Created archive: {file_count} files ({size_mb:.2f} MB)")

    print(f"[deploy] Uploading to Netlify site {site_id}...")
    url = f"https://api.netlify.com/api/v1/sites/{site_id}/deploys"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/zip",
        "User-Agent": "ParisSubway3D-DeployScript/1.0"
    }

    ssl_context = ssl.create_default_context()
    try:
        import certifi
        ssl_context.load_verify_locations(certifi.where())
    except Exception:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, data=zip_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=ssl_context) as resp:
            status_code = resp.getcode()
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"Error: Netlify API returned {e.code}: {e.read().decode('utf-8')}")
        sys.exit(1)

    deploy_data = json.loads(body)
    deploy_id = deploy_data.get("id")
    print(f"[deploy] Deploy started with ID: {deploy_id}")

    # Poll deployment status until ready
    print("[deploy] Waiting for deployment to finalize on Netlify CDN...")
    poll_url = f"https://api.netlify.com/api/v1/deploys/{deploy_id}"
    poll_headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "ParisSubway3D-DeployScript/1.0"
    }

    for attempt in range(30):
        time.sleep(2)
        poll_req = urllib.request.Request(poll_url, headers=poll_headers, method="GET")
        try:
            with urllib.request.urlopen(poll_req, context=ssl_context) as status_resp:
                d = json.loads(status_resp.read().decode("utf-8"))
                state = d.get("state")
                print(f"[deploy] Status: {state} ({attempt + 1}/30)")
                if state == "ready":
                    ssl_url = d.get("ssl_url") or d.get("url")
                    deploy_url = d.get("deploy_ssl_url") or d.get("deploy_url")
                    print("\n=======================================================")
                    print("🎉 DEPLOYMENT SUCCESSFUL!")
                    print(f"👉 Site URL:   {ssl_url}")
                    print(f"👉 Deploy URL: {deploy_url}")
                    print("=======================================================")
                    return
                elif state == "error":
                    print(f"Error: Deployment failed: {d.get('error_message')}")
                    sys.exit(1)
        except urllib.error.HTTPError as e:
            print(f"Warning: Poll error {e.code}: {e.read().decode('utf-8')}")

    print("Warning: Deployment did not reach 'ready' state within timeout, check Netlify dashboard.")

if __name__ == "__main__":
    main()
