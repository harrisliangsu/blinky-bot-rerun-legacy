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
    if [[ ! -f "$OUT/finished" && "$status" -eq 0 ]]; then
        status=1
    fi
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

write_deps() {
    python3 - "$OUT/deps.json" <<'PY'
import json, os, sys
path = sys.argv[1]
deps = {
    "codex": {"kind": "stub", "detail": "e2e/stubs/agent-cli.mjs via RERUN_CODEX_PATH. The coworker chat streams through this stub."},
    "claude": {"kind": "stub", "detail": "e2e/stubs/agent-cli.mjs via RERUN_CLAUDE_PATH."},
    "kimi": {"kind": "stub", "detail": "e2e/stubs/agent-cli.mjs via RERUN_KIMI_PATH."},
    "grok": {"kind": "stub", "detail": "e2e/stubs/agent-cli.mjs via RERUN_GROK_PATH."},
    "ego-browser": {"kind": os.environ.get("BLINKY_EGO_KIND", "stub"), "detail": os.environ.get("BLINKY_EGO_DETAIL", "")},
    "rex": {"kind": "absent", "detail": "No Rex toggle is on this tree, so no rex binary is placed on PATH."},
    "gh": {"kind": "stub", "detail": "e2e/stubs/gh answers auth status and repo view for fixture/widget."},
    "git": {"kind": "real", "detail": "The runner git clones a local bare repo through insteadOf."},
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(deps, handle, indent=2)
    handle.write("\n")
PY
}

capture_window() {
    local dest="$1"
    if "$OUT/window-probe" >"$OUT/window-probe.json" 2>/dev/null; then
        local window_id
        window_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["windows"][0]["id"])' "$OUT/window-probe.json")"
        screencapture -x -l "$window_id" "$dest" || true
    fi
}

ax_blob() {
    osascript <<'APPLESCRIPT' 2>/dev/null || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        set blob to ""
        try
            set blob to blob & (value of every static text of window 1 as text) & linefeed
        end try
        try
            set blob to blob & (name of every button of window 1 as text) & linefeed
        end try
        try
            set blob to blob & (name of every UI element of entire contents of window 1 as text)
        end try
        return blob
    end tell
end tell
APPLESCRIPT
}

run_gated() {
    local key="$1"
    local file="$2"
    local mode="$3"
    if [[ "$(feature_enabled "$key")" == yes ]]; then
        node "$ROOT/e2e/drive.mjs" "$mode"
    else
        write_json "$OUT/$file" true "$(feature_reason "$key")"
    fi
}

open_settings() {
    osascript <<'APPLESCRIPT' || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        keystroke "," using command down
        delay 0.6
        key code 121
        delay 0.2
        key code 121
    end tell
end tell
APPLESCRIPT
    sleep 1
}

close_settings() {
    osascript <<'APPLESCRIPT' || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        if exists window "BlinkyBot Settings" then
            click (first button of window "BlinkyBot Settings" whose subrole is "AXCloseButton")
        end if
    end tell
end tell
APPLESCRIPT
    sleep 0.5
}

install_rex_fixture() {
    local app="$HOME/Applications/Rex.app"
    local bin="$app/Contents/Helpers/Rex Server.rex/Contents/MacOS"
    rm -rf "$app"
    mkdir -p "$bin" "$app/Contents"
    python3 - "$app/Contents/Info.plist" <<'PY'
import plistlib, sys
plistlib.dump({"CFBundleIdentifier": "com.superlogical.rex", "CFBundleName": "Rex"}, open(sys.argv[1], "wb"))
PY
    cp "$ROOT/e2e/stubs/rex" "$bin/rex"
    chmod +x "$bin/rex"
    cp "$bin/rex" "$OUT/bin/rex"
    chmod +x "$OUT/bin/rex"
    export BLINKY_REX_LOG="$bin/calls.log"
    : >"$BLINKY_REX_LOG"
}

