# BlinkyBot Phase 1

Phase 1 is locked. It turns this fork into a local Mac agent hub without rewriting Rerun. The product name is **BlinkyBot**.

Upstream remains [rerun-build/rerun](https://github.com/rerun-build/rerun), licensed [AGPL-3.0](../LICENSE).

## In scope

- A **Mac-only desktop shell** that wraps the existing Compose UI (`apps/ui`, the board and chat started by `docker compose` or `pnpm dev:ui`).
- **Foreman, memory, and human-in-the-loop stay.** Those layers already live in the engine:
  - Foreman tools: `apps/engine/src/tools/builtin/foreman.ts`
  - Memory: `apps/engine/src/memory/` and `apps/engine/src/tools/builtin/memory.ts`
  - Approvals and questions: `apps/engine/src/tools/builtin/hitl.ts` (`ask_user`, `request_approval`, and the other HITL tools)
- **First runtimes are CLIs already on the Mac:**
  - Codex CLI
  - Kimi CLI
  - Grok CLI

  The engine already speaks to a Codex CLI provider (`apps/engine/src/runtime/loop.ts` and `ai-sdk-provider-codex-cli`). Phase 1 wires Codex, Kimi, and Grok through the same kind of adapter, in front of Foreman, instead of treating Rerun Cloud model routing as the primary path.

## Out of scope

Phase 1 does not build or depend on these. The code stays in the tree so later phases can use it. Nothing here is a request to delete it.

- **Rex** (not in this repository)
- **Ego Browser**, the coworker desktop and browser already in the engine (`apps/engine/src/desktop`, `apps/engine/src/tools/builtin/computer.ts`, Patchright)
- **Cloud Engine or Supabase as the primary deploy** (Rerun Cloud billing, the machine pool, and hosted auth stay behind `apps/ui/cloud/` and `apps/engine/src/cloud/`)
- **iOS, Windows, and Linux shells**

## Acceptance

Parallel agent branches merge into [`phase1/verify`](https://github.com/harrisliangsu/blinky-bot/tree/phase1/verify). See [CONTRIBUTING-BLINKY.md](../CONTRIBUTING-BLINKY.md).

## What this phase does not change yet

Package identifiers (`rerun`, `rerun-engine`, `@rerun/*`) stay, so pnpm filters and workspace links keep working. Most in-app copy still says Rerun where it names an upstream provider, Rerun Cloud, or a test fixture. The app title, install metadata, and default wordmark label say BlinkyBot.
