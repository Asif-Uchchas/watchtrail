#!/usr/bin/env bash
# Double-click launcher for macOS (Finder runs .command files in Terminal).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node.js 18 or newer is required: https://nodejs.org"; read -n 1 -s -r -p "Press any key to close"; exit 1; fi
node vlc-bridge.mjs
echo
echo "Bridge stopped."
read -n 1 -s -r -p "Press any key to close"