rex_settings() {
    if [[ "$(feature_enabled rex)" != yes ]]; then
        write_json "$OUT/rex-ui.json" true "$(feature_reason rex)"
        write_json "$OUT/rex.json" true "$(feature_reason rex)"
        return
    fi
    open_settings
    sleep 1
    capture_window "$OUT/screenshots/rex-toggle-off.png"
    "$OUT/window-probe" --contains "Rex is not installed" >"$OUT/rex-off-probe.json" 2>/dev/null || true
    close_settings
    install_rex_fixture
    stop_app
    launch_app "$OUT/app-rex.out"
    if ! wait_ready "$OUT/app-rex.out"; then
        write_json "$OUT/rex-ui.json" false "BlinkyBot did not come back after the Rex.app fixture was installed."
        exit 1
    fi
    open_settings
    local _try ready=0
    for _try in $(seq 1 8); do
        if "$OUT/window-probe" --contains "The next agent run opens in Rex" >"$OUT/rex-ready.json" 2>/dev/null; then
            ready=1
            break
        fi
        "$OUT/window-probe" --click "Check again" --click-last >"$OUT/rex-refresh.json" 2>/dev/null || true
        sleep 1
    done
    capture_window "$OUT/screenshots/rex-toggle.png"
    if [[ "$ready" != 1 ]]; then
        write_json "$OUT/rex-ui.json" false "The stub Rex.app did not become ready. Applications: $(ls -1 "$HOME/Applications" 2>/dev/null | tr '\n' ' ')"
        exit 1
    fi
    if ! "$OUT/window-probe" --click "Show bot activity in Rex" >"$OUT/rex-toggle-click.json"; then
        write_json "$OUT/rex-ui.json" false "The Rex switch did not take a press. See rex-toggle-click.json."
        exit 1
    fi
    local watch=0 _try
    for _try in $(seq 1 8); do
        watch="$(defaults read bot.blinky.shell blinkyRexWatch 2>/dev/null || echo 0)"
        [[ "$watch" == "1" ]] && break
        sleep 1
    done
    if [[ "$watch" != "1" ]]; then
        write_json "$OUT/rex-ui.json" false "Clicking Show bot activity in Rex did not turn blinkyRexWatch on."
        exit 1
    fi
    close_settings
    python3 - "$OUT/deps.json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    deps = json.load(handle)
deps["rex"] = {"kind": "stub", "detail": "e2e/stubs/rex inside a fixture Rex.app. The real Rex app is not installed on the runner."}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(deps, handle, indent=2)
    handle.write("\n")
PY
    write_json "$OUT/rex-ui.json" true "With no Rex.app the toggle stayed off. After the stub Rex.app was installed, Show bot activity in Rex turned on. Screenshots: rex-toggle-off.png and rex-toggle.png."
}

rex_disappear() {
    if [[ "$(feature_enabled rex)" != yes ]]; then
        return
    fi
    local bin
    bin="$(dirname "$BLINKY_REX_LOG")"
    : >"$bin/fail"
    open_settings
    "$OUT/window-probe" --click "Check again" --click-last >"$OUT/rex-recheck.json" 2>/dev/null || true
    sleep 1
    capture_window "$OUT/screenshots/rex-toggle-removed.png"
    local watch state
    watch="$(defaults read bot.blinky.shell blinkyRexWatch 2>/dev/null || echo 0)"
    state="$(python3 -c 'import json,os; print(json.load(open(os.environ["BLINKY_SUPPORT_DIR"]+"/rex-watch.json")).get("enabled"))' 2>/dev/null || echo missing)"
    close_settings
    if [[ "$watch" != "0" || "$state" != "False" ]]; then
        write_json "$OUT/rex-ui.json" false "Rex disappeared but the toggle stayed on (defaults ${watch}, state ${state})."
        exit 1
    fi
    write_json "$OUT/rex-ui.json" true "With no Rex.app the toggle stayed off. The stub Rex.app let Show bot activity in Rex turn on. When rex version failed, Check again turned it off. Screenshots: rex-toggle-off.png, rex-toggle.png, rex-toggle-removed.png."
}

press_escape() {
    osascript <<'APPLESCRIPT' || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        key code 53
    end tell
end tell
APPLESCRIPT
}

