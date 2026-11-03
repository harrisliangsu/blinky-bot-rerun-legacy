#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 BlinkyBot contributors.
#
# Assembles BlinkyBot.app. Same job as blinky-mac Scripts/bundle.sh: turn the
# built products into one app a person can open. The Swift shell comes from
# XcodeGen. The engine and Compose come from the pnpm production build and are
# staged where BlinkyLocalRuntime looks:
#
#   BlinkyBot.app/Contents/Resources/runtime/node/bin/node
#   BlinkyBot.app/Contents/Resources/runtime/engine/dist/cli/bin.js
#   BlinkyBot.app/Contents/Resources/runtime/ui/node_modules/next/dist/bin/next
#
#   ./Scripts/bundle.sh                 → build.noindex/BlinkyBot.app
#   ./Scripts/bundle.sh --zip           → and build.noindex/BlinkyBot-<version>.zip
#   ./Scripts/bundle.sh --open          → and reveal it in Finder
#   ./Scripts/bundle.sh --plan          → print the layout (any OS) and exit
#
# The version is the VERSION file, written into CFBundleShortVersionString and
# CFBundleVersion. Tag a release v$(cat VERSION).
#
# A Linux machine can run --plan and the node tests. It cannot produce the .app.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f VERSION || ! -f pnpm-workspace.yaml ]]; then
    echo "Run Scripts/bundle.sh from a BlinkyBot checkout." >&2
    exit 1
fi

plan=0
zip=0
open_finder=0
allow_host_node=0
skip_install=0
skip_server_build=0

usage() {
    cat <<'EOF'
Usage: Scripts/bundle.sh [--plan] [--zip] [--open] [--allow-host-node] [--skip-install] [--skip-server-build]

  (no flags)            build build.noindex/BlinkyBot.app on macOS
  --plan                print the bundle layout and the Mac steps, then exit
  --zip                 also write build.noindex/BlinkyBot-<version>.zip
  --open                reveal the app in Finder
  --allow-host-node     copy Node even when it links Homebrew libraries
  --skip-install        skip pnpm install (node_modules must already exist)
  --skip-server-build   skip the engine and Compose rebuild (dist and .next must exist)

Version: the VERSION file. It is written to CFBundleShortVersionString and CFBundleVersion.

CODESIGN_IDENTITY   codesign identity (default: - for an ad-hoc signature)
BLINKY_NODE         node binary copied into the app (default: node on PATH)
DEVELOPMENT_TEAM    passed to xcodebuild when set
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --plan) plan=1 ;;
        --zip) zip=1 ;;
        --open) open_finder=1 ;;
        --allow-host-node) allow_host_node=1 ;;
        --skip-install) skip_install=1 ;;
        --skip-server-build) skip_server_build=1 ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
    shift
done

if ! command -v node >/dev/null 2>&1; then
    echo "Missing node. Install Node.js 22 from https://nodejs.org." >&2
    exit 1
fi

node Scripts/plan.mjs node-version "$(node -v)"

if [[ "$plan" -eq 1 ]]; then
    node Scripts/plan.mjs plan
    exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    node Scripts/plan.mjs refuse-host "$(uname -s)" >&2
    exit 1
fi

node Scripts/plan.mjs check-alignment
version="$(node Scripts/plan.mjs version)"

missing=""
while IFS= read -r bin; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        missing="${missing}${bin}"$'\n'
    fi
done < <(node Scripts/plan.mjs tools)
if [[ -n "$missing" ]]; then
    # shellcheck disable=SC2086
    node Scripts/plan.mjs missing-tools $missing >&2
    exit 1
fi

xcodebuild -version | node Scripts/plan.mjs xcode-version

if [[ "$skip_install" -eq 1 ]]; then
    if [[ ! -d node_modules ]]; then
        echo "node_modules is missing. Run pnpm install --frozen-lockfile from the repository root, or drop --skip-install." >&2
        exit 1
    fi
else
    echo "Installing workspace dependencies…"
    pnpm install --frozen-lockfile
fi

if [[ "$skip_server_build" -eq 0 ]]; then
    echo "Building the engine and Compose…"
    node scripts/blinky-local/blinky-local.mjs build
fi
node Scripts/plan.mjs require-checkout

node_bin="${BLINKY_NODE:-$(command -v node)}"
if [[ ! -x "$node_bin" ]]; then
    echo "Node is not executable at ${node_bin}. Set BLINKY_NODE to the Node 22 macOS binary." >&2
    exit 1
