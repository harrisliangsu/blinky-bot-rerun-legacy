# Building BlinkyBot.app

`Scripts/bundle.sh` is the Phase 1 bundle entry point. On a Mac it produces `build.noindex/BlinkyBot.app`: the Swift shell plus the local engine and Compose UI, so the app opens without Docker and without a Supabase project.

The layout is the one [docs/no-docker-runtime.md](../docs/no-docker-runtime.md) describes and `BlinkyLocalRuntime` resolves. The same command shape as blinky-mac `Scripts/bundle.sh`:

```bash
./Scripts/bundle.sh            # build.noindex/BlinkyBot.app
./Scripts/bundle.sh --zip      # and build.noindex/BlinkyBot-<version>.zip
./Scripts/bundle.sh --open     # reveal the app in Finder
./Scripts/bundle.sh --plan     # print the layout and stop
```

`--plan` works on Linux and in CI. It does not compile Swift. A full run on Linux stops with the reason and points here.

## What you need on the Mac

- macOS 14 or newer
- Xcode 15 or newer (`xcodebuild`)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) 2.38 or newer (`brew install xcodegen`)
- Node.js 22
- pnpm 8.15.4 (`corepack enable && corepack prepare pnpm@8.15.4 --activate`)

The script checks each of these and names the one that is missing.

The `.app` matches the architecture of that Mac. The Node binary copied into the app has to be a Mach-O built for the same machine. A Homebrew Node that links `/opt/homebrew` is refused, because that copy will not start on a Mac without Homebrew. Install the official Node 22 macOS tarball and point at it:

```bash
export BLINKY_NODE=/path/to/node-v22/bin/node
./Scripts/bundle.sh
```

`--allow-host-node` keeps a Homebrew Node when the app only has to open on the build machine.

`CODESIGN_IDENTITY` defaults to `-` (ad-hoc). Set it to a Developer ID when you are signing for someone else. `DEVELOPMENT_TEAM` is passed through to `xcodebuild` when it is set.

## What the script does

1. Read `VERSION` at the repository root (`0.1.0` today).
2. `pnpm install --frozen-lockfile`.
3. `node scripts/blinky-local/blinky-local.mjs build`, which builds `@rerun/contracts`, `rerun-engine`, and Compose with `BLINKY_LOCAL_AUTH=1` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`.
4. `pnpm --filter rerun-engine --prod deploy`, then copy `apps/engine/dist` and `apps/engine/assets` on top. `dist/` is gitignored, so deploy alone would drop it.
5. `pnpm --filter rerun --prod deploy`, then copy `apps/ui/.next`, `apps/ui/public`, and `apps/ui/next.config.ts`.
6. Copy Node to `Contents/Resources/runtime/node/bin/node`.
7. `xcodegen generate` and `xcodebuild -configuration Release` in `apps/mac-shell`.
8. Write `VERSION` into `CFBundleShortVersionString` and `CFBundleVersion`.
9. Refuse the bundle if any symlink under `runtime/` points outside the app.
10. Sign Mach-O files inside `runtime/` without the hardened runtime (Node's JIT), then sign the Swift executable with the hardened runtime.

`--skip-install` and `--skip-server-build` skip steps 2 and 3 when those outputs are already there. A missing `dist/cli/bin.js` or `.next/BUILD_ID` is still an error.

The ad-hoc signature lets the app launch on the build Mac. Gatekeeper still rejects an ad-hoc app downloaded from the internet. A Developer ID and notarisation are a later signing step. This script does not notarize.

## Layout inside the app

```text
build.noindex/BlinkyBot.app/Contents/MacOS/BlinkyBot
build.noindex/BlinkyBot.app/Contents/Info.plist
build.noindex/BlinkyBot.app/Contents/Resources/runtime/node/bin/node
build.noindex/BlinkyBot.app/Contents/Resources/runtime/engine/dist/cli/bin.js
build.noindex/BlinkyBot.app/Contents/Resources/runtime/engine/assets/
build.noindex/BlinkyBot.app/Contents/Resources/runtime/engine/node_modules/
build.noindex/BlinkyBot.app/Contents/Resources/runtime/ui/.next/
build.noindex/BlinkyBot.app/Contents/Resources/runtime/ui/public/
build.noindex/BlinkyBot.app/Contents/Resources/runtime/ui/next.config.ts
build.noindex/BlinkyBot.app/Contents/Resources/runtime/ui/node_modules/next/dist/bin/next
```

Working directories at launch are `runtime/engine` and `runtime/ui`. The commands are `node dist/cli/bin.js run` and `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`. Data stays in `~/Library/Application Support/BlinkyBot/`. The shell creates that directory. The bundle does not.

`build.noindex` is gitignored. The `.noindex` suffix keeps Spotlight from listing the build next to an installed copy. Leave the directory name as it is.

## Version

`VERSION` is one `major.minor.patch` line. These stay equal to it:

- `apps/mac-shell/project.yml` `MARKETING_VERSION` (what an Xcode Run shows)
- `apps/ui/package.json` `version`
- `apps/engine/package.json` `version`

The bundle script also passes `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` into `xcodebuild`, then rewrites both plist version keys from `VERSION`. The About window and the user agent read `CFBundleShortVersionString`.

`Scripts/plan.test.mjs` fails when those four disagree.

## CI

Ubuntu can check the plan and the helpers. It cannot upload a real `.app`.

```bash
pnpm bundle:check
./Scripts/bundle.sh --plan
```

`pnpm bundle:check` runs `Scripts/plan.test.mjs`. The GitHub `check` job runs it.

A Mac builder, after the toolchain above is installed:

```bash
./Scripts/bundle.sh --zip
```

The zip is `build.noindex/BlinkyBot-<version>.zip`, made with `ditto` so the bundle's layout survives unzip. Open `build.noindex/BlinkyBot.app`. The window stays on "Starting the local engine and Compose…" until `http://127.0.0.1:3000/api/version` and `http://127.0.0.1:3001/health` both answer.

Logs, if they do not: `~/Library/Application Support/BlinkyBot/logs/`.

## What this slice does not do

`pnpm deploy` of Compose is the production `node_modules` plus the `.next` build `next start` needs. It is not a Next.js `output: 'standalone'` trace. If a launch fails because a file is missing, the UI log names it. Fix the copy list in `Scripts/bundle.sh` and the matching paths in `Scripts/plan.mjs`.

There is no universal binary. Ship one `.app` per architecture, each with a Node binary of that architecture.

`docker compose` remains the upstream server install in [INSTALL.md](../INSTALL.md). Phase 1 Mac builds use this script.

## GitHub Release

A tag `v$(cat VERSION)` publishes the app. The workflow on `macos-14` runs:

```bash
./Scripts/bundle.sh --zip
./Scripts/dmg.sh --reuse
```

`--zip` writes `build.noindex/BlinkyBot-<version>.zip`. `dmg.sh --reuse` writes `build.noindex/BlinkyBot-<version>.dmg` from that same app (Applications alias and a bilingual Read Me) and does not build again. The hosted job sets `BLINKY_NODE` to the official Node 22 macOS tarball before `bundle.sh`, because the Actions Node is not the binary that ships.

Notes, the `VERSION` / changelog gate, and Sparkle as a follow-up are in [docs/releasing.md](../docs/releasing.md). `0.1.0` is the first version.
