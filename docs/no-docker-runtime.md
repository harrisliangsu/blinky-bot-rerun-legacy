# Phase 1 local runtime (no Docker)

This is the Phase 1 install contract. BlinkyBot on a Mac installs and opens. The app starts a local engine and the local Compose UI, then loads the UI. Docker is not required, and a Supabase project is not required.

`docker-compose.yml` remains in the tree for the upstream Rerun server install. The Phase 1 Mac path does not invoke it.

The window sources live in `apps/mac-shell`. They load `http://127.0.0.1:3000` and do not yet spawn the processes below. The PR that adds supervision and local auth implements this file. Until that PR lands, a developer can start the same two Node processes from a checkout. That is a dev loop. It is not the install, and it still does not use Docker.

## Process model

```text
BlinkyBot.app
    |
    |-- node  …/runtime/engine/dist/cli/bin.js run     127.0.0.1:3001
    |       children: codex | kimi | grok | claude
    |
    |-- node  …/runtime/ui/node_modules/next/dist/bin/next start
    |         -H 127.0.0.1 -p 3000                     127.0.0.1:3000
    |
    +-- WKWebView  http://127.0.0.1:3000
```

One Mac app. Two long-lived children. CLI adapters are grandchildren of the app, spawned by the engine (`runLocalCli` and the existing Foreman providers). Supabase is not a process.

Quitting BlinkyBot stops the engine and the UI that this launch started. Schedules run while the app is open. A later phase can add a login item. Phase 1 does not leave an engine behind after quit.

## What the app bundle contains

The shipping `.app` carries its own Node and the built servers, so the person does not install Node, pnpm, or Docker.

```text
BlinkyBot.app/Contents/MacOS/BlinkyBot
BlinkyBot.app/Contents/Resources/runtime/node/bin/node
BlinkyBot.app/Contents/Resources/runtime/engine/     built rerun-engine (dist/, assets/)
BlinkyBot.app/Contents/Resources/runtime/ui/         next build (.next/, the files next start needs)
```

The engine entry is the `rerun` bin from `apps/engine/package.json`: `node dist/cli/bin.js run`. The UI entry is `next start` from `apps/ui` (`"start": "next start"`).

A developer checkout may use system Node 22 instead of the bundled binary. The flags, ports, and environment below stay the same. Build first (`pnpm --filter rerun-engine build` and `pnpm --filter rerun build`), then start with those env vars. `pnpm dev:engine` and `pnpm dev:ui` remain the hot-reload loop (engine on 3000, UI on 3050, per [CONTRIBUTING.md](../CONTRIBUTING.md)). Point the shell at `http://127.0.0.1:3050` for that loop only. The bundled app always uses 3000 and 3001.

## Commands the app starts

Working directories are the bundled `runtime/engine` and `runtime/ui`. The executable is the bundled `node`. The app passes the environment in the spawn call. It does not read a repo `.env`, and it does not pass Supabase variables.

Engine:

```bash
node dist/cli/bin.js run
```

| Variable | Value |
| --- | --- |
| `RERUN_DATA_DIR` | `~/Library/Application Support/BlinkyBot/engine` |
| `RERUN_HOST` | `127.0.0.1` |
| `RERUN_PORT` | `3001` |
| `RERUN_API_KEY` | the key file below |
| `RERUN_HUB_BASE_URL` | `http://127.0.0.1:3000` |
| `RERUN_CLI_ADAPTERS` | `codex,kimi,grok,claude` |
| `RERUN_DESKTOP` | `off` |
| `RERUN_LOG_LEVEL` | `info` |

`RERUN_HOST` is set because the engine default is `0.0.0.0` (`apps/engine/src/config/env.ts`). Phase 1 binds loopback.

`RERUN_PAIR_TOKEN` and `RERUN_HUB_URL` stay unset. Those start the self-host pairing dance against `POST /api/engines/pair`. The supervised engine is already the workspace engine, with `RERUN_API_KEY` and `RERUN_HUB_BASE_URL` set directly, the same split `docker-compose.yml` uses for its first engine (`RERUN_API_KEY` on the engine, `RERUN_ENGINE_API_KEY` on the app).

