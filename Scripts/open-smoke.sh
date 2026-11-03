#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Opens a built BlinkyBot.app and fails unless Compose answers /api/version
# and the UI log does not report a missing module.
#
#   ./Scripts/open-smoke.sh build.noindex/BlinkyBot.app

set -euo pipefail

app="${1:-build.noindex/BlinkyBot.app}"
if [[ ! -x "$app/Contents/MacOS/BlinkyBot" ]]; then
    echo "No BlinkyBot binary at $app" >&2
    exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "open-smoke.sh launches the Mac app and has to run on macOS." >&2
    exit 1
fi

support="${BLINKY_OPEN_SMOKE_DIR:-/tmp/blinky-open-smoke}"
rm -rf "$support"
mkdir -p "$support/logs"
xattr -dr com.apple.quarantine "$app" 2>/dev/null || true

export BLINKY_SUPPORT_DIR="$support"
export BLINKY_UI_PORT="${BLINKY_UI_PORT:-3000}"
export BLINKY_ENGINE_PORT="${BLINKY_ENGINE_PORT:-3001}"

"$app/Contents/MacOS/BlinkyBot" >"$support/app.out" 2>&1 &
app_pid=$!
cleanup() {
    if kill -0 "$app_pid" 2>/dev/null; then
        kill "$app_pid" 2>/dev/null || true
        sleep 1
        kill -9 "$app_pid" 2>/dev/null || true
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -tiTCP:"$BLINKY_UI_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
        lsof -tiTCP:"$BLINKY_ENGINE_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
    fi
}
trap cleanup EXIT

ui_log="$support/logs/ui.log"
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
    if ! kill -0 "$app_pid" 2>/dev/null; then
        echo "BlinkyBot exited before Compose answered." >&2
        cat "$support/app.out" >&2 || true
        cat "$ui_log" >&2 || true
        exit 1
    fi
    if [[ -f "$ui_log" ]] && grep -q -E 'MODULE_NOT_FOUND|Cannot find module' "$ui_log"; then
        echo "Compose log reports a missing module." >&2
        cat "$ui_log" >&2
        exit 1
    fi
    if curl -fsS "http://127.0.0.1:${BLINKY_UI_PORT}/api/version" >/dev/null; then
        echo "BlinkyBot opened and Compose answered /api/version"
        exit 0
    fi
    sleep 2
done

echo "Compose did not answer http://127.0.0.1:${BLINKY_UI_PORT}/api/version within 120s." >&2
cat "$support/app.out" >&2 || true
cat "$ui_log" >&2 || true
exit 1
