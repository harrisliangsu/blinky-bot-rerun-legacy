# BlinkyBot

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)
[![macOS 14+](https://img.shields.io/badge/macOS-14%2B-black.svg)](https://github.com/harrisliangsu/blinky-bot/releases)
[![GitHub release](https://img.shields.io/github/v/release/harrisliangsu/blinky-bot)](https://github.com/harrisliangsu/blinky-bot/releases)

BlinkyBot is a local agent hub for Mac. Open the app and it runs on this machine: a local engine, the Compose board, and the CLIs you already have. Your coworkers, their memory, and approvals stay in `~/Library/Application Support/BlinkyBot`.

This repository is a public fork of [Rerun](https://github.com/rerun-build/rerun) (AGPL-3.0-only). The Rerun name, logo, and coworker characters remain trademarks of Rerun. BlinkyBot is not endorsed by Rerun. See [TRADEMARK.md](TRADEMARK.md).

## Install

Phase 1 is a Mac app for macOS 14 or newer. Download `BlinkyBot-<version>.dmg` from the [releases](https://github.com/harrisliangsu/blinky-bot/releases).

The disk image is a drag-to-Applications install, the usual Mac app window: BlinkyBot, a shortcut to Applications, and a Read Me. Open the image, drag BlinkyBot onto Applications, then open it from Applications. It is not a double-click `.pkg`. A package installer would copy the app without the drag, which helps someone who has never seen a disk image, but an ad-hoc signed package still stops at the same Gatekeeper prompt and is a worse fit until the app is notarized.

This build is not notarized. If macOS blocks the first launch, open BlinkyBot, dismiss the warning, then go to System Settings → Privacy & Security → Open Anyway. You only do this once.

BlinkyBot then starts the local engine on `127.0.0.1:3001` and the Compose UI on `127.0.0.1:3000`, and shows the board. You do not install Docker, Node, or pnpm, and you do not create a Supabase project.

A zip of the same app is attached to the release for people who do not want a disk image. Unzip it and drag BlinkyBot to Applications. Sparkle installs that zip, not the disk image.

## Updates

BlinkyBot 0.1.2 and later check for a new version about every 12 hours, and BlinkyBot → Check for Updates… asks now. Settings → Updates turns the automatic check off. There is no beta channel. An update is the full app. BlinkyBot stops the local engine and Compose, then installs and relaunches.

0.1.1 does not contain the updater. Install 0.1.2 from the disk image once. After that, newer versions can update in place. Details: [docs/releasing.md](docs/releasing.md).

## What you get

- The Compose board on this Mac
- Foreman, memory, and approvals, with data under `~/Library/Application Support/BlinkyBot`
- CLI runtimes already on the machine: Codex CLI, Kimi CLI, Grok CLI, and Claude Code when it is installed

The locked scope is [docs/phase1.md](docs/phase1.md). How the processes start is [docs/no-docker-runtime.md](docs/no-docker-runtime.md).

## From a checkout

```bash
pnpm install
node scripts/blinky-local/blinky-local.mjs build
node scripts/blinky-local/blinky-local.mjs start
```

The UI listens on `http://127.0.0.1:3000` and the engine on `http://127.0.0.1:3001`, with `BLINKY_LOCAL_AUTH=1`. Data is `~/Library/Application Support/BlinkyBot` on macOS and `~/.blinkybot` elsewhere. Details: [scripts/blinky-local/README.md](scripts/blinky-local/README.md).

A Mac with Xcode builds the app:

```bash
./Scripts/bundle.sh
```

That writes `build.noindex/BlinkyBot.app`. The layout and the Linux `--plan` check are in [Scripts/README.md](Scripts/README.md).

## Releases

The version is the `VERSION` file. Tagging `vX.Y.Z` and pushing that tag runs [docs/releasing.md](docs/releasing.md) and attaches `BlinkyBot-<version>.dmg` and `BlinkyBot-<version>.zip`.

## License

[GNU Affero General Public License v3.0 only](LICENSE). You can run, modify, and host this code. If you host a modified version for other people, you publish those changes under the same license.

Upstream: [rerun-build/rerun](https://github.com/rerun-build/rerun). Package names such as `@rerun/*` and `rerun-engine` stay the upstream identifiers so the monorepo builds unchanged.

## Upstream Rerun server install (not Phase 1)

Docker and Supabase are the upstream Rerun server, not the BlinkyBot Mac install. That walkthrough is [docs/upstream-server.md](docs/upstream-server.md).

## 中文说明

BlinkyBot 是跑在 Mac 上的本地智能体中枢。安装方式是下载磁盘映像，把 BlinkyBot 拖进「应用程序」，然后打开。应用自己启动本地 Engine 和 Compose 界面，不需要 Docker，也不需要 Supabase。数据在 `~/Library/Application Support/BlinkyBot`。首批运行时是这台 Mac 上的 Codex CLI、Kimi CLI、Grok CLI，以及已经安装的 Claude Code。

本仓库是 [Rerun](https://github.com/rerun-build/rerun) 的公开分支（AGPL-3.0-only）。Rerun 的名称与标识仍属于上游，BlinkyBot 不声称获得 Rerun 背书。见 [TRADEMARK.md](TRADEMARK.md)。

从 0.1.2 起，应用大约每 12 小时检查一次更新，菜单里的「Check for Updates…」可以马上检查。0.1.1 没有更新器，需要先手动安装 0.1.2。发布说明见 [docs/releasing.md](docs/releasing.md)。上游 Rerun 服务器安装（不是第一阶段）见 [docs/upstream-server.md](docs/upstream-server.md)。
