#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# End-to-end checks against a packaged BlinkyBot.app.
#
#   ./e2e/run.sh build.noindex/BlinkyBot.app

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/build.noindex/BlinkyBot.app}"
OUT="${E2E_OUT:-$ROOT/e2e/out}"
SUPPORT="${BLINKY_E2E_SUPPORT:-/tmp/blinky-e2e-support}"
UI_PORT="${BLINKY_E2E_UI_PORT:-4173}"
ENGINE_PORT="${BLINKY_E2E_ENGINE_PORT:-4174}"
FEED_PORT="${BLINKY_E2E_FEED_PORT:-8765}"
PUBLIC_KEY="M/xUmNfKp+sEloy822L8X4lVdOLM1pv9srD7fw/bgb8="
FEED_URL="https://github.com/harrisliangsu/blinky-bot/releases/latest/download/appcast.xml"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "e2e/run.sh launches BlinkyBot.app and has to run on macOS." >&2
    exit 1
fi
if [[ ! -x "$APP/Contents/MacOS/BlinkyBot" ]]; then
    echo "No BlinkyBot binary at $APP" >&2
    exit 1
fi

rm -rf "$OUT" "$SUPPORT"
mkdir -p "$OUT/screenshots" "$OUT/logs" "$OUT/bin" "$SUPPORT"
APP_PID=""
REC_PID=""
FEED_PID=""
HOLDER_PID=""

finish() {
    local status=$?
    set +e
    stop_app
    if [[ -n "$REC_PID" ]]; then
        kill "$REC_PID" 2>/dev/null || true
        wait "$REC_PID" 2>/dev/null || true
    fi
    if [[ -n "$FEED_PID" ]]; then kill "$FEED_PID" 2>/dev/null || true; fi
    if [[ -n "$HOLDER_PID" ]]; then kill "$HOLDER_PID" 2>/dev/null || true; fi
    mkdir -p "$OUT/logs"
    if [[ -d "$SUPPORT/logs" ]]; then cp -R "$SUPPORT/logs/." "$OUT/logs/"; fi
    node "$ROOT/e2e/report.mjs" "$OUT" || true
    exit "$status"
}
trap finish EXIT

write_json() {
    python3 - "$1" "$2" "$3" <<'PY'
import json, sys
path, ok, detail = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"ok": ok == "true", "detail": detail}, handle, indent=2)
    handle.write("\n")
PY
}

feature_enabled() {
    python3 - "$OUT/features.json" "$1" <<'PY'
import json, sys
print("yes" if json.load(open(sys.argv[1], encoding="utf-8"))[sys.argv[2]]["enabled"] else "no")
PY
}

feature_reason() {
    python3 - "$OUT/features.json" "$1" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding="utf-8"))[sys.argv[2]]["reason"])
PY
}

stop_app() {
    if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
        kill "$APP_PID" 2>/dev/null || true
        local _try
        for _try in 1 2 3 4 5 6; do
            kill -0 "$APP_PID" 2>/dev/null || break
            sleep 1
        done
        kill -9 "$APP_PID" 2>/dev/null || true
        wait "$APP_PID" 2>/dev/null || true
    fi
    APP_PID=""
    if command -v lsof >/dev/null 2>&1; then
        lsof -tiTCP:"$UI_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
        lsof -tiTCP:"$ENGINE_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
    fi
}

launch_app() {
    local logfile="$1"
    xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
    "$APP/Contents/MacOS/BlinkyBot" >"$logfile" 2>&1 &
    APP_PID=$!
}

wait_ready() {
    local logfile="$1"
    local deadline=$((SECONDS + 90))
    while (( SECONDS < deadline )); do
        if ! kill -0 "$APP_PID" 2>/dev/null; then
            echo "BlinkyBot exited before Compose answered." >&2
            cat "$logfile" >&2 || true
            return 1
        fi
        if [[ -f "$SUPPORT/logs/ui.log" ]] && grep -q -E 'MODULE_NOT_FOUND|Cannot find module' "$SUPPORT/logs/ui.log"; then
            echo "Compose log reports a missing module." >&2
            cat "$SUPPORT/logs/ui.log" >&2
            return 1
        fi
        if curl -fsS "http://127.0.0.1:${UI_PORT}/api/version" >/dev/null && curl -fsS "http://127.0.0.1:${ENGINE_PORT}/health" >/dev/null; then
            return 0
        fi
        sleep 2
    done
    echo "Compose or the engine did not answer within 90s." >&2
    cat "$logfile" >&2 || true
    return 1
}

