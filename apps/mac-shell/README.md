# BlinkyBot Mac shell

Phase 1 native shell for **BlinkyBot**. It is a SwiftUI window with a `WKWebView` that loads **Rerun Compose** — the web app in [`apps/ui`](../ui) — from this Mac. It does not embed the engine, and it does not add Rex, Ego Browser, or a separate cloud account.

This tree was written on Linux. **It has not been built or launched as a Mac app.** A green `swift test` on Linux only covers URL selection. Build the `.app` on a Mac before treating the window as done.

## The URL the shell opens

Default: **`http://127.0.0.1:3000`**

That is the self-hosted web app, not the engine.

| How Compose is started | Open this in BlinkyBot | Do not open this |
| --- | --- | --- |
| `docker compose up -d --build` from the repo root | `http://127.0.0.1:3000` | Engine on `http://127.0.0.1:3001` |
| `pnpm dev:ui` (and `pnpm dev:engine` beside it) | `http://127.0.0.1:3050` | Engine on `http://127.0.0.1:3000` |

Why those ports:

- [`docker-compose.yml`](../../docker-compose.yml) publishes the `app` service as `${RERUN_APP_PORT:-3000}:3000`. [`.env.example`](../../.env.example) sets `RERUN_APP_PORT=3000`. Inside the image, [`apps/ui/Dockerfile`](../ui/Dockerfile) runs `next start` with `PORT=3000`.
- The engine container is published as `${RERUN_ENGINE_PORT:-3001}:3000`. From the Mac that is port **3001**. The shell never loads it.
- From source, [`apps/ui/package.json`](../ui/package.json) runs `next dev -p 3050` (`pnpm dev:ui`). [`CONTRIBUTING.md`](../../CONTRIBUTING.md) sets `NEXT_PUBLIC_APP_URL=http://localhost:3050`. In that layout the engine takes port 3000, so the shell's default would show the engine API until you point it at **3050**.

Check which process owns the port before the first launch:

```bash
curl -sS http://127.0.0.1:3000/api/version
```

A small JSON body is the web app (Compose). If you instead get the engine (`curl -sS http://127.0.0.1:3000/health` → `{"status":"ok",...}`), you are on the dev engine. Set the shell to `http://127.0.0.1:3050`.

`127.0.0.1` is intentional. `localhost` can resolve to IPv6 `::1` first, and Docker's published port is IPv4, so the web view would sit on a connection error. The page itself may still redirect to whatever `NEXT_PUBLIC_APP_URL` was when the app was built (`http://localhost:3000` in `.env.example`, baked in at image build). If the UI loads and sign-in then jumps to a host that does not connect, set `NEXT_PUBLIC_APP_URL` to the same origin the shell opens and rebuild the `app` image, or set the shell to `http://localhost:3000` in Settings.

## Run Compose, then open the shell

### Self-host (matches the default URL)

From the repository root, follow [INSTALL.md](../../INSTALL.md) or the root [README](../../README.md): Docker, Node 22, a Supabase project, then:

```bash
cp .env.example .env
node scripts/self-host-check.mjs
npx supabase link --project-ref <your-project-ref> && npx supabase db push --include-seed
docker compose up -d --build
curl -sS http://127.0.0.1:3000/api/version
```

Leave that stack running. Build and run BlinkyBot (below). The window loads `http://127.0.0.1:3000`. A launch from Finder or the Dock does not inherit variables from your terminal; the default does not need one.

### Dev servers (port 3050)

```bash
pnpm install
npx supabase start
pnpm --filter @rerun/contracts build
pnpm dev:engine    # http://127.0.0.1:3000  — engine, not the window
pnpm dev:ui        # http://127.0.0.1:3050  — this is Compose
```

Fill `apps/ui/.env` as in [CONTRIBUTING.md](../../CONTRIBUTING.md). Point the shell at port 3050 before expecting the UI. Either set `http://127.0.0.1:3050` in BlinkyBot → Settings and click **Save and reload**, or for one launch from Terminal (macOS 14 `open` forwards `--env` into the app):

```bash
open -n --env BLINKY_COMPOSE_URL=http://127.0.0.1:3050 /path/to/BlinkyBot.app
```

`-n` starts a new instance. `open` will not change the environment of a BlinkyBot that is already running.

The Xcode product lives under DerivedData (Product → Show Build Folder in Finder), not in this directory. You can also set `BLINKY_COMPOSE_URL` on the BlinkyBot scheme (Run → Arguments → Environment Variables). `swift run` inherits the variable from the shell; the XcodeGen `.app` is still the launch path that carries `Info.plist`.

