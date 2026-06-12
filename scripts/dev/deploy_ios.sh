#!/usr/bin/env bash
# Lanthorn one-shot iPhone deploy (Capacitor): test → cap sync → build → install → launch.
# Wireless via devicectl (device paired with "Connect via network").
set -euo pipefail
cd "$(dirname "$0")/../.."

DEVICE_ID="${LANTHORN_DEVICE_ID:-B7CC8868-E918-5043-A37E-32AC17F755E7}"  # iPhone 13 Pro
BUNDLE_ID="com.jfun.lanthorn"
APP="ios/App/build/derived/Build/Products/Debug-iphoneos/App.app"

echo "— self-test —"
scripts/dev/test.sh

echo "— cap sync (web → ios/App/App/public) —"
npx cap sync ios 2>&1 | tail -2

echo "— build —"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath ios/App/build/derived \
  -allowProvisioningUpdates build 2>&1 | grep -E "BUILD|error:" | tail -3

echo "— install —"
do_install() { xcrun devicectl device install app --device "$DEVICE_ID" "$APP" 2>&1 | tail -2; }
do_install || { echo "install failed (transient?) — retrying once"; sleep 3; do_install; }

echo "— launch —"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tail -1
echo "DEPLOYED ✓"
