#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Captures the first-run onboarding cover (English and Chinese, light and dark).
# A runner without a window server can fail this script. CI marks the step non-blocking.

set -u

app="${1:-build.noindex/BlinkyBot.app}"
out="${BLINKY_ONBOARDING_SHOT_DIR:-build.noindex/onboarding-screenshots}"
mkdir -p "$out"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "onboarding screenshots run on macOS" >&2
    exit 1
fi
if [[ ! -x "$app/Contents/MacOS/BlinkyBot" ]]; then
    echo "No BlinkyBot binary at $app" >&2
    exit 1
fi

pids=()
cleanup() {
    if [[ ${#pids[@]} -eq 0 ]]; then
        return
    fi
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null || true
        kill -9 "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT

capture() {
    local lang="$1"
    local appearance="$2"
    local file="$out/onboarding-${lang}-${appearance}.png"
    BLINKY_SUPERVISE=0 \
        BLINKY_ONBOARDING=always \
        BLINKY_ONBOARDING_FIXTURE=showcase \
        BLINKY_ONBOARDING_LANG="$lang" \
        BLINKY_ONBOARDING_APPEARANCE="$appearance" \
        "$app/Contents/MacOS/BlinkyBot" >/tmp/blinky-onboarding-shot.log 2>&1 &
    local pid=$!
    pids+=("$pid")
    sleep 4
    screencapture -x "$file" || true
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
}

capture en light
capture en dark
capture zh light
capture zh dark

found=0
for file in "$out"/*.png; do
    if [[ -f "$file" && -s "$file" ]]; then
        found=1
        echo "wrote $file"
    fi
done
if [[ "$found" -ne 1 ]]; then
    echo "No onboarding screenshots were captured" >&2
    exit 1
fi
