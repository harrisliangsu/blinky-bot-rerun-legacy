# BlinkyBot Mac shell

Phase 1 native shell for **BlinkyBot**. Opening the app starts a local engine and the local Compose UI, then a SwiftUI window loads Compose in a `WKWebView`. Docker is not part of that path, and a Supabase project is not part of it.

The process model, ports, Application Support layout, and environment are [docs/no-docker-runtime.md](../../docs/no-docker-runtime.md). This directory is the window and the supervisor that implements that startup.

This tree was written on Linux. **It has not been launched as a Mac app.** `swift test` on Linux covers URL selection and the supervisor's plan, ready checks, pid adoption, API key file, and process-group shutdown. It does not open a window. Build the `.app` on a Mac before treating the window as done.

The same startup without the window is `node scripts/blinky-local/blinky-local.mjs` ([README](../../scripts/blinky-local/README.md)). It uses these ports and `BLINKY_LOCAL_AUTH=1`.

## What a launch does

1. Create `~/Library/Application Support/BlinkyBot/` if it is missing (`engine/`, `run/`, `logs/`).
2. Create `engine-api-key` (32 random bytes, hex, mode `0600`) or reuse the file.
3. Start the engine, then Compose. The executable is Node. The arguments are the contract's, not `docker compose`.
4. Poll until `GET http://127.0.0.1:3000/api/version` and `GET http://127.0.0.1:3001/health` both return 200, or 30 seconds pass.
5. Load `http://127.0.0.1:3000`.

Engine:

```bash
node dist/cli/bin.js run
```

| Variable | Value |
| --- | --- |
| `RERUN_DATA_DIR` | `~/Library/Application Support/BlinkyBot/engine` |
| `RERUN_HOST` | `127.0.0.1` |
| `RERUN_PORT` | `3001` |
| `RERUN_API_KEY` | the key file |
| `RERUN_HUB_BASE_URL` | `http://127.0.0.1:3000` |
| `RERUN_CLI_ADAPTERS` | `codex,kimi,grok,claude` |
| `RERUN_DESKTOP` | `off` |
| `RERUN_LOG_LEVEL` | `info` |

The engine and Compose processes get `~/.local/bin` on `PATH`. A GUI app does not inherit a shell profile, and that directory is where ego(lite) onboarding registers `ego-browser`.

## ego(lite)

