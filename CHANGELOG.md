# Changelog

What each release changed, written for somebody deciding whether to install it.

This file is the **English** half of the GitHub Release page. The Chinese half lives in
[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md). Both are assembled by
[Scripts/release-notes.py](Scripts/release-notes.py) (Chinese first).
Add the entry **before** tagging, in the small grammar the converter knows:
bullets, `**bold**`, `` `code` `` and `[links](https://example.com)`.

The app version is this heading. It matches the `VERSION` file and the tag `v` + that version.

## 0.1.0

- **BlinkyBot installs as a Mac app.** Open it and it starts a local engine and the Compose UI on this Mac. Docker is not required, and a Supabase project is not required.
- **The first runtimes are CLIs already on the Mac.** Codex CLI, Kimi CLI, and Grok CLI, plus Claude Code when it is installed.
- **Coworkers, memory, and approvals stay on this Mac.** Data is under `~/Library/Application Support/BlinkyBot`.
- **AGPL-3.0-only.** The license is in the app bundle and in the repository. This is a fork of Rerun.
