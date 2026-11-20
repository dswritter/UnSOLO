#!/usr/bin/env bash
# Builds the app for the simulator, launches each DEBUG start screen and saves a screenshot.
# Usage: mobile/ios/tools/screenshots.sh [out-dir] [screen ...]
# Defaults: out-dir = mobile/ios/screenshots, all main screens. Needs Xcode 26+ and an "iPhone 17" simulator.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-screenshots}"
shift || true
SCREENS=("$@")
if [ ${#SCREENS[@]} -eq 0 ]; then
  SCREENS=(explore tripDetail tribe planComposer planDetailJoined activity trips settings)
fi
DEVICE_NAME="${DEVICE_NAME:-iPhone 17}"
BUNDLE=in.unsolo.app
DERIVED=build/DerivedData

UDID=$(xcrun simctl list devices available | grep -E "^\s+${DEVICE_NAME} \(" | tail -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "No simulator named '$DEVICE_NAME'"; exit 1; }

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  xcodebuild -project UnSOLO.xcodeproj -scheme UnSOLO -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO build -quiet
fi

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 2>/dev/null || true
xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$DERIVED/Build/Products/Debug-iphonesimulator/UnSOLO.app"
mkdir -p "$OUT"

first=1
for screen in "${SCREENS[@]}"; do
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  if [ $first -eq 1 ]; then
    xcrun simctl launch "$UDID" "$BUNDLE" -startScreen "$screen" -resetState YES >/dev/null
    first=0
  else
    xcrun simctl launch "$UDID" "$BUNDLE" -startScreen "$screen" >/dev/null
  fi
  sleep "${WAIT:-6}"
  xcrun simctl io "$UDID" screenshot "$OUT/$screen.png" >/dev/null 2>&1
  echo "saved $OUT/$screen.png"
done

if [ "${KEEP_BOOTED:-0}" != "1" ]; then
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl shutdown "$UDID"
fi
