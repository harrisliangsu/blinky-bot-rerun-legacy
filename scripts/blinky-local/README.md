# BlinkyBot local runtime

Phase 1 starts the engine and Compose UI as two Node processes. Docker is not used, and a Supabase project is not used.

This is the checkout supervisor for [docs/no-docker-runtime.md](../../docs/no-docker-runtime.md). The Mac `.app` still does not spawn these processes. The flags, ports, and environment match that contract.

## Ports and commands

| Process | Command | Ready |
| --- | --- | --- |
| Engine | `node dist/cli/bin.js run` in `apps/engine` | `GET http://127.0.0.1:3001/health` |
| UI | `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000` in `apps/ui` | `GET http://127.0.0.1:3000/api/version` |

The UI bind matches the Mac shell default (`http://127.0.0.1:3000`). The engine is the other port. `pnpm dev:engine` and `pnpm dev:ui` stay the hot-reload loop (engine 3000, UI 3050).

## Data

On macOS the directory is `~/Library/Application Support/BlinkyBot/`, the same place the Mac app uses. On Linux and other systems it is `~/.blinkybot/`. `BLINKY_SUPPORT_DIR` overrides either one, matching the Mac shell. The files inside match the contract: `engine/` (`RERUN_DATA_DIR`), `local-auth.sqlite`, `engine-api-key` (mode `0600`), `run/*.pid`, and `logs/*.log`. A bare `rerun run` still uses `~/.rerun`. This supervisor always sets `RERUN_DATA_DIR`.

`BLINKY_UI_PORT` and `BLINKY_ENGINE_PORT` default to 3000 and 3001. They cannot be the same port.

## Auth

`start` passes `BLINKY_LOCAL_AUTH=1` and `BLINKY_LOCAL_AUTH_DB` (the `local-auth.sqlite` file in the data directory). That is the switch already implemented in `apps/ui/lib/local-auth`. Supabase variables, `OPENROUTER_API_KEY`, `RERUN_PAIR_TOKEN`, and `RERUN_HUB_URL` are removed from the child environment, the same way the Mac shell does it. The first request creates one local user (`You`), one workspace (`BlinkyBot`), and a `blinky_session` cookie.

`build` sets `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` so the UI bundle matches the shell. It also exports `BLINKY_LOCAL_AUTH=1` for that build.

## Commands

From the repository root, with Node 22 and pnpm:

```bash
pnpm install
node scripts/blinky-local/blinky-local.mjs build
node scripts/blinky-local/blinky-local.mjs start
node scripts/blinky-local/blinky-local.mjs status
node scripts/blinky-local/blinky-local.mjs stop
node scripts/blinky-local/blinky-local.mjs dry-run --json
```

`build` runs `pnpm --filter @rerun/contracts build`, `pnpm --filter rerun-engine build`, and `pnpm --filter rerun build` with `BLINKY_LOCAL_AUTH=1`. `start` does not run Docker. `dry-run` prints the spawn plan and does not create the data directory. `pnpm local -- start` is the same entry.

`start` adopts a pid that is still alive and whose ready URL returns 200. If the port belongs to something else, it leaves that process alone and exits non-zero. `stop` sends `SIGTERM`, waits 5 seconds, then `SIGKILL`.

Wiring checks:

```bash
pnpm local:check
```
