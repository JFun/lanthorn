#!/usr/bin/env bash
# Lanthorn App Store screenshots — render the web build headlessly at exact device
# pixel sizes. Universal app → iPhone 6.5" (1242×2688) + iPad 13" (2048×2732).
# Uses the ?shot= harness in web/js/game.js to land each state on load.
# Output: screenshots/appstore/*.png  (drag into App Store Connect; ≥3 per class).
set -uo pipefail          # not -e: a single bad shot must not abort the batch
cd "$(dirname "$0")/../.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="screenshots/appstore"; mkdir -p "$OUT"
PORT="${SHOTS_PORT:-4178}"
TO="$(command -v timeout || command -v gtimeout || true)"   # optional hang guard
TMP="$(mktemp -d)"
trap 'kill "$SRV" 2>/dev/null || true; rm -rf "$TMP"' EXIT

python3 -m http.server "$PORT" --directory web >/dev/null 2>&1 &
SRV=$!
sleep 1

# shoot <name> <cssW> <cssH> <scale> <state> [level]
# The game runs a perpetual rAF loop, so --virtual-time-budget renders + writes the
# screenshot but Chrome never self-exits. Launch backgrounded, give it wall-clock
# time to write, then kill — no dependency on `timeout` (absent on stock macOS).
shoot() {
  local name=$1 w=$2 h=$3 s=$4 state=$5 n=${6:-7}
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run \
    --force-device-scale-factor="$s" --window-size="$w,$h" \
    --virtual-time-budget=2600 --user-data-dir="$TMP/$name" \
    --screenshot="$OUT/$name.png" \
    "http://localhost:$PORT/?shot=$state&n=$n" >/dev/null 2>&1 &
  local cpid=$!
  sleep 5; kill "$cpid" 2>/dev/null; wait "$cpid" 2>/dev/null
  local dim
  dim=$(sips -g pixelWidth -g pixelHeight "$OUT/$name.png" 2>/dev/null | awk '/pixel/{print $2}' | paste -sd× -)
  echo "  $name.png  ${dim:-MISSING}"
}

echo "iPhone 6.5\" (want 1242×2688):"
shoot iphone65_1_play   414 896 3 play 7
shoot iphone65_2_win    414 896 3 win  20
shoot iphone65_3_sky    414 896 3 sky
shoot iphone65_4_title  414 896 3 title

echo "iPad 13\" (want 2048×2732):"
shoot ipad13_1_play    1024 1366 2 play 7
shoot ipad13_2_win     1024 1366 2 win  20
shoot ipad13_3_sky     1024 1366 2 sky
shoot ipad13_4_title   1024 1366 2 title

echo "done → $OUT"