prepare_stubs() {
    local name
    for name in codex kimi grok claude; do
        ln -sfn "$ROOT/e2e/stubs/agent-cli.mjs" "$OUT/bin/$name.mjs"
    done
    cp "$ROOT/e2e/stubs/ego-browser" "$OUT/bin/ego-browser"
    chmod +x "$OUT/bin/ego-browser"
    : >"$OUT/stub.log"
    export PATH="$OUT/bin:${PATH}"
    export RERUN_CODEX_PATH="$OUT/bin/codex.mjs"
    export RERUN_KIMI_PATH="$OUT/bin/kimi.mjs"
    export RERUN_GROK_PATH="$OUT/bin/grok.mjs"
    export RERUN_CLAUDE_PATH="$OUT/bin/claude.mjs"
    export BLINKY_STUB_LOG="$OUT/stub.log"
    export BLINKY_STUB_DELAY_MS=2000
    export BLINKY_SUPPORT_DIR="$SUPPORT"
    export BLINKY_UI_PORT="$UI_PORT"
    export BLINKY_ENGINE_PORT="$ENGINE_PORT"
    export BLINKY_UI_URL="http://127.0.0.1:${UI_PORT}"
    export BLINKY_ENGINE_URL="http://127.0.0.1:${ENGINE_PORT}"
    export E2E_OUT="$OUT"
    export BLINKY_REPO_ROOT="$ROOT"
}

node "$ROOT/e2e/feature-gates.mjs" "$ROOT" >"$OUT/features.json"

shipped_key="$(plutil -extract SUPublicEDKey raw "$APP/Contents/Info.plist")"
shipped_feed="$(plutil -extract SUFeedURL raw "$APP/Contents/Info.plist")"
file_key="$(tr -d '[:space:]' < "$ROOT/Scripts/sparkle-public-key.txt")"
if [[ "$shipped_key" != "$PUBLIC_KEY" || "$shipped_key" != "$file_key" ]]; then
    write_json "$OUT/sparkle.json" false "SUPublicEDKey is ${shipped_key}, expected ${PUBLIC_KEY}."
    exit 1
fi
if [[ "$shipped_feed" != "$FEED_URL" ]]; then
    write_json "$OUT/sparkle.json" false "SUFeedURL is ${shipped_feed}."
    exit 1
fi

prepare_stubs
defaults write bot.blinky.shell blinky.updates.automatic -bool false
if screencapture -h >/tmp/blinky-screencapture-help.txt 2>&1; then
    if grep -q -- '-v' /tmp/blinky-screencapture-help.txt; then
        screencapture -v "$OUT/e2e.mov" >/dev/null 2>&1 &
        REC_PID=$!
    fi
fi

launch_app "$OUT/app.out"
if ! wait_ready "$OUT/app.out"; then
    write_json "$OUT/launch.json" false "The packaged app did not serve /api/version and the engine health check."
    exit 1
fi
version_body="$(curl -fsS "http://127.0.0.1:${UI_PORT}/api/version")"
write_json "$OUT/launch.json" true "BlinkyBot stayed up. GET /api/version returned ${version_body}. GET :${ENGINE_PORT}/health returned 200. The UI log has no missing module."

swiftc -O -o "$OUT/window-probe" "$ROOT/e2e/window-probe.swift"
window_ok=false
for _try in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if "$OUT/window-probe" >"$OUT/window-probe.json"; then
        window_ok=true
        break
    fi
    sleep 1
done
if [[ "$window_ok" != true ]]; then
    write_json "$OUT/window.json" false "$(python3 -c 'import pathlib; print(pathlib.Path("'"$OUT"'/window-probe.json").read_text()[:2000])')"
    exit 1
fi
python3 - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
body = json.load(open(f"{out}/window-probe.json", encoding="utf-8"))
detail = "A BlinkyBot window is on screen and its title is not a localhost URL."
if body.get("axTrusted"):
    detail += " Accessibility found no address field and no back, forward, or reload controls."
else:
    detail += " Accessibility permission was not granted, so toolbar buttons were checked through the window title only."
json.dump({"ok": True, "detail": detail}, open(f"{out}/window.json", "w"), indent=2)
PY
window_id="$(python3 -c 'import json; print(json.load(open("'"$OUT"'/window-probe.json"))["windows"][0]["id"])')"
screencapture -x -l "$window_id" "$OUT/screenshots/blinky-window.png" || true

BLINKY_API_KEY="$(tr -d '[:space:]' < "$SUPPORT/engine-api-key")"
export BLINKY_API_KEY
node "$ROOT/e2e/drive.mjs" core

if [[ "$(feature_enabled menuBar)" == yes ]]; then
    if ! osascript <<'APPLESCRIPT'
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        if (count of menu bars) < 2 then error "BlinkyBot has no status menu bar"
        if (count of menu bar items of menu bar 2) < 1 then error "BlinkyBot status menu bar is empty"
    end tell
end tell
tell application "BlinkyBot" to close every window
delay 2
APPLESCRIPT
    then
        write_json "$OUT/menubar.json" false "Menu bar / background mode is on this tree, but the status item was not there."
        exit 1
    fi
    if ! kill -0 "$APP_PID" 2>/dev/null; then
        write_json "$OUT/menubar.json" false "Closing the window quit BlinkyBot, so background mode is not on."
        exit 1
    fi
    write_json "$OUT/menubar.json" true "The menu bar shows BlinkyBot, and closing the window leaves the app running."
else
    write_json "$OUT/menubar.json" true "$(feature_reason menuBar)"
fi

stop_app
launch_app "$OUT/app-relaunch.out"
if ! wait_ready "$OUT/app-relaunch.out"; then
    write_json "$OUT/persist.json" false "BlinkyBot did not come back for the persistence check."
    exit 1
