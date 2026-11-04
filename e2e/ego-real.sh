#!/usr/bin/env bash
# Copy a real ego-browser helper out of ego lite when the disk image can be installed.
# Prints the destination path. Exits non-zero when the helper is not available.

set -euo pipefail

dest="${1:-}"
if [[ -z "$dest" ]]; then
    echo "usage: ego-real.sh <dest>" >&2
    exit 2
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "ego lite disk images are macOS only." >&2
    exit 1
fi

copy_helper() {
    local app="$1"
    local found=""
    found="$(find "$app/Contents" -type f -name ego-browser 2>/dev/null | head -n 1 || true)"
    if [[ -z "$found" || ! -s "$found" ]]; then
        return 1
    fi
    cp "$found" "$dest"
    chmod +x "$dest"
}

for app in "/Applications/ego lite.app" "$HOME/Applications/ego lite.app"; do
    if [[ -d "$app" ]] && copy_helper "$app"; then
        printf '%s\n' "$dest"
        exit 0
    fi
done

tmp="$(mktemp -d "${TMPDIR:-/tmp}/blinky-ego.XXXXXX")"
mount="$tmp/mount"
cleanup() {
    hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true
    rm -rf "$tmp"
}
trap cleanup EXIT

url="https://cdn.ego.app/setup/macos/arm64/egolite-fHoqgZ74bOEM.dmg"
if [[ "$(uname -m)" != "arm64" ]]; then
    url="https://cdn.ego.app/setup/macos/x64/egolite-fHoqgZ74bOEM.dmg"
fi
mkdir -p "$mount"
curl -fL --retry 2 --max-time 45 -o "$tmp/ego.dmg" "$url"
hdiutil attach "$tmp/ego.dmg" -nobrowse -readonly -mountpoint "$mount" >/dev/null
app="$(find "$mount" -maxdepth 3 -type d -iname 'ego lite.app' | head -n 1)"
if [[ -z "$app" ]]; then
    echo "The ego lite disk image did not contain ego lite.app." >&2
    exit 1
fi
copy_helper "$app"
printf '%s\n' "$dest"
