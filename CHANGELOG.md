# Changelog

What each release changed, written for somebody deciding whether to install it.

This file is the **English** half of the GitHub Release page. The Chinese half lives in
[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md). Both are assembled by
[Scripts/release-notes.py](Scripts/release-notes.py) (Chinese first).
Add the entry **before** tagging, in the small grammar the converter knows:
bullets, `**bold**`, `` `code` `` and `[links](https://example.com)`.

The app version is this heading. It matches the `VERSION` file and the tag `v` + that version.

## 0.1.2

- **BlinkyBot can update itself.** Check for Updates… is in the BlinkyBot menu. Installed copies also look for a new version about every 12 hours. Settings → Updates turns that check off. There is no beta channel.
- **An update is the full app.** Sparkle installs the release zip, not a delta, and not the disk image. BlinkyBot stops the local engine and Compose before the new app replaces this one, then relaunches.
- **0.1.1 does not contain the updater.** Install 0.1.2 from the disk image once. Later versions can update in place.

## 0.1.1

- **The Mac app opens without a Supabase project.** Local mode no longer builds a Supabase client during the first screen, so a missing project URL or API key does not crash the board.
- **The window is a product window.** The title bar no longer shows the local address, and the back, forward, and reload controls are gone.
- **The disk image is smaller.** The app ships the Next.js standalone server and a pruned engine, not the full dependency tree. Chromium stays out of the app and downloads on first use.
- **Install is drag to Applications.** Open the disk image, drag BlinkyBot onto Applications, then open it. It is not a double-click package installer.

## 0.1.0

- **BlinkyBot installs as a Mac app.** Open it and it starts a local engine and the Compose UI on this Mac. Docker is not required, and a Supabase project is not required.
- **The first runtimes are CLIs already on the Mac.** Codex CLI, Kimi CLI, and Grok CLI, plus Claude Code when it is installed.
- **Coworkers, memory, and approvals stay on this Mac.** Data is under `~/Library/Application Support/BlinkyBot`.
- **AGPL-3.0-only.** The license is in the app bundle and in the repository. This is a fork of Rerun.
