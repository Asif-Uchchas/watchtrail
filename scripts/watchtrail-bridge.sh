#!/usr/bin/env bash
# Starts the Watchtrail VLC bridge (Linux). Run: bash scripts/watchtrail-bridge.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node.js 18 or newer is required: https://nodejs.org"; exit 1; fi
node vlc-bridge.mjs
echo
echo "Bridge stopped."
