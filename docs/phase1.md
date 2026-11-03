# BlinkyBot Phase 1

Phase 1 is locked. It turns this fork into a local Mac agent hub that installs and opens, without rewriting Rerun. The product name is **BlinkyBot**.

Upstream remains [rerun-build/rerun](https://github.com/rerun-build/rerun), licensed [AGPL-3.0](../LICENSE).

## Install promise

Phase 1 on a Mac is the same shape as a normal Mac app: install BlinkyBot, open it, and it runs.

The app starts its own processes on `127.0.0.1`. The person does not install Docker, does not run `docker compose`, and does not create a Supabase project. Supabase and the cloud engine stay available later, and they stay the upstream server path. They are not the Phase 1 install.

The process model, ports, Application Support layout, and the local-auth contract are in [no-docker-runtime.md](no-docker-runtime.md). The stack sketch is [architecture-phase1.md](architecture-phase1.md).

## In scope

- A **Mac-only desktop app** (`apps/mac-shell`) that supervises a local engine and the local Compose UI, then shows that UI.
- **Compose UI stays** (`apps/ui`): the board, coworker chat, and the screens where a person answers a Foreman question or an approval. Phase 1 runs it as a local process the app starts. It does not redraw the board.
- **Foreman, memory, and human-in-the-loop stay.** Those layers already live in the engine:
  - Foreman tools: `apps/engine/src/tools/builtin/foreman.ts`
  - Memory: `apps/engine/src/memory/` and `apps/engine/src/tools/builtin/memory.ts`
  - Approvals and questions: `apps/engine/src/tools/builtin/hitl.ts` (`ask_user`, `request_approval`, and the other HITL tools)
- **A local data plane.** Coworker state stays in the engine data-dir (files plus libSQL `rerun.db`). The account is one local user in a separate SQLite file. Details and the implementing-PR contract are in [no-docker-runtime.md](no-docker-runtime.md).
- **First runtimes are CLIs already on the Mac:**
  - Codex CLI
  - Kimi CLI
  - Grok CLI

  Claude Code is already a Foreman provider and stays on the same machine. The engine speaks to a Codex CLI provider (`apps/engine/src/runtime/loop.ts` and `ai-sdk-provider-codex-cli`). Phase 1 wires Codex, Kimi, and Grok through the same kind of adapter, in front of Foreman. The adapter notes are [cli-adapters-phase1.md](cli-adapters-phase1.md).

## Out of scope

Phase 1 does not build or depend on these. The code stays in the tree so later phases, and the upstream server install, can use it. Nothing here is a request to delete it.

- **Docker as an install requirement.** `docker-compose.yml`, the Dockerfiles, and `apps/docs/self-host/` stay. They are the upstream Rerun self-host and a developer reproduction of that server. The Phase 1 Mac path does not start them.
- **Rex** (not in this repository)
- **Ego Browser**, the coworker desktop and browser already in the engine (`apps/engine/src/desktop`, `apps/engine/src/tools/builtin/computer.ts`, Patchright). The Mac app sets `RERUN_DESKTOP=off`.
- **Supabase, Rerun Cloud, or a hosted engine as the primary deploy.** Billing, the machine pool, and hosted auth stay behind `apps/ui/cloud/` and `apps/engine/src/cloud/`. A later phase can point the same app at them. Phase 1 boots without them.
- **iOS, Windows, and Linux shells**

## Acceptance

Parallel agent branches merge into [`phase1/verify`](https://github.com/harrisliangsu/blinky-bot/tree/phase1/verify). See [CONTRIBUTING-BLINKY.md](../CONTRIBUTING-BLINKY.md).

A Mac install artifact is cut by tagging `v*` on a commit whose `VERSION` matches. The flow is [releasing.md](releasing.md).

A change that makes the Mac app require Docker, a Supabase project, or `npx supabase start` misses this phase.

## What this phase does not change yet

Package identifiers (`rerun`, `rerun-engine`, `@rerun/*`) stay, so pnpm filters and workspace links keep working. Most in-app copy still says Rerun where it names an upstream provider, Rerun Cloud, or a test fixture. The app title, install metadata, and default wordmark label say BlinkyBot.

The window in `apps/mac-shell` loads `http://127.0.0.1:3000` and spawns the engine and the UI as specified in [no-docker-runtime.md](no-docker-runtime.md). It sets `BLINKY_LOCAL_AUTH=1`. That boot is implemented in `apps/ui/lib/local-auth`.
