#!/usr/bin/env bash
# Render the PWA icon set from public/icon-source.svg using the Playwright
# chrome-headless-shell binary (no new npm dependency). Re-run after editing the
# SVG source. Requires macOS `sips` for the dimension check.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/icon-source.svg"
SHELL_BIN="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"

[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
[ -x "$SHELL_BIN" ] || { echo "missing chrome-headless-shell at $SHELL_BIN"; exit 1; }

render() {
  local size="$1" out="$2" bg="${3:-transparent}"
  # Wrap the SVG full-bleed in an HTML page so the render is exactly size x size
  # with no scrollbars/margins. `bg`:
  #   transparent — keeps the SVG's rounded corners (manifest/favicon icons).
  #   #1B3F6E     — solid navy behind the icon so the corners aren't transparent;
  #                 used for apple-touch-icon (iOS renders transparent corners
  #                 BLACK and applies its own rounding mask, so a full-bleed navy
  #                 square is correct and honours "no transparency").
  local html; html="$(mktemp /tmp/icon-XXXX.html)"
  cat > "$html" <<HTML
<!doctype html><meta charset=utf-8>
<style>html,body{margin:0;padding:0;background:${bg}}img{display:block;width:${size}px;height:${size}px}</style>
<img src="file://$SRC">
HTML
  "$SHELL_BIN" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$size,$size" \
    --default-background-color=00000000 --virtual-time-budget=2000 \
    --screenshot="$out" "file://$html" >/dev/null 2>&1
  rm -f "$html"
}

render 512 "$ROOT/public/icon-512.png"
render 192 "$ROOT/public/icon-192.png"
render 180 "$ROOT/public/apple-touch-icon.png" "#1B3F6E"

echo "Generated:"
for f in icon-512.png icon-192.png apple-touch-icon.png; do
  dims="$(sips -g pixelWidth -g pixelHeight "$ROOT/public/$f" 2>/dev/null | grep pixel | awk '{print $2}' | paste -sd 'x' -)"
  echo "  public/$f  (${dims})"
done
