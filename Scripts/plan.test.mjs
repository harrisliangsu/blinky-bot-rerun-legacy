import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import {
    APP_OUTPUT,
    STAGED_RUNTIME_FILES,
    alignmentProblems,
    deployFailedMessage,
    containRuntimeLinks,
    escapedSymlinks,
    foreignNativePackage,
    isBundledBrowserDir,
    hoistPnpmPackages,
    pruneProductionTree,
    stageStandaloneUi,
    formatMissingCheckout,
    formatMissingRuntime,
    formatMissingTools,
    formatNodeLibraryProblem,
    formatPlan,
    hostRefusal,
    infoPlistVersion,
    marketingVersion,
    missingCheckoutArtifacts,
    missingRuntimeEntries,
    nodeMachOProblem,
    nodeMajorProblem,
    nonRelocatableLibraries,
    patchInfoPlist,
    patchSparklePlist,
    readVersion,
    symlinkEscapesRoot,
    versionAlignmentProblems,
    xcodeMajorProblem,
} from './plan.mjs'

const repoRoot = join(import.meta.dirname, '..')
const bundleSh = join(repoRoot, 'Scripts/bundle.sh')

describe('VERSION', () => {
    it('reads major.minor.patch and rejects anything else', () => {
        assert.equal(readVersion('0.1.0\n'), '0.1.0')
        assert.equal(readVersion('  1.2.3  \n'), '1.2.3')
        assert.throws(() => readVersion(''), /one version line/)
        assert.throws(() => readVersion('0.1\n'), /major\.minor\.patch/)
        assert.throws(() => readVersion('0.1.0\n1.0.0\n'), /one version line/)
    })

    it('matches the Mac shell marketing version and the server package versions', () => {
        const { version, problems } = alignmentProblems(repoRoot)
        assert.equal(version, '0.1.3')
        assert.deepEqual(problems, [])
        const yml = readFileSync(join(repoRoot, 'apps/mac-shell/project.yml'), 'utf8')
        assert.equal(marketingVersion(yml), version)
    })

    it('names each file that drifted', () => {
        const problems = versionAlignmentProblems({
            version: '0.1.0',
            marketingVersion: '0.0.1',
            uiVersion: '0.1.0',
            engineVersion: null,
        })
        assert.equal(problems.length, 2)
        assert.match(problems[0], /project\.yml/)
        assert.match(problems[1], /apps\/engine\/package\.json/)
    })
})

describe('bundle layout', () => {
    it('prints the runtime paths the Mac shell resolves', () => {
        const text = formatPlan('0.1.0')
        assert.match(text, new RegExp(APP_OUTPUT.replaceAll('.', '\\.')))
        assert.match(text, /CFBundleShortVersionString = 0\.1\.0/)
        assert.match(text, /CFBundleVersion = 0\.1\.0/)
        for (const entry of STAGED_RUNTIME_FILES) {
            assert.match(text, new RegExp(entry.replaceAll('/', '\\/')))
        }
        assert.match(text, /node\/bin\/node/)
        assert.match(text, /engine\/dist\/cli\/bin\.js/)
        assert.match(text, /server\.js/)
        assert.match(text, /Chromium is not in the app/)
        assert.match(text, /xcodebuild/)
        assert.match(text, /blinky-local\.mjs build/)
    })

    it('tells a non-Mac host where the app is built', () => {
        const text = hostRefusal('Linux')
        assert.match(text, /macOS/)
        assert.match(text, /Linux/)
        assert.match(text, /build\.noindex\/BlinkyBot\.app/)
        assert.match(text, /Scripts\/README\.md/)
    })
})