Agent browser tasks (`browser_navigate`) run in [ego(lite)](https://lite.ego.app/) through the `ego-browser` command. Settings shows whether `ego lite.app` is installed and whether onboarding has registered the command. The check is `EgoLiteDetection.detect(home:path:fileExists:isExecutable:)` in `BlinkyLocalRuntime`, so a first-run screen can add it as a step without reimplementing the lookup. `EgoLiteCopy.string` is the English and Chinese copy for that step. If ego(lite) is missing, the browser task fails with setup instructions. It does not open another browser.

Compose:

```bash
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
```

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOSTNAME` | `127.0.0.1` |
| `PORT` | `3000` |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3000` |
| `RERUN_ENGINE_URL` | `http://127.0.0.1:3001` |
| `RERUN_ENGINE_BROWSER_URL` | `http://127.0.0.1:3001` |
| `RERUN_ENGINE_API_KEY` | the same key |
| `BLINKY_LOCAL_AUTH` | `1` |
| `BLINKY_LOCAL_AUTH_DB` | `~/Library/Application Support/BlinkyBot/local-auth.sqlite` |

The supervisor does not read a repo `.env` and does not pass Supabase variables, `OPENROUTER_API_KEY`, `RERUN_PAIR_TOKEN`, or `RERUN_HUB_URL`. `BLINKY_LOCAL_AUTH=1` turns on the SQLite session in [`apps/ui/lib/local-auth`](../ui/lib/local-auth). The database path is `BLINKY_LOCAL_AUTH_DB`.

Stdout and stderr append to `logs/engine.log` and `logs/ui.log`. Pid files are `run/engine.pid` and `run/ui.pid`. On a later launch, a live pid whose executable is still Node is adopted when its ready URL answers. A dead pid is replaced. A port taken by some other process is left alone, and the window shows that error.

Quit (last window closed, or the app terminates) sends `SIGTERM` to each child this launch owns, waits 5 seconds, then `SIGKILL`. Pid files are removed after the processes exit. Children are started in their own process group, so the engine's CLI grandchildren stop with the engine.

If start fails, the window keeps a banner and a **Retry** button. Typical cases: Node is missing, `dist/cli/bin.js` or the Next server is not built, or the port is already in use.

## Where Node and the servers come from

First match wins:

1. `BLINKY_NODE`, `BLINKY_ENGINE_CWD`, and `BLINKY_UI_CWD` (environment, then Settings / UserDefaults).
2. The app bundle, when these files exist:
   - `Contents/Resources/runtime/node/bin/node`
   - `Contents/Resources/runtime/engine/dist/cli/bin.js`
   - `Contents/Resources/runtime/ui/node_modules/next/dist/bin/next`
3. A checkout. The root is `BLINKY_REPO_ROOT`, the saved checkout path, or a parent of the working directory, the app bundle, or the source file that built the shell. It must contain `pnpm-workspace.yaml` and `apps/engine/package.json`. The engine directory is `apps/engine`. The UI directory is `apps/ui`. Node is the first `node` on `PATH`, then `/opt/homebrew/bin` and `/usr/local/bin`.

A bundled app does not ask the person to install Node. A developer checkout does: Node 22 on the machine, then the two production builds below.

## Open the app from a checkout

Build the servers once. The app does not run `pnpm dev`, and it does not run Docker.

```bash
pnpm install
pnpm --filter @rerun/contracts build
pnpm --filter rerun-engine build
pnpm --filter rerun build
```

Then build and open BlinkyBot (below). From Xcode or `swift run`, the shell finds this checkout by walking up from its source path. A copy of the `.app` that was built somewhere else needs the bundle layout above, or:

```bash
open --env BLINKY_REPO_ROOT=/path/to/blinky-bot /path/to/BlinkyBot.app
```

The window stays on "Starting the local engine and Compose…" until both ready URLs answer.

Without the window, the same ports and environment:

```bash
node scripts/blinky-local/blinky-local.mjs start
curl -sS http://127.0.0.1:3000/api/version
curl -sS http://127.0.0.1:3001/health
```

`BLINKY_SUPPORT_DIR` is the shared data-directory override. `BLINKY_UI_PORT` and `BLINKY_ENGINE_PORT` default to 3000 and 3001.

### Hot-reload loop

`pnpm dev:engine` and `pnpm dev:ui` stay the contributor loop (engine on port 3000, UI on port 3050). That loop is not the install path. Point a shell that is **not** supervising at the dev UI:

```bash
open -n --env BLINKY_SUPERVISE=0 --env BLINKY_COMPOSE_URL=http://127.0.0.1:3050 /path/to/BlinkyBot.app
```

`BLINKY_SUPERVISE=0` (also `off`, `false`, `no`) skips spawning and loads the Compose URL from the existing settings order. `-n` starts a new instance.

### Upstream Docker stack

`docker compose` reproduces the upstream Rerun server. Leave it for that. The steps are [docs/upstream-server.md](../../docs/upstream-server.md). The shell does not start it. The window is a product window: no address bar, and no back, forward, or reload toolbar.

## Distributable app

On a Mac, `Scripts/bundle.sh` at the repository root writes `build.noindex/BlinkyBot.app`. It builds this Xcode target, then stages Node, the engine, and Compose under `Contents/Resources/runtime`, and sets `CFBundleShortVersionString` from the root `VERSION` file. The steps and the CI check (`pnpm bundle:check`, `Scripts/bundle.sh --plan`) are in [Scripts/README.md](../../Scripts/README.md).

The Xcode Run below is the developer loop from a checkout. The bundle script is the app you hand to someone else.

## Build on a Mac

You need macOS 14 or newer and Xcode 15 or newer. The supported artifact is an `.app` bundle so `Info.plist` (local HTTP, the default URL, the About copyright) is actually used.

### XcodeGen (preferred)

[XcodeGen](https://github.com/yonaskolb/XcodeGen) 2.38 or newer reads [`project.yml`](project.yml) and writes a project. The generated project is gitignored; regenerate it when `project.yml` or the sources change.

```bash
brew install xcodegen
cd apps/mac-shell
xcodegen generate
open BlinkyBot.xcodeproj
```

In Xcode, select the **BlinkyBot** scheme and a development team (Signing & Capabilities). App Sandbox is off on purpose: nothing in this target enables it, so the view can call Compose on `127.0.0.1` and the supervisor can spawn Node. Hardened runtime is on. Press Run.

In the running app, BlinkyBot → About BlinkyBot shows the name **BlinkyBot** and the AGPL-3.0 notice. The copyright line comes from `NSHumanReadableCopyright` in [`Info.plist`](Info.plist).

If the banner says Node or a build is missing, use the checkout commands above. If it says a port is in use, quit the other process. Logs are under `~/Library/Application Support/BlinkyBot/logs/`.

### Swift Package Manager

From `apps/mac-shell`, with the Xcode toolchain (`xcode-select -p`):

```bash
swift test     # URL selection and the supervisor helpers. No window.
swift build    # compiles the executable on a Mac
swift run      # secondary path; still supervises when BLINKY_SUPERVISE is unset
```

`swift run` does **not** embed [`Info.plist`](Info.plist). App Transport Security can block `http://127.0.0.1` for that bare binary, and the About copyright string will not match the bundled app. Use the XcodeGen `.app` for a real launch.

On Linux, `swift test` compiles the URL library, the runtime library, and a stub executable that exits with a message. It does not compile SwiftUI or WebKit. Do not read a Linux success as a Mac build.

## Configuration

Compose's page address, used when `BLINKY_SUPERVISE=0`, is resolved in this order (first valid `http` or `https` URL with a host wins):

1. Environment variable `BLINKY_COMPOSE_URL` (this launch only).
2. UserDefaults key `composeBaseURL` (Settings, or `defaults write`).
3. Info.plist key `BlinkyComposeBaseURL` (shipped default).
4. Hard-coded fallback `http://127.0.0.1:3000` in `ComposeURL.fallbackString`.

Keep the Info.plist value and `ComposeURL.fallbackString` the same.

While supervision is on (the default), the window loads `http://127.0.0.1:<Compose port>` for the process it started. The saved Compose URL does not retarget that window.

Stack overrides, environment then Settings, then the defaults in the table above:

| Environment | Settings key | Default |
| --- | --- | --- |
| `BLINKY_SUPPORT_DIR` | `blinkySupportDir` | `~/Library/Application Support/BlinkyBot` |
| `BLINKY_UI_PORT` | `blinkyUIPort` | `3000` |
| `BLINKY_ENGINE_PORT` | `blinkyEnginePort` | `3001` |
| `BLINKY_NODE` | `blinkyNodePath` | bundled node, else `PATH` |
| `BLINKY_ENGINE_CWD` | `blinkyEngineCWD` | bundled `runtime/engine`, else `<checkout>/apps/engine` |
| `BLINKY_UI_CWD` | `blinkyUICWD` | bundled `runtime/ui`, else `<checkout>/apps/ui` |
| `BLINKY_REPO_ROOT` | `blinkyRepoRoot` | walk up from the working directory and the source path |
| `BLINKY_SUPERVISE` | — | on |

Settings → Local stack saves the overrides. They apply the next time BlinkyBot opens. Empty fields clear the saved value.

```bash
defaults write bot.blinky.shell composeBaseURL "http://127.0.0.1:3050"
defaults delete bot.blinky.shell composeBaseURL
```

Bundle id: `bot.blinky.shell`. Settings is also in the app menu (Command-,). **Clear saved URL** removes the Compose URL override. An environment variable still wins while it is set.

`NSAllowsLocalNetworking` in Info.plist allows cleartext HTTP to the local machine (and the local network). Public https links Compose navigates to stay on the normal transport rules.

## What the window does

- On launch, starts the local stack, then loads Compose. The title is **BlinkyBot**. The subtitle is the page URL.
- A status line while the engine and Compose are starting.
- A banner with Retry when startup fails (missing Node, missing build, port in use, process exit, 30 second timeout).
- A banner with the load error and Reload when the page itself fails. Cancelled navigations are ignored.
- Unified toolbar: back, forward, reload, and a spinner while the page loads.
- `target="_blank"` and `window.open` load in the same view, so a Compose sign-in popup is not dropped.
- Cookies use the default `WKWebsiteDataStore`, so a Compose session survives relaunch of the shell.
- The user agent appends `BlinkyBot/<version>`, where `<version>` is `CFBundleShortVersionString`. The bundle script sets that from the root `VERSION` file. An Xcode Run uses `MARKETING_VERSION` in `project.yml`, which stays equal to `VERSION`.
- The web view is inspectable (Safari-style web inspector from the context menu, when WebKit inspection is allowed).
- Compose menu: Back (Command-[), Forward (Command-]), Reload (Command-R), Open configured URL (Command-Shift-R).
- Closing the last window quits the app and stops the children it started.

The coworker's screen viewer, when Compose shows one, talks to the engine at `RERUN_ENGINE_BROWSER_URL` (`http://127.0.0.1:3001`). The shell does not proxy that port. Phase 1 sets `RERUN_DESKTOP=off`, so that viewer stays off the install path.

## First launch

The first time the app opens, a native setup cover sits on top of Compose. It does not show the page address or the web toolbar. **Skip** and **Done** both record `blinkyOnboardingCompleted` in UserDefaults and the cover stays dismissed. Settings → Coding tools (编程工具 when the Mac language is Chinese) opens it again. `BLINKY_ONBOARDING=off` skips the cover. `BLINKY_ONBOARDING=always` shows it even after it was completed.

The cover lists Codex, Kimi, Grok, and ego(lite). A Finder launch does not inherit a login-shell `PATH`, so the lookup uses the process `PATH` and then Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), npm and pnpm global bins, `~/.local/bin`, Volta, bun, asdf, fnm, and nvm. `RERUN_CODEX_PATH`, `RERUN_KIMI_PATH`, and `RERUN_GROK_PATH` are used alone when they are set, same as the engine.

| Step | Ready | Needs a person | Not installed |
| --- | --- | --- | --- |
| Codex | `codex login status` exits 0, or `CODEX_HOME/auth.json` (default `~/.codex`) holds a token, or `CODEX_API_KEY` / `OPENAI_API_KEY` is set | Installed, and none of those. **Sign in in Terminal** runs `codex login` | `npm install -g @openai/codex` in Terminal when `npm` resolves, else `brew install --cask codex`, else a copyable installer |
| Kimi | A credential file under `KIMI_CODE_HOME` (default `~/.kimi-code/credentials`), or `config.toml` has `api_key` / `api_key_env` | Installed, and none of those. The button runs `kimi login`. A bare `KIMI_API_KEY` does not count | `npm install -g @moonshot-ai/kimi-code`, else `brew install kimi-code`, else a copyable installer |
| Grok | `GROK_HOME/auth.json` (default `~/.grok`) has a live `key`, or `XAI_API_KEY` is set | Installed, and none of those. The button runs `grok login` | `npm install -g @xai-official/grok` when `npm` resolves, else a copyable installer |
| ego(lite) | `EgoLiteDetection` reports `ego-browser` (the expanded PATH above, plus `~/.local/bin`) | `ego lite.app` is in `/Applications` or `~/Applications`, and `ego-browser` does not resolve. **Open ego(lite)** launches the app so its own setup can add the command | Download page `https://lite.ego.app/download` |

Install and sign-in open Terminal.app with the command. They are not run in the background. **Recheck** runs the probes again. Copy stays next to the command. Text follows the Mac language: Chinese when the preferred language starts with `zh`, English otherwise. `BLINKY_ONBOARDING_LANG=zh` and `BLINKY_ONBOARDING_APPEARANCE=dark` force a screenshot.

The list is `OnboardingCatalog.makeSteps` in `Sources/BlinkyOnboarding`. Replace a step by id, or append one. `OnboardingStepID.egoLite` is the browser step, and `evaluateEgoLite` is the built-in probe:

```swift
OnboardingCatalog.makeSteps = { signals in
    mergingOnboardingSteps(builtInOnboardingSteps(signals), replacements: [myStep])
}
```

Set that before the first recheck. The cover is `ShellRoot`, so the window contents and the menu bar stay in their own files.

## Phase 1 constraints

This directory is the Mac window and the process supervisor:

- A window that loads the local Compose URL. The install default is `http://127.0.0.1:3000`.
- Spawn of the engine on `127.0.0.1:3001` and Compose on `127.0.0.1:3000`, with data under Application Support and `BLINKY_LOCAL_AUTH=1`.
- About with the BlinkyBot name and AGPL-3.0.

Out of scope here:

- Rex
- Ego Browser
- BlinkyBot cloud auth, billing, or a second login client
- Starting Docker or Supabase

Local auth for the Phase 1 boot lives in the UI, behind `BLINKY_LOCAL_AUTH=1`. The window sets the flag. It does not add its own login client.

## App icon

The Phase 1 Mac app icon is the confirmed mascot (fluffy cream, lime sprout and ear tips, one eye winking). The asset catalog is `Resources/Assets.xcassets/AppIcon.appiconset`. [`project.yml`](project.yml) includes that catalog as a file source and sets `ASSETCATALOG_COMPILER_APPICON_NAME` to `AppIcon`, so the built BlinkyBot.app shows this icon. [`Info.plist`](Info.plist) sets `CFBundleIconName` to the same name.

## Layout

The distributable bundle command is [Scripts/bundle.sh](../../Scripts/bundle.sh) at the repository root. `MARKETING_VERSION` in `project.yml` matches the root `VERSION` file. `Info.plist` leaves `CFBundleShortVersionString` as `$(MARKETING_VERSION)`.

```
apps/mac-shell/
  Package.swift
  project.yml
  Info.plist
  Resources/Assets.xcassets/AppIcon.appiconset/   Phase 1 Mac app icon
  Sources/BlinkyComposeURL/ComposeURL.swift
  Sources/BlinkyLocalRuntime/   plan, ready checks, spawn, API key
  Sources/BlinkyOnboarding/     CLI and ego(lite) probes, copy, first-run flag
  Sources/BlinkyBot/            SwiftUI window, WKWebView, ProcessSupervisor, onboarding cover
  Tests/BlinkyComposeURLTests/
  Tests/BlinkyLocalRuntimeTests/
```

License: [AGPL-3.0-only](../../LICENSE), same as the rest of BlinkyBot (a fork of Rerun).