Signing in still happens inside the web view (Compose's own Supabase session). Mailpit for local codes is `http://localhost:54424`.

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

In Xcode, select the **BlinkyBot** scheme and a development team (Signing & Capabilities). App Sandbox is off on purpose: nothing in this target enables it, so the view can call a Compose process on `127.0.0.1`. Hardened runtime is on. Press Run.

In the running app, BlinkyBot → About BlinkyBot shows the name **BlinkyBot** and the AGPL-3.0 notice. The copyright line comes from `NSHumanReadableCopyright` in [`Info.plist`](Info.plist).

If the window is blank and the banner says the server could not be reached, Compose is not listening on the configured URL. Start it, then Reload.

### Swift Package Manager

From `apps/mac-shell`, with the Xcode toolchain (`xcode-select -p`):

```bash
swift test     # Compose URL selection only. No window.
swift build    # compiles the executable on a Mac
swift run      # secondary path
```

`swift run` does **not** embed [`Info.plist`](Info.plist). App Transport Security can block `http://127.0.0.1` for that bare binary, and the About copyright string will not match the bundled app. Use the XcodeGen `.app` for a real launch. `swift test` is still worth running: it locks the default to `http://127.0.0.1:3000` and the override order below.

On Linux, `swift test` compiles the URL library and a stub executable that exits with a message. It does not compile SwiftUI or WebKit. Do not read a Linux success as a Mac build.

## Configuration

The address is resolved in this order (first valid `http` or `https` URL with a host wins):

1. Environment variable `BLINKY_COMPOSE_URL` (this launch only).
2. UserDefaults key `composeBaseURL` (Settings, or `defaults write`).
3. Info.plist key `BlinkyComposeBaseURL` (shipped default).
4. Hard-coded fallback `http://127.0.0.1:3000` in `ComposeURL.fallbackString`.

Keep the Info.plist value and `ComposeURL.fallbackString` the same.

```bash
defaults write bot.blinky.shell composeBaseURL "http://127.0.0.1:3050"
defaults delete bot.blinky.shell composeBaseURL
```

Bundle id: `bot.blinky.shell`. Settings is also in the app menu (Command-,). **Clear saved URL** removes the UserDefaults entry and resolves again. An environment variable still wins while it is set.

`NSAllowsLocalNetworking` in Info.plist allows cleartext HTTP to the local machine (and the local network). Public https links Compose navigates to (sign-in, OAuth) stay on the normal transport rules. The shell does not add an App Transport Security exception for arbitrary internet HTTP.

## What the window does

- Unified toolbar: back, forward, reload, and a spinner while the page loads. The title is **BlinkyBot**. The subtitle is the page URL.
- A banner with the load error and Reload when the host refuses the connection or the load fails. Cancelled navigations are ignored.
- `target="_blank"` and `window.open` load in the same view, so a Compose sign-in popup is not dropped.
- Cookies use the default `WKWebsiteDataStore`, so a Compose session survives relaunch of the shell.
- The user agent appends `BlinkyBot/0.1.0`.
- The web view is inspectable (Safari-style web inspector from the context menu, when WebKit inspection is allowed).
- Compose menu: Back (Command-[), Forward (Command-]), Reload (Command-R), Open configured URL (Command-Shift-R) which loads the resolved base URL again.

The coworker's screen viewer, when Compose shows one, is still the page talking to the engine (docker: `http://localhost:3001`, `RERUN_ENGINE_BROWSER_URL`). The shell does not proxy that port. Both the web app and the published engine port have to be reachable from this Mac.

## Phase 1 constraints

In this directory, and only this:

- A Mac window that loads a configurable local Compose URL.
- About with the BlinkyBot name and AGPL-3.0.
- Notes for building that window on a Mac.

Not in this change:

- Rex
- Ego Browser
- BlinkyBot cloud auth, billing, or a second login client
- Changes to Compose (`apps/ui`), the engine, or Docker

Compose's own sign-in stays inside the web view. That is the existing app, unmodified.

## Layout

```
apps/mac-shell/
  Package.swift          swift test / swift build
  project.yml            xcodegen generate
  Info.plist             default URL, ATS, AGPL copyright
  Sources/BlinkyComposeURL/ComposeURL.swift
  Sources/BlinkyBot/     SwiftUI app and WKWebView
  Tests/BlinkyComposeURLTests/
```

License: [AGPL-3.0-only](../../LICENSE), same as the rest of BlinkyBot (a fork of Rerun).
