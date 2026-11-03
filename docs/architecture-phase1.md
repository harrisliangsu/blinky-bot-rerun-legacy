# BlinkyBot Phase 1 architecture

BlinkyBot Phase 1 is a Mac app that runs the Rerun intelligence layer on the same machine. Opening the app starts that layer. Docker is not in the path.

```text
BlinkyBot.app  (apps/mac-shell)
    |
    |  spawns on launch, binds loopback, stops on quit
    |
    +--> Compose UI   apps/ui, next start, 127.0.0.1:3000
    |                  local auth SQLite (one user)
    |
    +--> Engine       apps/engine, `rerun run`, 127.0.0.1:3001
    |                  data-dir under Application Support
    |
    +--> WKWebView loads http://127.0.0.1:3000
    |
Engine children, the CLI adapters:
    codex, kimi, grok, claude
```

Ports, the Application Support tree, the exact commands, and the auth contract are in [no-docker-runtime.md](no-docker-runtime.md).

## Mac app

A desktop app for Mac only (`apps/mac-shell`). It is the supervisor and the window. On launch it starts the local UI and the local engine, waits until the UI answers, and loads `http://127.0.0.1:3000`. On quit it stops the processes it started.

iOS, Windows, and Linux shells are later work. The app does not shell out to Docker.

The sources in `apps/mac-shell` are the SwiftUI window and the supervisor. They follow [no-docker-runtime.md](no-docker-runtime.md). Local auth is `apps/ui/lib/local-auth`. A checkout can still run the two Node processes by hand for development. That loop is not the install path.

## Compose UI

The Compose UI is the existing Next.js app in `apps/ui`: the board, coworker chat, and the screens where a person answers a Foreman question or an approval.

Phase 1 runs it as a local process bound to `127.0.0.1:3000`. The bundled app carries a built UI and a Node binary, and `next start` serves that build. The window embeds the page. It does not redraw the board, and it does not replace Compose with a second client.

`docker-compose.yml` still builds this app as the `app` service for the upstream server install. Phase 1 does not use that service.

## Engine

The engine is `apps/engine`, one process, started with `node dist/cli/bin.js run` (`rerun run`). It listens on `127.0.0.1:3001`. `RERUN_DATA_DIR` is `~/Library/Application Support/BlinkyBot/engine`.

That directory is the coworker store the engine already uses: files under `agents/<id>/` and `shared/`, plus libSQL at `rerun.db` (sessions, messages, the memory index, the agent index, run logs). The engine migrates it on start (`prepareDataDir` in `rerun run`). Phase 1 keeps that store. It does not put coworker files in Supabase.

`RERUN_DESKTOP=off` leaves the coworker desktop shut (`desktopEnabled()` in `apps/engine/src/config/env.ts`). Ego Browser stays in the tree and stays off this path.

## Local auth

Phase 1 uses **embedded single-user auth in its own SQLite file**, next to the engine data-dir:

`~/Library/Application Support/BlinkyBot/local-auth.sqlite`

One local user, one workspace, a session cookie on `http://127.0.0.1:3000`. No email code, no Supabase client, no `NEXT_PUBLIC_SUPABASE_URL`. The implementing PR's obligations are the contract in [no-docker-runtime.md](no-docker-runtime.md).

Supabase (a project on supabase.com, or `npx supabase start`) remains the database of the upstream Docker install. `npx supabase start` needs Docker, so it is the same upstream path. A later phase can offer that cloud account from the Mac app. Phase 1 does not start it and does not require it.

## Foreman

The Foreman is the Rerun coworker that interviews you, hires the team, and applies your rules while you are away. Its tools are registered from `apps/engine/src/tools/builtin/foreman.ts`. Memory writes and recall go through `apps/engine/src/memory/`. Human-in-the-loop stops (ask, approve, secret, sign-in, takeover) are `apps/engine/src/tools/builtin/hitl.ts`.

Phase 1 keeps this path. Coworkers still ask before they send, pay, or delete.

## CLI adapters

The first runtimes are local CLIs. The engine spawns them. The Mac app does not spawn them itself.

| Runtime | Phase 1 role |
| --- | --- |
| Codex CLI | First adapter. The engine already has a Codex provider in `apps/engine/src/runtime/loop.ts`. |
| Kimi CLI | Same adapter shape, second runtime. |
| Grok CLI | Same adapter shape, third runtime. |
| Claude Code | Already a Foreman provider. The local spawn flag includes it. |

Adapters sit under Foreman. They run the model turn. Foreman, memory, and HITL stay above them. Spawn argv, homes, and the gap between `runLocalCli` and a Foreman turn are in [cli-adapters-phase1.md](cli-adapters-phase1.md).

The app sets `RERUN_CLI_ADAPTERS=codex,kimi,grok,claude`. A missing CLI binary does not stop the UI or the engine. The person installs the CLIs they want (`codex`, `kimi`, `grok`, `claude` on `PATH`, or `RERUN_*_PATH`).

## What stays from Rerun

- Compose UI (`apps/ui`) and the design system (`packages/ui`)
- Foreman, memory, skills, schedules, and HITL in `apps/engine`
- The engine data-dir and its migration ladder
- Shared types in `packages/contracts`
- `docker-compose.yml`, the Dockerfiles, and the upstream self-host docs, for a Rerun server
- AGPL-3.0 and the Rerun trademark boundary in `TRADEMARK.md`

## Upstream server path

`docker-compose.yml` starts two containers: the Next.js app published on port 3000, and the engine published on port 3001, with Supabase outside the file. That is how upstream Rerun is self-hosted, and it is not the Phase 1 Mac install. The guide is [upstream-server.md](upstream-server.md).

Use that path to reproduce the upstream server, or to work on the Docker images. It is not how Phase 1 is installed on a Mac, and a Phase 1 change does not add a step that requires it.

The coworker desktop (`apps/engine/src/desktop`, the computer tools, Patchright) is the Ego Browser surface. It stays in the tree. Rex is out of scope and is not in this repository.