onboarding_completed() {
    local value
    value="$(defaults read bot.blinky.shell blinkyOnboardingCompleted 2>/dev/null || true)"
    [[ "$value" == "1" ]]
}

dismiss_onboarding() {
    if [[ "$(feature_enabled onboarding)" != yes ]]; then
        write_json "$OUT/onboarding.json" true "$(feature_reason onboarding)"
        return
    fi
    local _try found=0
    for _try in $(seq 1 20); do
        if "$OUT/window-probe" --contains "Set up tools on this Mac" >"$OUT/onboarding-probe.json" 2>/dev/null; then
            found=1
            break
        fi
        sleep 1
    done
    capture_window "$OUT/screenshots/onboarding.png"
    if [[ "$found" != 1 ]] && onboarding_completed; then
        write_json "$OUT/onboarding.json" true "Onboarding was already completed on this Mac, so the cover did not appear."
        return
    fi
    "$OUT/window-probe" --click "Skip" >"$OUT/onboarding-click.json" 2>/dev/null || true
    press_escape
    sleep 1
    if ! onboarding_completed; then
        osascript <<'APPLESCRIPT' || true
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        set w to window 1
        set p to position of w
        set s to size of w
        click at {((item 1 of p) + (item 1 of s) - 120), ((item 2 of p) + (item 2 of s) - 36)}
    end tell
end tell
APPLESCRIPT
        sleep 1
    fi
    capture_window "$OUT/screenshots/onboarding-dismissed.png"
    if ! onboarding_completed; then
        write_json "$OUT/onboarding.json" false "Skip did not complete first-run setup. The cover screenshot is onboarding.png."
        exit 1
    fi
    write_json "$OUT/onboarding.json" true "The first-run screen showed Set up tools on this Mac. Skip completed setup."
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

prepare_git_fixtures() {
    local bare="$OUT/origin.git"
    local locked="$OUT/locked.git"
    local seed="$OUT/git-seed"
    local locked_seed="$OUT/git-locked-seed"
    rm -rf "$bare" "$locked" "$seed" "$locked_seed"
    git init --bare -b main "$bare"
    git init --bare -b main "$locked"
    git init -b main "$seed"
    git -C "$seed" config user.email e2e@example.com
    git -C "$seed" config user.name E2E
    printf 'from-origin\n' >"$seed/README"
    git -C "$seed" add README
    git -C "$seed" commit -m init
    git -C "$seed" remote add origin "$bare"
    git -C "$seed" push origin main
    git init -b main "$locked_seed"
    git -C "$locked_seed" config user.email e2e@example.com
    git -C "$locked_seed" config user.name E2E
    printf 'locked\n' >"$locked_seed/README"
    git -C "$locked_seed" add README
    git -C "$locked_seed" commit -m init
    git -C "$locked_seed" remote add origin "$locked"
    git -C "$locked_seed" push origin main
    cat >"$OUT/gitconfig" <<EOF
[url "file://${bare}"]
	insteadOf = https://git.fixture.invalid/widget.git
[url "file://${locked}"]
	insteadOf = https://git.fixture.invalid/locked.git
EOF
    export GIT_CONFIG_GLOBAL="$OUT/gitconfig"
    export GIT_CONFIG_NOSYSTEM=1
    export BLINKY_FIXTURE_URL="https://git.fixture.invalid/widget.git"
    export BLINKY_LOCKED_URL="https://git.fixture.invalid/locked.git"
    export BLINKY_LOCKED_PATH="$locked"
}

prepare_stubs() {
    local name
    for name in codex kimi grok claude; do
        ln -sfn "$ROOT/e2e/stubs/agent-cli.mjs" "$OUT/bin/$name.mjs"
    done
    cp "$ROOT/e2e/stubs/ego-browser" "$OUT/bin/ego-browser"
    cp "$ROOT/e2e/stubs/gh" "$OUT/bin/gh"
    chmod +x "$OUT/bin/ego-browser" "$OUT/bin/gh"
    # The app puts Homebrew and /usr/local/bin ahead of the inherited PATH, and the
    # runner's real gh lives there and is not signed in. The node directory stays first.
    if [[ -n "${BLINKY_NODE:-}" && -d "$(dirname "$BLINKY_NODE")" ]]; then
        cp "$ROOT/e2e/stubs/gh" "$(dirname "$BLINKY_NODE")/gh"
        chmod +x "$(dirname "$BLINKY_NODE")/gh"
    fi
    local app_node="${BLINKY_APP:-$HOME/Applications/BlinkyBot.app}/Contents/Resources/runtime/node/bin"
    if [[ -d "$app_node" ]]; then
        cp "$ROOT/e2e/stubs/gh" "$app_node/gh"
        chmod +x "$app_node/gh"
    fi
    prepare_git_fixtures
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
    export BLINKY_APP="$APP"
    export BLINKY_ONBOARDING_LANG=en
    export KIMI_API_KEY="kimi-e2e-token"
    export KIMI_CODE_HOME="$OUT/kimi-home"
    export GROK_HOME="$OUT/grok-home"
    unset XAI_API_KEY || true
    mkdir -p "$OUT/kimi-home" "$OUT/grok-home"
    export BLINKY_STUB_CONTROL="$OUT/stub-control.json"
    printf '%s\n' '{}' >"$BLINKY_STUB_CONTROL"
    export EGO_BROWSER_PATH="$OUT/bin/ego-browser"
    export BLINKY_EGO_KIND=stub
    export BLINKY_EGO_DETAIL="Install did not produce a helper. Routing uses e2e/stubs/ego-browser."
    if "$ROOT/e2e/ego-real.sh" "$OUT/bin/ego-browser-real" >"$OUT/ego-real.path" 2>"$OUT/ego-install.log"; then
        export BLINKY_EGO_KIND=real
        export BLINKY_EGO_DETAIL="Helper copied to $OUT/bin/ego-browser-real. Page routing still uses the stub, because the ego host is not signed in on the runner."
        "$OUT/bin/ego-browser-real" nodejs </dev/null >"$OUT/ego-real.out" 2>"$OUT/ego-real.err" &
        local real_pid=$!
        local _try
        for _try in 1 2 3 4 5 6 7 8; do
            kill -0 "$real_pid" 2>/dev/null || break
            sleep 1
        done
        if kill -0 "$real_pid" 2>/dev/null; then
            kill "$real_pid" 2>/dev/null || true
            wait "$real_pid" 2>/dev/null || true
        else
            wait "$real_pid" 2>/dev/null || true
        fi
        if grep -q 'BLINKY_EGO_JSON' "$OUT/ego-real.out" 2>/dev/null; then
            export EGO_BROWSER_PATH="$OUT/bin/ego-browser-real"
            export BLINKY_EGO_DETAIL="The installed ego-browser printed a page payload, so routing uses that binary."
        fi
    fi
    write_deps
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
capture_window "$OUT/screenshots/blinky-window.png"
dismiss_onboarding
rex_settings

BLINKY_API_KEY="$(tr -d '[:space:]' < "$SUPPORT/engine-api-key")"
export BLINKY_API_KEY
node "$ROOT/e2e/drive.mjs" core
if [[ "$(feature_enabled rex)" == yes ]]; then
    node "$ROOT/e2e/drive.mjs" rex
    rex_disappear
fi
node "$ROOT/e2e/drive.mjs" chat
node "$ROOT/e2e/drive.mjs" runs
node "$ROOT/e2e/drive.mjs" clis
run_gated ego ego.json ego
run_gated ego ego-missing.json ego-missing
run_gated workspaceClone workspace.json workspace
run_gated rex rex.json rex

if [[ "$(feature_enabled menuBar)" == yes ]]; then
    cat >"$OUT/menu.applescript" <<'APPLESCRIPT'
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        if (count of menu bars) < 2 then error "BlinkyBot has no status menu bar"
        if (count of menu bar items of menu bar 2) < 1 then error "BlinkyBot status menu bar is empty"
        perform action "AXPress" of menu bar item 1 of menu bar 2
        delay 0.6
        set titles to {}
        repeat with itemRef in menu items of menu 1 of menu bar item 1 of menu bar 2
            set end of titles to name of itemRef
        end repeat
        set AppleScript's text item delimiters to " | "
        return titles as text
    end tell
end tell
APPLESCRIPT
    set +e
    menu_titles=$(osascript "$OUT/menu.applescript" 2>&1)
    menu_status=$?
    set -e
    if [[ "$menu_status" -ne 0 ]]; then
        write_json "$OUT/menubar.json" false "Menu bar / background mode is on this tree, but the status item was not there. ${menu_titles}"
        exit 1
    fi
    printf '%s\n' "$menu_titles" >"$OUT/menu-titles.txt"
    capture_window "$OUT/screenshots/menu-bar.png"
    for needle in "Open BlinkyBot" "New Bot" "Restart Services" "Quit"; do
        if ! printf '%s' "$menu_titles" | grep -q "$needle"; then
            write_json "$OUT/menubar.json" false "The status menu did not include ${needle}. Titles: ${menu_titles}"
            exit 1
        fi
    done
    if ! osascript <<'APPLESCRIPT'
tell application "System Events"
    tell process "BlinkyBot"
        set frontmost to true
        key code 53
        delay 0.3
        click (first button of window 1 whose subrole is "AXCloseButton")
    end tell
end tell
APPLESCRIPT
    then
        write_json "$OUT/menubar.json" false "The status menu was ${menu_titles}, but the window close button could not be clicked."
        exit 1
    fi
    sleep 2
    if ! kill -0 "$APP_PID" 2>/dev/null; then
        write_json "$OUT/menubar.json" false "Closing the window quit BlinkyBot. Menu titles: ${menu_titles}"
        exit 1
    fi
    if ! curl -fsS "http://127.0.0.1:${ENGINE_PORT}/health" >/dev/null; then
        write_json "$OUT/menubar.json" false "Closing the window left the process up, but the engine health check stopped."
        exit 1
    fi
    capture_window "$OUT/screenshots/after-close.png"
    write_json "$OUT/menubar.json" true "The status menu lists ${menu_titles}. Closing the window leaves BlinkyBot and the engine running."
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
node "$ROOT/e2e/drive.mjs" retire
stop_app

if [[ "$(feature_enabled crashDiagnostics)" == yes ]]; then
    python3 -m http.server "$ENGINE_PORT" --bind 127.0.0.1 >"$OUT/port-holder.log" 2>&1 &
    HOLDER_PID=$!
    sleep 0.5
    launch_app "$OUT/app-crash.out"
    found_port=0
    for _try in $(seq 1 20); do
        if "$OUT/window-probe" --contains "That port is already in use" >"$OUT/crash-probe.json" 2>/dev/null; then
            found_port=1
            break
        fi
        sleep 1
    done
    capture_window "$OUT/screenshots/crash.png"
    if "$OUT/window-probe" --contains "Traceback" >/dev/null 2>&1 || "$OUT/window-probe" --contains "EXC_BAD" >/dev/null 2>&1; then
        write_json "$OUT/crash.json" false "The failure view showed a raw crash instead of a friendly message."
        exit 1
    fi
    if [[ "$found_port" != 1 ]]; then
        write_json "$OUT/crash.json" false "Held the engine port but the window did not show That port is already in use. See crash-probe.json."
        exit 1
    fi
    if ! "$OUT/window-probe" --contains "Retry" >/dev/null 2>&1 || ! "$OUT/window-probe" --contains "Copy Diagnostics" >/dev/null 2>&1; then
        write_json "$OUT/crash.json" false "The port failure did not offer Retry and Copy Diagnostics. See crash-probe.json."
        exit 1
    fi
    if ! kill -0 "$APP_PID" 2>/dev/null; then
        write_json "$OUT/crash.json" false "BlinkyBot exited while showing the port failure."
        exit 1
    fi
    write_json "$OUT/crash.json" true "With the engine port held by another process, BlinkyBot showed That port is already in use, Retry, and Copy Diagnostics, and no stack trace."
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
touch "$OUT/finished"
stop_app
