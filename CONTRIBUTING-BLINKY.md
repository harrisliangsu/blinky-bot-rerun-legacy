# Contributing to BlinkyBot

BlinkyBot is a fork of [Rerun](https://github.com/rerun-build/rerun). Upstream rules for running the app from source are in [CONTRIBUTING.md](CONTRIBUTING.md). This page is only the fork's branch rule.

The code is [AGPL-3.0](LICENSE). Keep that license and the upstream attribution. The name Rerun, the Rerun logo, and the coworker characters stay trademarks of Rerun ([TRADEMARK.md](TRADEMARK.md)). Call the product BlinkyBot.

## Where branches land

Phase 1 work from parallel agents merges into **`phase1/verify`** for acceptance.

- Open the feature branch from current `main` unless the task says otherwise.
- Target `phase1/verify` when the change is Phase 1 product work (Mac app, local engine and UI supervision, local auth, Foreman, memory, HITL, Codex CLI, Kimi CLI, Grok CLI).
- `main` receives the bootstrap and anything the maintainers accept after `phase1/verify` is green.
- Leave the engine, the coworker desktop, `docker-compose.yml`, and the cloud modules in place. Docker and Supabase stay the upstream server install. The Phase 1 Mac install does not require them. Document what Phase 1 ignores in [docs/phase1.md](docs/phase1.md). Do not delete them in a drive-by.

Scope and the stack sketch: [docs/phase1.md](docs/phase1.md), [docs/architecture-phase1.md](docs/architecture-phase1.md), [docs/no-docker-runtime.md](docs/no-docker-runtime.md).
