#!/usr/bin/env bash
# Auto-restarting dev server. Run via: nohup ./dev.sh &
set -e
cd "$(dirname "$0")"
while true; do
  echo "[$(date '+%H:%M:%S')] Starting Vite dev server..."
  npm run dev || true
  echo "[$(date '+%H:%M:%S')] Server exited. Restarting in 2s..."
  sleep 2
done