UI:

```bash
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
```

That is the `CMD` in `apps/ui/Dockerfile` (`node node_modules/next/dist/bin/next start`), plus `-H` and `-p` so the Mac app binds loopback instead of every interface. The bundled `runtime/ui` tree is that image's `/app/apps/ui` layout, including `node_modules/next`.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOSTNAME` | `127.0.0.1` |
| `PORT` | `3000` |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3000` (also baked into the bundled UI build) |
| `RERUN_ENGINE_URL` | `http://127.0.0.1:3001` |
| `RERUN_ENGINE_BROWSER_URL` | `http://127.0.0.1:3001` |
| `RERUN_ENGINE_API_KEY` | the same key as `RERUN_API_KEY` |
| `BLINKY_LOCAL_AUTH` | `1` |
| `BLINKY_LOCAL_AUTH_DB` | `~/Library/Application Support/BlinkyBot/local-auth.sqlite` |

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` are unset. With `BLINKY_LOCAL_AUTH=1` the UI boots without them.

`OPENROUTER_API_KEY` is unset. The app still starts. Codex and Claude turns use the Foreman providers already in `resolveModel`. Kimi and Grok spawn when `RERUN_CLI_ADAPTERS` includes them. Streaming Kimi and Grok into a Foreman turn is the gap recorded in [cli-adapters-phase1.md](cli-adapters-phase1.md). A missing `codex`, `kimi`, `grok`, or `claude` binary does not fail launch.

## Ports

Loopback only. These match the shell default and the ports `docker-compose.yml` publishes, so the window URL stays `http://127.0.0.1:3000`.

| Process | Bind | Ready when |
| --- | --- | --- |
| Compose UI | `127.0.0.1:3000` | `GET /api/version` returns 200 and JSON (`{"buildSha":...}`, `apps/ui/app/api/version/route.ts`) |
| Engine | `127.0.0.1:3001` | `GET /health` returns 200 and `{"status":"ok",...}` (`apps/engine/src/http/routes/health.ts`) |
| Supabase | not started |  |

`127.0.0.1` is deliberate. `localhost` can resolve to IPv6 `::1` first.

Nothing else listens. The app does not publish 3000 or 3001 on the LAN.

## Startup and shutdown

1. Create `~/Library/Application Support/BlinkyBot/` if it is missing.
2. If `engine-api-key` is missing, write 32 random bytes as hex, mode `0600`. If it exists, reuse it.
3. Start the engine, then the UI.
4. Poll both ready URLs until both return HTTP 200, or 30 seconds pass.
5. Load `http://127.0.0.1:3000`.

Pid files `run/engine.pid` and `run/ui.pid` record the children. On a later launch, if the pid is alive and the ready URL answers, the app adopts that process. If the pid is dead, it starts a new one. If the port is taken by a process the app did not spawn, the app does not kill it. The window shows the existing unreachable banner.

On quit (last window closed, or the app terminates): `SIGTERM` to each child this app spawned, wait 5 seconds, then `SIGKILL` if it is still alive. Delete the pid files after the processes exit. CLI children die with the engine.

Stdout and stderr append to `logs/engine.log` and `logs/ui.log`.

`rerun run` may spawn a background `install-browser` when Chromium is missing (`installBrowserInBackground` in `apps/engine/src/cli/commands/update.ts`). That child is not a launch step. `RERUN_DESKTOP=off` skips the desktop install. Phase 1 does not ask the person to install Chromium, and a browser download must not block the window.

## Data directory

```text
~/Library/Application Support/BlinkyBot/
  engine/                      RERUN_DATA_DIR
    rerun.db                   libSQL: sessions, messages, memories index, agents index, runs
    agents/<id>/               SOUL.md, INSTALL.md, config.json, .env, workspace/, skills/, memory/
    shared/
    data-version.json
  local-auth.sqlite            the one local user, workspace, and session
  engine-api-key               mode 0600
  run/engine.pid
  run/ui.pid
  logs/engine.log
  logs/ui.log
```