fi
node_real="$(node -e 'const fs=require("fs"); process.stdout.write(fs.realpathSync(process.argv[1]))' "$node_bin")"
node Scripts/plan.mjs node-version "$("$node_real" -v)"
file "$node_real" | node Scripts/plan.mjs node-macho
if [[ "$allow_host_node" -eq 0 ]]; then
    otool -L "$node_real" | node Scripts/plan.mjs node-libs
fi

stage="$(mktemp -d "${TMPDIR:-/tmp}/blinky-bundle.XXXXXX")"
cleanup() {
    if [[ -n "${stage:-}" ]]; then
        rm -rf "$stage"
    fi
}
trap cleanup EXIT

echo "Packing the engine…"
if ! env npm_config_package_import_method=copy pnpm --filter rerun-engine --prod deploy "$stage/engine"; then
    node Scripts/plan.mjs deploy-failed engine >&2
    exit 1
fi
ditto "apps/engine/dist" "$stage/engine/dist"
ditto "apps/engine/assets" "$stage/engine/assets"

echo "Packing Compose…"
if ! env npm_config_package_import_method=copy pnpm --filter rerun --prod deploy "$stage/ui"; then
    node Scripts/plan.mjs deploy-failed ui >&2
    exit 1
fi
rm -rf "$stage/ui/.next" "$stage/ui/public"
ditto "apps/ui/.next" "$stage/ui/.next"
ditto "apps/ui/public" "$stage/ui/public"
ditto "apps/ui/next.config.ts" "$stage/ui/next.config.ts"

mkdir -p "$stage/node/bin"
cp "$node_real" "$stage/node/bin/node"
chmod 755 "$stage/node/bin/node"

echo "Building ${version}…"
(
    cd apps/mac-shell
    xcodegen generate
)

derived="build.noindex/DerivedData"
rm -rf "$derived"
mkdir -p build.noindex
# Spotlight indexes an .app wherever it finds one. The .noindex suffix is what
# it honours; the marker is only a second line. Do not rename the directory.
touch "build.noindex/.metadata_never_index"

sign_settings=(CODE_SIGNING_ALLOWED=NO CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO)
if [[ -n "${DEVELOPMENT_TEAM:-}" ]]; then
    sign_settings=(CODE_SIGN_STYLE=Automatic "DEVELOPMENT_TEAM=${DEVELOPMENT_TEAM}")
fi

xcodebuild \
    -project apps/mac-shell/BlinkyBot.xcodeproj \
    -scheme BlinkyBot \
    -configuration Release \
    -destination 'generic/platform=macOS' \
    -derivedDataPath "$PWD/$derived" \
    MARKETING_VERSION="$version" \
    CURRENT_PROJECT_VERSION="$version" \
    "${sign_settings[@]}" \
    build

product="$derived/Build/Products/Release/BlinkyBot.app"
if [[ ! -d "$product" ]]; then
    echo "xcodebuild did not write $product" >&2
    exit 1
fi

app="build.noindex/BlinkyBot.app"
rm -rf "$app"
ditto "$product" "$app"
mkdir -p "$app/Contents/Resources/runtime"
ditto "$stage/node" "$app/Contents/Resources/runtime/node"
ditto "$stage/engine" "$app/Contents/Resources/runtime/engine"
ditto "$stage/ui" "$app/Contents/Resources/runtime/ui"

plutil -convert xml1 "$app/Contents/Info.plist"
node Scripts/plan.mjs patch-plist "$app/Contents/Info.plist"
if ! node Scripts/plan.mjs assert-plist-version "$app/Contents/Info.plist" \
    || ! node Scripts/plan.mjs verify-runtime "$app/Contents/Resources/runtime" \
    || ! node Scripts/plan.mjs audit-symlinks "$app/Contents/Resources/runtime"; then
    rm -rf "$app"
    exit 1
fi

# Node is signed without the hardened runtime so V8 can JIT. The Swift
# executable keeps the hardened runtime. --deep would put that flag on Node.
identity="${CODESIGN_IDENTITY:--}"
find "$app/Contents/Resources/runtime" -type f \( -name '*.node' -o -perm -111 \) > "$stage/sign-list"
while IFS= read -r bin; do
    if file "$bin" | grep -q 'Mach-O'; then
        codesign --force --sign "$identity" "$bin" || exit 1
    fi
done < "$stage/sign-list"
codesign --force --sign "$identity" --options runtime "$app/Contents/MacOS/BlinkyBot"
codesign --force --sign "$identity" "$app"

echo "→ $app"

if [[ "$zip" -eq 1 ]]; then
    archive="build.noindex/BlinkyBot-${version}.zip"
    rm -f "$archive"
    ditto -c -k --keepParent "$app" "$archive"
    echo "→ $archive"
fi

if [[ "$open_finder" -eq 1 ]]; then
    open -R "$app"
fi
