#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 BlinkyBot contributors.
#
# Builds build.noindex/BlinkyBot-<version>.dmg from the app Scripts/bundle.sh
# wrote: the app, a shortcut to Applications, and a short bilingual Read Me.
#
#   ./Scripts/dmg.sh           → ./Scripts/bundle.sh, then the disk image
#   ./Scripts/dmg.sh --reuse   → package build.noindex/BlinkyBot.app without
#                                building again. CFBundleShortVersionString
#                                must match VERSION.
#
# The release workflow builds once:
#
#   ./Scripts/bundle.sh --zip
#   ./Scripts/dmg.sh --reuse
#
# The image is the install guide. BlinkyBot is not notarized, so the Read Me
# says how to allow the first launch. There is no custom Finder backdrop.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "dmg.sh writes a Mac disk image and has to run on macOS." >&2
    echo "The release workflow runs it on macos-14. This machine is $(uname -s)." >&2
    exit 1
fi

VERSION="$(tr -d '[:space:]' < VERSION)"
VOLUME="BlinkyBot"
APP="build.noindex/BlinkyBot.app"
STAGING="build.noindex/dmg"
FINAL="build.noindex/BlinkyBot-$VERSION.dmg"

REUSE=0
for arg in "$@"; do
    case "$arg" in
        --reuse) REUSE=1 ;;
        -h|--help)
            echo "Usage: Scripts/dmg.sh [--reuse]"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            exit 1
            ;;
    esac
done

if [[ "$REUSE" -eq 1 ]]; then
    if [[ ! -x "$APP/Contents/MacOS/BlinkyBot" ]]; then
        echo "No $APP to package. Run ./Scripts/bundle.sh first." >&2
        exit 1
    fi
    bundled="$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist" | tr -d '[:space:]')"
    if [[ "$bundled" != "$VERSION" ]]; then
        echo "$APP is version $bundled; VERSION is $VERSION. Run ./Scripts/bundle.sh again." >&2
        exit 1
    fi
    echo "Reusing $APP (version $VERSION)."
else
    ./Scripts/bundle.sh
fi

case "$(uname -m)" in
    arm64)
        ARCH_EN="Apple Silicon (arm64)"
        ARCH_ZH="Apple 芯片（arm64）"
        ;;
    x86_64)
        ARCH_EN="Intel (x86_64)"
        ARCH_ZH="Intel（x86_64）"
        ;;
    *)
        ARCH_EN="$(uname -m)"
        ARCH_ZH="$(uname -m)"
        ;;
esac

echo "Staging the disk image…"
rm -rf "$STAGING" "$FINAL"
mkdir -p "$STAGING"
ditto "$APP" "$STAGING/BlinkyBot.app"
ln -s /Applications "$STAGING/Applications"

cat > "$STAGING/Read Me.txt" <<EOF
BlinkyBot ${VERSION}

Drag BlinkyBot into Applications, then open it.

This build is not notarized. If macOS blocks the first launch, open BlinkyBot, dismiss the warning, then go to System Settings → Privacy & Security → Security → Open Anyway. You only do this once.

BlinkyBot starts a local engine and the Compose UI on this Mac. You do not need Docker or a Supabase project. Requires macOS 14 or newer. This download is for ${ARCH_EN}.

Source for this version is the git tag v${VERSION} in the BlinkyBot repository. Licensed under the GNU Affero General Public License v3.0 only. The license text is the LICENSE file at that tag.

---

把 BlinkyBot 拖进「应用程序」，然后打开。

这一版没有 Apple 公证。如果系统拦截了第一次打开：先打开 BlinkyBot 并关闭警告，再到「系统设置 → 隐私与安全性 → 安全性 → 仍要打开」。只需一次。

BlinkyBot 会在这台 Mac 上启动本地 Engine 和 Compose 界面，不需要 Docker，也不需要 Supabase。需要 macOS 14 或更高版本。这个安装包适用于 ${ARCH_ZH}。

这一版的源代码是 BlinkyBot 仓库里的 git tag v${VERSION}。许可协议是 GNU AGPL-3.0-only。协议全文是该 tag 上的 LICENSE。
EOF

hdiutil create -srcfolder "$STAGING" -volname "$VOLUME" -fs HFS+ \
    -format UDZO -imagekey zlib-level=9 -ov "$FINAL"

rm -rf "$STAGING"
echo "→ $FINAL"
