# BlinkyBot

**BlinkyBot** is a local-first agent hub for Mac. It is a public fork of [Rerun](https://github.com/rerun-build/rerun) (AGPL-3.0). Phase 1 keeps Rerun's Compose board and the Foreman, memory, and human-in-the-loop layer, and points the first runtimes at CLIs on your machine.

This repository is the open source build of Rerun, republished here as BlinkyBot. The Rerun name, logo, and coworker characters remain trademarks of Rerun. BlinkyBot is not endorsed by Rerun. See [TRADEMARK.md](TRADEMARK.md).

## Phase 1

Locked scope lives in [docs/phase1.md](docs/phase1.md). The shape of the stack lives in [docs/architecture-phase1.md](docs/architecture-phase1.md).

Phase 1 installs like a Mac app: open BlinkyBot and it runs. The app starts a local engine and the local Compose UI on this machine, with Foreman, memory, and approvals kept, and Codex CLI, Kimi CLI, and Grok CLI as the first runtimes. Docker and Supabase are not required. The runtime contract is [docs/no-docker-runtime.md](docs/no-docker-runtime.md).

Rex, Ego Browser, a cloud Engine or Supabase-primary deploy, and iOS, Windows, and Linux shells are later. The engine, the coworker desktop, `docker-compose.yml`, and the cloud modules stay in the tree for the upstream server install. Phase 1 does not delete them, and the Mac install does not start them. Rex is not in this repository.

Parallel work merges into `phase1/verify` for acceptance. See [CONTRIBUTING-BLINKY.md](CONTRIBUTING-BLINKY.md). Upstream contribution rules remain in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU Affero General Public License v3.0](LICENSE). You can run, modify, and host this code. If you host a modified version for other people, you publish those changes under the same license.

Upstream: [rerun-build/rerun](https://github.com/rerun-build/rerun). BlinkyBot attributes that project and keeps its license. Package names such as `@rerun/*` and `rerun-engine` are still the upstream identifiers so the monorepo builds unchanged.

## Run BlinkyBot on a Mac

Install the app and open it. BlinkyBot starts the local engine (`127.0.0.1:3001`) and the Compose UI (`127.0.0.1:3000`), then shows the UI. Data lives in `~/Library/Application Support/BlinkyBot/`. You do not install Docker, and you do not create a Supabase project.

The Mac app in `apps/mac-shell` starts that pair and then loads the UI. From a checkout, without the window:

```bash
pnpm install
node scripts/blinky-local/blinky-local.mjs build
node scripts/blinky-local/blinky-local.mjs start
```

The UI listens on `http://127.0.0.1:3000` and the engine on `http://127.0.0.1:3001`, with `BLINKY_LOCAL_AUTH=1`. Data is `~/Library/Application Support/BlinkyBot` on macOS and `~/.blinkybot` elsewhere. Details: [scripts/blinky-local/README.md](scripts/blinky-local/README.md).

A Mac with Xcode builds the distributable app:

```bash
./Scripts/bundle.sh
```

That writes `build.noindex/BlinkyBot.app`. The `Contents/Resources/runtime` layout, the `VERSION` file, and the Linux `--plan` check are in [Scripts/README.md](Scripts/README.md).

The process model and the local-auth contract are [docs/no-docker-runtime.md](docs/no-docker-runtime.md). The Mac window sources are [apps/mac-shell/README.md](apps/mac-shell/README.md).

## Upstream server install (Docker)

[docker-compose.yml](docker-compose.yml) is the upstream Rerun self-host: the Next.js app (`apps/ui`) and the engine (`apps/engine`) in containers, with Supabase outside the file. It is how you reproduce a Rerun server. It is not the Phase 1 Mac install.

The walkthrough is the upstream guide: [docs.rerun.build/self-host](https://docs.rerun.build/self-host) (source in `apps/docs/self-host/install.mdx`). An assistant following that server install uses [INSTALL.md](INSTALL.md).

You need Docker, Node.js 22, and a Supabase project (a free project on [supabase.com](https://supabase.com) works).

```bash
git clone https://github.com/harrisliangsu/blinky-bot.git && cd blinky-bot
cp .env.example .env
node scripts/self-host-check.mjs
npx supabase link --project-ref <your-project-ref> && npx supabase db push --include-seed
docker compose up -d --build
```

Then open http://localhost:3000.

To work on the UI from source, follow [CONTRIBUTING.md](CONTRIBUTING.md): `pnpm dev:engine` and `pnpm dev:ui`. That contributor loop is separate from both the Mac app and this Compose file.

## 中文说明

BlinkyBot 是 [Rerun](https://github.com/rerun-build/rerun) 的公开分支（AGPL-3.0），目标是跑在 Mac 上的本地智能体中枢。第一阶段的安装方式是打开 Mac 应用：应用自己拉起本地 Engine 和本地 Compose 界面，不需要 Docker，也不需要 Supabase 项目。界面、Foreman、记忆和人工确认（HITL）保留，Codex CLI、Kimi CLI、Grok CLI 作为首批运行时。运行契约见 `docs/no-docker-runtime.md`。Rex、Ego Browser、以云端 Engine 或 Supabase 为主的部署，以及 iOS、Windows、Linux 外壳不在第一阶段范围内。`docker-compose.yml` 仍是上游 Rerun 的服务器安装方式，留在仓库里，Mac 安装路径不会启动它。Rex 目前不在这个仓库里。并行分支合并进 `phase1/verify` 做验收。Rerun 的名称与标识仍属于上游，本项目不声称获得 Rerun 背书。