The engine half is the data-dir documented in `apps/engine/README.md`. Credentials for coworkers stay there. The default `~/.rerun` is what a bare `rerun run` uses. The Mac app always sets `RERUN_DATA_DIR` to the `engine/` folder above, so a Phase 1 install does not write `~/.rerun`.

CLI login files stay where those CLIs already keep them (`~/.codex`, `~/.kimi-code`, `~/.grok`, `~/.claude`, or the home variable each CLI documents). Phase 1 does not move them into Application Support. The engine forwards the environment it was given; tokens stay off argv. See [cli-adapters-phase1.md](cli-adapters-phase1.md).

## Supabase in Phase 1

**Chosen approach: embedded minimal local auth in `local-auth.sqlite`, plus the engine's existing files and `rerun.db`.**

There is no Supabase process, no supabase.com project, and no `npx supabase start`. Those need either the network or Docker, and both are the upstream server path.

Coworker state (soul, memory, transcripts, schedules, skills, provider credentials) stays in the engine data-dir. The auth file only answers "who is this Mac user" and "which local engine is their workspace." It does not copy `rerun.db`.

The auth file is separate from `rerun.db` so the engine migration ladder (`DATA_DIR_MIGRATIONS`, `SYSTEM_DB_MIGRATIONS`, `SHARED_DB_MIGRATIONS`) does not gain account tables. An implementation that would rather store the local user inside the engine data-dir has to add a new numbered step at the end of that ladder, with a test from the previous version. It does not edit a shipped step. The behavior below still holds.

### Contract for the implementing PR

`BLINKY_LOCAL_AUTH=1` is the switch. When it is set:

- `apps/ui/supabase/client.ts`, `server.ts`, `middleware.ts`, and `serviceRole.ts` are not called. A missing `NEXT_PUBLIC_SUPABASE_URL` does not crash boot.
- No `supabase.channel` subscription. Live board updates come from the engine HTTP API on `127.0.0.1:3001`, or from polling that API. They do not come from Supabase Realtime.
- `claimPoolEngine` in `apps/ui/cloud/engines.ts` does not insert into `engine_pool`. It returns the supervised engine: `{ ok: true, instance: { id: "local", engineHost: RERUN_ENGINE_URL, engineApiKey: RERUN_ENGINE_API_KEY } }`.

Schema the PR owns (created on first open of `BLINKY_LOCAL_AUTH_DB`):

| Table | Columns | Phase 1 contents |
| --- | --- | --- |
| `local_user` | `id` text primary key, `display_name` text, `created_at` text | One row. `display_name` defaults to `You`. Inserted on first launch. |
| `local_workspace` | `id` integer primary key, `name` text, `engine_host` text, `engine_api_key` text | One row. `id` is `1`, `name` is `BlinkyBot`, `engine_host` is `http://127.0.0.1:3001`, `engine_api_key` matches the key file. |
| `local_session` | `token` text primary key, `user_id` text, `expires_at` text | The current cookie. `expires_at` is 30 days out and moves forward when the session is used. |

Session cookie: `blinky_session`, `HttpOnly`, `SameSite=Lax`, path `/`, on `127.0.0.1`. The origin is `http://127.0.0.1:3000`, so the cookie is not `Secure`.

First request with no user row creates the user, the workspace, and a session. The board's "who am I" and workspace reads resolve to those rows. Agent, session, and memory reads that the engine already serves go to `http://127.0.0.1:3001` with `Authorization: Bearer <RERUN_ENGINE_API_KEY>`.

Reads that exist for a multi-user cloud (invitations, billing, extra members, Supabase storage buckets) return empty on this path. Email sign-in, magic links, anonymous Supabase users, and OAuth are not on this path. Sign-out deletes the session row and the cookie. The next request creates a new session for the same `local_user`. There is no account switcher.

The upstream Docker path leaves `BLINKY_LOCAL_AUTH` unset and keeps today's Supabase clients. One UI codebase, two boots. The Mac bundle sets the flag. `docker compose` does not.

## What this file does not change

Dockerfiles, `docker-compose.yml`, and `apps/docs/self-host/` stay valid for upstream Rerun. `.env.example` stays the env file for that server install. The Mac app does not read it.
