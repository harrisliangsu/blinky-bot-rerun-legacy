# Releasing BlinkyBot

Pushing a tag is the release. The tag publishes a GitHub Release of the Mac app. That is the Phase 1 install.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

`VERSION`, `CHANGELOG.md`, and `CHANGELOG.zh-CN.md` have to be committed on the commit you tag. The workflow stops before it builds when the tag and `VERSION` disagree, or when either changelog has no `##` section for that version.

The first Phase 1 version is `0.1.0`.

## Version

`VERSION` at the repository root is one `major.minor.patch` line. `Scripts/plan.mjs` keeps these equal to it:

- `apps/mac-shell/project.yml` `MARKETING_VERSION`
- `apps/ui/package.json` `version`
- `apps/engine/package.json` `version`

`./Scripts/bundle.sh` writes that version into `CFBundleShortVersionString` and `CFBundleVersion`. The tag is `v` plus the file: `v0.1.0`.

`pnpm bundle:check` fails when the four disagree. A suffix such as `0.1.0-beta.1` is not a valid `VERSION` line.

## Changelog

Write the entry before the tag, newest first, in both files:

- `CHANGELOG.md` — English
- `CHANGELOG.zh-CN.md` — Chinese

Same `## x.y.z` heading, same bullets, same order. The grammar is bullets, `**bold**`, `` `code` ``, and links. `Scripts/changelog.py` reads one entry. `Scripts/release-notes.py` builds the GitHub Release body, Chinese first, then English, including install steps and the AGPL notice.

Write what a person installing the app can see. Refactors, tests, and docs stay out.

```bash
python3 Scripts/changelog.py 0.1.0 >/dev/null
python3 Scripts/changelog.py 0.1.0 --zh >/dev/null
GITHUB_REPOSITORY=harrisliangsu/blinky-bot python3 Scripts/release-notes.py 0.1.0
python3 Scripts/release_test.py
pnpm bundle:check
./Scripts/bundle.sh --plan
```

Those commands run on Linux. They do not build the app.

## What the tag runs

`.github/workflows/release.yml` starts on `v*` (and on a manual run that names an existing tag, such as `v0.1.0`).

| Job | Runner | Result |
| --- | --- | --- |
| `mac-app` | `macos-14` (Apple Silicon) | GitHub Release `BlinkyBot-<version>.dmg` and `BlinkyBot-<version>.zip` |

Pull requests run the same Mac compile and package on `macos-14` (`swift build`, `swift test`, then `Scripts/bundle.sh` and `Scripts/dmg.sh`) before a tag is cut. `macos-14` is a GitHub-hosted Mac. A green Linux check is not a built `.app`.

The Mac job installs XcodeGen, downloads the official Node 22.23.4 macOS tarball, and points `BLINKY_NODE` at it. `Scripts/bundle.sh` copies that binary into the app and refuses a Node that links Homebrew or the Actions toolchain. It then runs:

```bash
./Scripts/bundle.sh --zip
./Scripts/dmg.sh --reuse
```

`bundle.sh` is the app. It stages Node, the engine, and Compose under `Contents/Resources/runtime` and writes the zip with `ditto`. `dmg.sh --reuse` packs that same `build.noindex/BlinkyBot.app` into the disk image and checks the bundle version. A local `./Scripts/dmg.sh` without `--reuse` calls `./Scripts/bundle.sh`, then writes the image.

What the app contains, and how to build it on a Mac, is [Scripts/README.md](../Scripts/README.md).

Runs are serialized (`cancel-in-progress: false`). Re-running a tag replaces the DMG and zip (`gh release upload --clobber`) and refreshes the notes.

`release-notes.py` reads `GITHUB_REPOSITORY` in CI, or `origin` on a laptop, so a fork's tag publishes to that fork.

## Disk image

`Scripts/dmg.sh` writes `BlinkyBot-<version>.dmg`: `BlinkyBot.app`, an Applications alias, and `Read Me.txt` in English and Chinese. The Read Me says to drag BlinkyBot into Applications, how to allow the first launch, and where the AGPL text and the source tag are.

There is no custom Finder backdrop. The image is still a normal disk image.

The zip is the same `.app`, without the alias or the Read Me. People who want an archive use the zip. People who install use the DMG.

## First launch

The download is quarantined. macOS shows that the developer cannot be verified. Open BlinkyBot, dismiss the warning, then **System Settings → Privacy & Security → Security → Open Anyway**. Once.

The app then starts the local engine on `127.0.0.1:3001` and Compose on `127.0.0.1:3000`. Data goes to `~/Library/Application Support/BlinkyBot/`. Docker and Supabase stay the upstream server install described in [INSTALL.md](../INSTALL.md).

## License

BlinkyBot is AGPL-3.0-only. The release notes say so. The disk image Read Me says so. The license text is `LICENSE` in the repository, and the git tag is the corresponding source.

## How to cut a release

On the commit that should ship, with a clean tree:

```bash
# Edit CHANGELOG.md and CHANGELOG.zh-CN.md.
# Keep VERSION, MARKETING_VERSION, and the ui and engine package versions equal.
echo 0.1.0 > VERSION
git add VERSION CHANGELOG.md CHANGELOG.zh-CN.md
git commit -m "BlinkyBot 0.1.0"
git tag v0.1.0
git push origin HEAD
git push origin v0.1.0
```

`0.1.0` is already the version in the tree. The next release bumps `VERSION` and the three fields `Scripts/plan.mjs` checks, adds both changelog sections, commits, then tags. Push the commit before the tag, or together, so the tag points at the commit that contains the notes.

Watch the workflow:

```bash
gh run list --workflow release.yml --limit 2
gh release view v0.1.0 --json assets --jq '.assets[].name'
```

A finished Mac job has `BlinkyBot-0.1.0.dmg` and `BlinkyBot-0.1.0.zip`.

To build the same artifacts on a Mac without publishing, with `BLINKY_NODE` set to an official Node 22 tarball when the `node` on `PATH` is Homebrew:

```bash
./Scripts/bundle.sh --zip
./Scripts/dmg.sh --reuse
```

## Not in this version

**Sparkle / appcast.** blinky-mac signs a zip with `SPARKLE_PRIVATE_KEY` and commits `appcast.xml`. BlinkyBot does not link Sparkle, has no feed, and does not check GitHub for updates. The hand-written changelog and `Scripts/changelog.py --html` are what a later feed would read. Wiring Sparkle means a framework in the app, a public key in Info.plist, a private key in Actions secrets, and a feed committed after the assets exist. Until that lands, upgrades are a new DMG.

**Notarization and Developer ID.** `Scripts/bundle.sh` ad-hoc signs unless `CODESIGN_IDENTITY` is set. That does not satisfy Gatekeeper. A certificate and notarization would remove the first-launch bypass. They are not required to publish the DMG.

**Intel.** The hosted runner is Apple Silicon, and the Node tarball matches that Mac. `Scripts/bundle.sh` packages the architecture of the machine it runs on. The workflow does not upload an Intel image.

**Finder window art.** No background image and no committed `.DS_Store`. The disk image opens on the app, the Applications alias, and the Read Me.