describe('host checks', () => {
    it('names the install hint for each missing Mac tool', () => {
        const text = formatMissingTools(['xcodegen', 'pnpm'])
        assert.match(text, /Missing xcodegen\. brew install xcodegen/)
        assert.match(text, /Missing pnpm\. corepack enable/)
    })

    it('requires Node 22 and Xcode 15', () => {
        assert.equal(nodeMajorProblem('v22.14.0'), null)
        assert.match(nodeMajorProblem('v20.11.0'), /too old/)
        assert.equal(xcodeMajorProblem('Xcode 15.4\nBuild version 15F31d'), null)
        assert.match(xcodeMajorProblem('Xcode 14.2\n'), /too old/)
        assert.match(xcodeMajorProblem('no xcode'), /Could not read/)
    })

    it('rejects a Node binary that links outside the system SDK', () => {
        const otool = [
            '/opt/homebrew/bin/node:',
            '\t/opt/homebrew/Cellar/node/22.0.0/bin/node (compatibility version 0.0.0, current version 0.0.0)',
            '\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)',
            '\t/opt/homebrew/opt/icu4c/lib/libicuuc.74.dylib (compatibility version 74.0.0, current version 74.2.0)',
            '\t@rpath/libnode.128.dylib (compatibility version 0.0.0, current version 0.0.0)',
        ].join('\n')
        const libs = nonRelocatableLibraries(otool)
        assert.deepEqual(libs, ['/opt/homebrew/opt/icu4c/lib/libicuuc.74.dylib'])
        assert.match(formatNodeLibraryProblem(libs), /BLINKY_NODE/)
        assert.match(formatNodeLibraryProblem(libs), /--allow-host-node/)
    })

    it('accepts a Mach-O node and rejects a script', () => {
        assert.equal(nodeMachOProblem('/usr/local/bin/node: Mach-O 64-bit executable arm64'), null)
        assert.match(nodeMachOProblem('/usr/bin/node: POSIX shell script'), /Mach-O/)
    })
})