fi
BLINKY_API_KEY="$(tr -d '[:space:]' < "$SUPPORT/engine-api-key")"
export BLINKY_API_KEY
node "$ROOT/e2e/drive.mjs" persist
stop_app

if [[ "$(feature_enabled crashDiagnostics)" == yes ]]; then
    python3 -m http.server "$ENGINE_PORT" --bind 127.0.0.1 >"$OUT/port-holder.log" 2>&1 &
    HOLDER_PID=$!
    sleep 0.5
    launch_app "$OUT/app-crash.out"
    sleep 8
    text="$(osascript -e 'tell application "System Events" to get value of every static text of process "BlinkyBot"' || true)"
    printf '%s\n' "$text" >"$OUT/crash-ax.txt"
    if printf '%s' "$text" | grep -q -E 'Traceback|EXC_BAD|fatal error'; then
        write_json "$OUT/crash.json" false "The failure view showed a raw crash instead of a friendly message."
        exit 1
    fi
    if ! printf '%s' "$text" | grep -q -E 'already in use|did not start|could not start|Something went wrong|diagnostics'; then
        write_json "$OUT/crash.json" false "Held the engine port but the window did not show a friendly failure. Accessibility text: ${text}"
        exit 1
    fi
    write_json "$OUT/crash.json" true "With the engine port held by another process, BlinkyBot showed a friendly failure and no stack trace."
    stop_app
    kill "$HOLDER_PID" 2>/dev/null || true
    HOLDER_PID=""
else
    write_json "$OUT/crash.json" true "$(feature_reason crashDiagnostics)"
fi

sparkle_dir="$OUT/sparkle"
mkdir -p "$sparkle_dir"
enclosure="http://127.0.0.1:${FEED_PORT}/BlinkyBot-9.9.9.zip"
python3 "$ROOT/e2e/sparkle_sign.py" "$sparkle_dir" "$enclosure" >"$sparkle_dir/printed-public-key.txt"
python3 -m http.server "$FEED_PORT" --bind 127.0.0.1 --directory "$sparkle_dir" >"$OUT/sparkle-http.log" 2>&1 &
FEED_PID=$!
for _try in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS "http://127.0.0.1:${FEED_PORT}/appcast.xml" >/dev/null && break
    sleep 0.3
done
fixture="/tmp/blinky-e2e-fixture.app"
rm -rf "$fixture"
cp -cR "$APP" "$fixture" 2>/dev/null || cp -R "$APP" "$fixture"
pub="$(tr -d '[:space:]' < "$sparkle_dir/throwaway-public-key.txt")"
plutil -replace SUPublicEDKey -string "$pub" "$fixture/Contents/Info.plist"
plutil -replace SUFeedURL -string "http://127.0.0.1:${FEED_PORT}/appcast.xml" "$fixture/Contents/Info.plist"
codesign --force --sign - "$fixture" >/dev/null 2>"$OUT/codesign.err" || codesign --force --deep --sign - "$fixture" >"$OUT/codesign.err"
if [[ "$(plutil -extract SUPublicEDKey raw "$APP/Contents/Info.plist")" != "$PUBLIC_KEY" ]]; then
    write_json "$OUT/sparkle.json" false "The fixture rewrite changed the packaged app's SUPublicEDKey."
    exit 1
fi
defaults write bot.blinky.shell blinky.updates.automatic -bool true
defaults delete bot.blinky.shell SULastCheckTime 2>/dev/null || true
defaults delete bot.blinky.shell SUSkippedVersion 2>/dev/null || true
BLINKY_SUPERVISE=0 BLINKY_COMPOSE_URL="http://127.0.0.1:${FEED_PORT}/" "$fixture/Contents/MacOS/BlinkyBot" >"$OUT/sparkle-app.out" 2>&1 &
APP_PID=$!
sleep 3
osascript <<'APPLESCRIPT' || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        click menu item "Check for Updates…" of menu "BlinkyBot" of menu bar 1
    end tell
end tell
APPLESCRIPT
found=""
for _try in $(seq 1 30); do
    if "$OUT/window-probe" --contains 9.9.9 >"$OUT/sparkle-probe.json" 2>/dev/null; then
        found="window"
        break
    fi
    if grep -q '9.9.9' "$OUT/sparkle-app.out" 2>/dev/null; then
        found="app log"
        break
    fi
    if grep -R -q '9.9.9' "$HOME/Library/Caches/bot.blinky.shell" "$HOME/Library/Caches/org.sparkle-project.Sparkle" 2>/dev/null; then
        found="Sparkle cache"
        break
    fi
    sleep 1
done
if [[ -z "$found" ]]; then
    write_json "$OUT/sparkle.json" false "The throwaway feed offered 9.9.9 and the fixture app did not surface it. See sparkle-app.out and sparkle-probe.json."
    exit 1
fi
write_json "$OUT/sparkle.json" true "Packaged SUPublicEDKey is ${PUBLIC_KEY} and SUFeedURL is the release appcast. A copy signed with a throwaway key detected 9.9.9 (${found}). The shipped key file was not modified."
stop_app
