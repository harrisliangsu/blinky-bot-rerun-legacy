# BlinkyBot

**BlinkyBot** is a local-first agent hub for Mac. It is a public fork of [Rerun](https://github.com/rerun-build/rerun) (AGPL-3.0). Phase 1 keeps Rerun's Compose board and the Foreman, memory, and human-in-the-loop layer, and points the first runtimes at CLIs on your machine.

This repository is the open source build of Rerun, republished here as BlinkyBot. The Rerun name, logo, and coworker characters remain trademarks of Rerun. BlinkyBot is not endorsed by Rerun. See [TRADEMARK.md](TRADEMARK.md).

## Phase 1

Locked scope lives in [docs/phase1.md](docs/phase1.md). The shape of the stack lives in [docs/architecture-phase1.md](docs/architecture-phase1.md).

Phase 1 is a Mac desktop shell around the existing Compose UI, with Foreman, memory, and approvals kept, and Codex CLI, Kimi CLI, and Grok CLI as the first runtimes. Rex, Ego Browser, a cloud Engine or Supabase-as-primary deploy, and iOS, Windows, and Linux shells are out of scope. The engine, the coworker desktop, and the cloud modules stay in the tree. Phase 1 does not delete them. Rex is not in this repository.

Parallel work merges into `phase1/verify` for acceptance. See [CONTRIBUTING-BLINKY.md](CONTRIBUTING-BLINKY.md). Upstream contribution rules remain in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU Affero General Public License v3.0](LICENSE). You can run, modify, and host this code. If you host a modified version for other people, you publish those changes under the same license.

Upstream: [rerun-build/rerun](https://github.com/rerun-build/rerun). BlinkyBot attributes that project and keeps its license. Package names such as `@rerun/*` and `rerun-engine` are still the upstream identifiers so the monorepo builds unchanged.

## Run Compose locally

The Compose stack is the upstream self-host install: the Next.js app (`apps/ui`) and the engine (`apps/engine`) in [docker-compose.yml](docker-compose.yml). The full walkthrough, including Supabase on your own machine, is the upstream guide: [docs.rerun.build/self-host](https://docs.rerun.build/self-host) (source in `apps/docs/self-host/install.mdx`).

You need Docker, Node.js 22, and a Supabase project (a free project on [supabase.com](https://supabase.com) works).

```bash
git clone https://github.com/harrisliangsu/blinky-bot.git && cd blinky-bot
cp .env.example .env
node scripts/self-host-check.mjs
npx supabase link --project-ref <your-project-ref> && npx supabase db push --include-seed
docker compose up -d --build
```

Then open http://localhost:3000.

To run from source instead of Compose, follow [CONTRIBUTING.md](CONTRIBUTING.md): local Supabase, `pnpm dev:engine` on port 3000, and `pnpm dev:ui` on port 3050.

Phase 1 still boots this stack. The Mac shell and the CLI adapters are the work that lands on `phase1/verify`. They are not in this bootstrap.

## 中文说明

BlinkyBot 是 [Rerun](https://github.com/rerun-build/rerun) 的公开分支（AGPL-3.0），目标是跑在 Mac 上的本地智能体中枢。第一阶段保留 Compose 界面，以及 Foreman、记忆和人工确认（HITL），并把 Codex CLI、Kimi CLI、Grok CLI 作为首批运行时。Rex、Ego Browser、以云端 Engine 或 Supabase 为主的部署，以及 iOS、Windows、Linux 外壳不在第一阶段范围内。引擎、同事桌面和云模块先留在仓库里，本阶段不把它们当主路径。Rex 目前不在这个仓库里。并行分支合并进 `phase1/verify` 做验收。Rerun 的名称与标识仍属于上游，本项目不声称获得 Rerun 背书。