describe('staging checks', () => {
    it('lists checkout artifacts that are not built yet', () => {
        const missing = missingCheckoutArtifacts('/missing', () => false)
        assert.equal(missing.length > 0, true)
        assert.match(formatMissingCheckout(missing), /blinky-local\.mjs build/)
        assert.deepEqual(missingCheckoutArtifacts('/work', () => true), [])
    })

    it('lists runtime entries the app will look up', () => {
        const root = mkdtempSync(join(tmpdir(), 'blinky-runtime-'))
        try {
            const missing = missingRuntimeEntries(root)
            assert.equal(missing.includes('node/bin/node'), true)
            assert.match(formatMissingRuntime(missing), /Contents\/Resources\/runtime/)
            mkdirSync(join(root, 'node/bin'), { recursive: true })
            writeFileSync(join(root, 'node/bin/node'), '')
            assert.equal(missingRuntimeEntries(root).includes('node/bin/node'), false)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    it('flags a symlink that leaves the app', () => {
        const root = mkdtempSync(join(tmpdir(), 'blinky-links-'))
        const outside = mkdtempSync(join(tmpdir(), 'blinky-outside-'))
        try {
            mkdirSync(join(root, 'engine/node_modules'), { recursive: true })
            symlinkSync(outside, join(root, 'engine/node_modules/hono'))
            symlinkSync('bin.js', join(root, 'engine/self'))
            assert.equal(symlinkEscapesRoot(join(root, 'engine/node_modules/hono'), outside, root), true)
            assert.equal(symlinkEscapesRoot(join(root, 'engine/self'), 'bin.js', root), false)
            const escapes = escapedSymlinks(root)
            assert.equal(escapes.length, 1)
            assert.match(escapes[0].link, /hono$/)
            assert.equal(lstatSync(join(root, 'engine/self')).isSymbolicLink(), true)
        } finally {
            rmSync(root, { recursive: true, force: true })
            rmSync(outside, { recursive: true, force: true })
        }
    })

    it('keeps Next traces and drops node-gyp shims', () => {
        const root = mkdtempSync(join(tmpdir(), 'blinky-contain-'))
        try {
            const trace = join(root, '.next/node_modules')
            const sharp = join(root, 'node_modules/sharp')
            mkdirSync(trace, { recursive: true })
            mkdirSync(sharp, { recursive: true })
            writeFileSync(join(sharp, 'index.js'), 'sharp')
            symlinkSync('../../../../node_modules/.pnpm/sharp@0.35.1/node_modules/sharp', join(trace, 'sharp-abcdef12'))
            const shimDir = join(root, 'node_modules/.pnpm/cpu-features@0.0.10/node_modules/cpu-features/build/node_gyp_bins')
            mkdirSync(shimDir, { recursive: true })
            symlinkSync('/opt/homebrew/opt/python@3.14/bin/python3.14', join(shimDir, 'python3'))
            const result = containRuntimeLinks(root)
            assert.equal(result.retargeted.length, 1)
            assert.equal(result.removed.length, 1)
            assert.equal(escapedSymlinks(root).length, 0)
            assert.equal(readlinkSync(join(trace, 'sharp-abcdef12')), '../../node_modules/sharp')
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    it('explains a failed pnpm deploy', () => {
        assert.match(deployFailedMessage('engine'), /rerun-engine/)
        assert.match(deployFailedMessage('ui'), /--filter rerun --prod deploy/)
    })

    it('keeps the host native build and drops foreign ones, docs, and browsers', () => {
        const host = { platform: 'darwin', arch: 'arm64' }
        assert.equal(foreignNativePackage('@img/sharp-darwin-arm64', host), false)
        assert.equal(foreignNativePackage('@img+sharp-darwin-arm64@0.35.1', host), false)
        assert.equal(foreignNativePackage('@img/sharp-linux-x64', host), true)
        assert.equal(foreignNativePackage('@img+sharp-linuxmusl-arm64@0.35.1', host), true)
        assert.equal(foreignNativePackage('@libsql/darwin-x64', host), true)
        assert.equal(foreignNativePackage('hono', host), false)
        assert.equal(isBundledBrowserDir('.local-browsers'), true)
        assert.equal(isBundledBrowserDir('chromium-1148'), true)
        assert.equal(isBundledBrowserDir('patchright'), false)

        const root = mkdtempSync(join(tmpdir(), 'blinky-prune-'))
        try {
            const modules = join(root, 'node_modules')
            mkdirSync(join(modules, '@img/sharp-linux-x64'), { recursive: true })
            writeFileSync(join(modules, '@img/sharp-linux-x64/index.js'), 'linux')
            mkdirSync(join(modules, '@img/sharp-darwin-arm64'), { recursive: true })
            writeFileSync(join(modules, '@img/sharp-darwin-arm64/index.js'), 'arm')
            mkdirSync(join(modules, 'hono'), { recursive: true })
            writeFileSync(join(modules, 'hono/README.md'), 'docs')
            writeFileSync(join(modules, 'hono/index.js'), 'keep')
            mkdirSync(join(modules, 'patchright/.local-browsers/chromium-1148'), { recursive: true })
            writeFileSync(join(modules, 'patchright/.local-browsers/chromium-1148/chrome'), 'browser')
            const result = pruneProductionTree(root, host)
            assert.equal(result.browsers.length, 0)
            assert.equal(existsSync(join(modules, '@img/sharp-linux-x64')), false)
            assert.equal(existsSync(join(modules, '@img/sharp-darwin-arm64/index.js')), true)
            assert.equal(existsSync(join(modules, 'hono/index.js')), true)
            assert.equal(existsSync(join(modules, 'hono/README.md')), false)
            assert.equal(existsSync(join(modules, 'patchright/.local-browsers')), false)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    it('stages the standalone server with static files and public assets', () => {
        const standalone = mkdtempSync(join(tmpdir(), 'blinky-standalone-'))
        const dest = mkdtempSync(join(tmpdir(), 'blinky-staged-'))
        try {
            mkdirSync(join(standalone, 'apps/ui/.next'), { recursive: true })
            writeFileSync(join(standalone, 'apps/ui/server.js'), 'server')
            const staticDir = join(standalone, 'static')
            const publicDir = join(standalone, 'public')
            mkdirSync(staticDir, { recursive: true })
            mkdirSync(publicDir, { recursive: true })
            writeFileSync(join(staticDir, 'chunk.js'), 'chunk')
            writeFileSync(join(publicDir, 'icon.png'), 'icon')
            const staged = stageStandaloneUi({
                standaloneRoot: standalone,
                staticDir,
                publicDir,
                destination: dest,
            })
            assert.equal(staged.ok, true)
            assert.equal(staged.serverRel, 'apps/ui/server.js')
            assert.equal(readFileSync(join(dest, 'apps/ui/server.js'), 'utf8'), 'server')
            assert.equal(readFileSync(join(dest, 'apps/ui/.next/static/chunk.js'), 'utf8'), 'chunk')
            assert.equal(readFileSync(join(dest, 'apps/ui/public/icon.png'), 'utf8'), 'icon')
        } finally {
            rmSync(standalone, { recursive: true, force: true })
            rmSync(dest, { recursive: true, force: true })
        }
    })

    it('links @swc/helpers out of the pnpm store so Next can require it', () => {
        const root = mkdtempSync(join(tmpdir(), 'blinky-hoist-'))
        try {
            const helpers = join(root, 'node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/_')
            mkdirSync(helpers, { recursive: true })
            writeFileSync(join(helpers, '..', 'package.json'), '{"name":"@swc/helpers"}\n')
            writeFileSync(join(helpers, '_interop_require_default.js'), 'module.exports = (value) => value\n')
            const probe = join(root, 'apps/ui/node_modules/next/dist/probe.js')
            mkdirSync(dirname(probe), { recursive: true })
            writeFileSync(probe, "require('@swc/helpers/_/_interop_require_default'); console.log('ok')\n")
            const before = spawnSync(process.execPath, [probe], { encoding: 'utf8' })
            assert.notEqual(before.status, 0)
            assert.match(`${before.stderr}`, /Cannot find module '@swc\/helpers/)
            const linked = hoistPnpmPackages(root)
            assert.equal(linked.length, 1)
            const after = spawnSync(process.execPath, [probe], { encoding: 'utf8' })
            assert.equal(after.status, 0, after.stderr)
            assert.match(after.stdout, /ok/)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })
})

describe('Info.plist version', () => {
    it('writes CFBundleShortVersionString and CFBundleVersion from VERSION', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
</dict></plist>
`
        const patched = patchInfoPlist(xml, '0.1.0')
        assert.equal(infoPlistVersion(patched, 'CFBundleShortVersionString'), '0.1.0')
        assert.equal(infoPlistVersion(patched, 'CFBundleVersion'), '0.1.0')
        const shipped = patchInfoPlist(readFileSync(join(repoRoot, 'apps/mac-shell/Info.plist'), 'utf8'), '0.1.0')
        assert.equal(infoPlistVersion(shipped, 'CFBundleShortVersionString'), '0.1.0')
        assert.equal(infoPlistVersion(shipped, 'CFBundleVersion'), '0.1.0')
        assert.match(shipped, /BlinkyComposeBaseURL/)
        assert.throws(() => patchInfoPlist('<plist><dict></dict></plist>', '0.1.0'), /CFBundleShortVersionString/)
        assert.throws(() => patchInfoPlist(xml, 'nope'), /major\.minor\.patch/)
    })

    it('writes the Sparkle feed and the public key', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
\t<key>SUFeedURL</key><string>https://example.invalid/appcast.xml</string>
</dict></plist>
`
        const patched = patchSparklePlist(xml, 'https://github.com/harrisliangsu/blinky-bot/releases/latest/download/appcast.xml', 'abc=')
        assert.match(patched, /harrisliangsu\/blinky-bot\/releases\/latest\/download\/appcast\.xml/)
        assert.match(patched, /<key>SUPublicEDKey<\/key>\s*<string>abc=<\/string>/)
        assert.throws(() => patchSparklePlist(xml, 'http://insecure.example/appcast.xml', 'abc='), /https/)
    })
})

describe('Scripts/bundle.sh', () => {
    const source = readFileSync(bundleSh, 'utf8')

    it('stages the runtime, stamps the plist, and does not call docker', () => {
        assert.match(source, /patch-plist/)
        assert.match(source, /patch-sparkle/)
        assert.match(source, /releases\/latest\/download\/appcast\.xml/)
        assert.match(source, /Sparkle\.framework/)
        assert.match(source, /verify-runtime/)
        assert.match(source, /audit-symlinks/)
        assert.match(source, /contain-links/)
        assert.match(source, /stage-ui/)
        assert.match(source, /hoist-pnpm/)
        assert.match(source, /smoke-ui\.mjs/)
        assert.match(source, /prune-runtime/)
        assert.match(source, /blinky-local\.mjs build/)
        assert.match(source, /xcodebuild/)
        assert.match(source, /MACOSX_DEPLOYMENT_TARGET=14\.0/)
        assert.match(source, /xcodegen generate/)
        assert.match(source, /Contents\/Resources\/runtime/)
        assert.doesNotMatch(source, /\bdocker\b/i)
    })

    it('prints the plan on this machine', () => {
        const result = spawnSync('bash', [bundleSh, '--plan'], { cwd: repoRoot, encoding: 'utf8' })
        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /Contents\/Resources\/runtime\/node\/bin\/node/)
        assert.match(result.stdout, /CFBundleShortVersionString = 0\.1\.3/)
    })

    it('publishes the Sparkle feed without pushing to main', () => {
        const workflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')
        assert.match(workflow, /gh pr create --base main --head "appcast-v\$VERSION"/)
        assert.match(workflow, /gh pr merge/)
        assert.doesNotMatch(workflow, /git push origin (HEAD:)?main\b/)
    })

    it('refuses to assemble an app when the host is not macOS', () => {
        if (process.platform === 'darwin') return
        const result = spawnSync('bash', [bundleSh], { cwd: repoRoot, encoding: 'utf8' })
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /macOS/)
        assert.match(result.stderr, /Scripts\/README\.md/)
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /\bdocker\b/i)
    })
})
