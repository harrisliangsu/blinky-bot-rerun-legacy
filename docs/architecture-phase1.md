# BlinkyBot Phase 1 architecture

BlinkyBot Phase 1 is a thin local shell on top of the Rerun intelligence layer. It does not replace that layer in this bootstrap.

```text
Mac shell
    |
    v
Compose UI  (apps/ui: board, chat, approvals)
    |
    v
Foreman     (apps/engine: plans the team, memory, HITL)
    |
    v
CLI adapters  (Codex CLI, Kimi CLI, Grok CLI)
```

## Mac shell

A desktop shell for Mac only. It opens the Compose UI and keeps the process on the machine. iOS, Windows, and Linux shells are later work. This repository does not contain that shell yet.

## Compose UI

The Compose UI is the existing Next.js app in `apps/ui`: the board, coworker chat, and the screens where a person answers a Foreman question or an approval. `docker-compose.yml` builds it as the `app` service. From source it is `pnpm dev:ui`.

Phase 1 wraps this app. It does not redraw the board.

## Foreman

The Foreman is the Rerun coworker that interviews you, hires the team, and applies your rules while you are away. Its tools are registered from `apps/engine/src/tools/builtin/foreman.ts`. Memory writes and recall go through `apps/engine/src/memory/`. Human-in-the-loop stops (ask, approve, secret, sign-in, takeover) are `apps/engine/src/tools/builtin/hitl.ts`.

Phase 1 keeps this path. Coworkers still ask before they send, pay, or delete.

## CLI adapters

The first runtimes are local CLIs:

| Runtime | Phase 1 role |
| --- | --- |
| Codex CLI | First adapter. The engine already has a Codex provider in `apps/engine/src/runtime/loop.ts`. |
| Kimi CLI | Same adapter shape, second runtime. |
| Grok CLI | Same adapter shape, third runtime. |

Adapters sit under Foreman. They run the model turn. Foreman, memory, and HITL stay above them.

## What stays from Rerun

- Compose UI (`apps/ui`) and the design system (`packages/ui`)
- Foreman, memory, skills, schedules, and HITL in `apps/engine`
- Shared types in `packages/contracts`
- The Compose file and the self-host install documented upstream
- AGPL-3.0 and the Rerun trademark boundary in `TRADEMARK.md`

## What Phase 1 replaces later

The current data plane is still Rerun's: Supabase for auth, database, and realtime, and `apps/engine` as the machine that runs coworkers, with cloud seams in `apps/ui/cloud/` and `apps/engine/src/cloud/`.

A later phase puts a **local data plane** in that role: local auth, local storage, and a local engine process, with the CLI adapters as the runtimes. Phase 1 does not do that swap. Cloud Engine and Supabase-as-primary are out of scope, and they remain the way Compose boots today.

The coworker desktop (`apps/engine/src/desktop`, the computer tools, Patchright) is the Ego Browser surface. It stays in the tree, and the Phase 1 shell ignores it. Rex is out of scope and is not in this repository. The Mac shell talks to Compose, Foreman, and the three CLIs.
