// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(moduleDir, '..')

export const APP_NAME = 'BlinkyBot'
export const BUNDLE_ID = 'bot.blinky.shell'
export const APP_OUTPUT = 'build.noindex/BlinkyBot.app'
export const MIN_NODE_MAJOR = 22
export const MIN_XCODE_MAJOR = 15

export const MAC_TOOLS = [
    { bin: 'node', hint: 'Install Node.js 22 from https://nodejs.org.' },
    { bin: 'pnpm', hint: 'corepack enable && corepack prepare pnpm@8.15.4 --activate' },
    { bin: 'xcodebuild', hint: 'Install Xcode 15 or newer, then sudo xcode-select -s /Applications/Xcode.app/Contents/Developer' },
    { bin: 'xcodegen', hint: 'brew install xcodegen  (2.38 or newer)' },
    { bin: 'codesign', hint: 'Install the Xcode command line tools.' },
    { bin: 'ditto', hint: 'ditto ships with macOS.' },
    { bin: 'plutil', hint: 'plutil ships with macOS.' },
    { bin: 'file', hint: 'file ships with macOS.' },
    { bin: 'otool', hint: 'otool ships with the Xcode command line tools.' },
]

export const STAGED_RUNTIME_FILES = [
    'node/bin/node',
    'engine/dist/cli/bin.js',
    'engine/package.json',
    'engine/node_modules',
    'engine/assets/desktop',
]

export const UI_LAUNCH_FILES = ['ui/server.js', 'ui/apps/ui/server.js', 'ui/node_modules/next/dist/bin/next']

export const CHECKOUT_ARTIFACTS = [
    { path: 'apps/engine/dist/cli/bin.js', hint: 'pnpm --filter rerun-engine build' },
    { path: 'apps/engine/assets/desktop', hint: 'the engine assets directory is part of the checkout' },
    { path: 'apps/ui/.next/BUILD_ID', hint: 'pnpm --filter rerun build' },
    { path: 'apps/ui/node_modules/next/dist/bin/next', hint: 'pnpm install' },
    { path: 'apps/ui/next.config.ts', hint: 'the Compose config is part of the checkout' },
    { path: 'apps/ui/public', hint: 'the Compose public directory is part of the checkout' },
]

const PLIST_VERSION_KEYS = ['CFBundleShortVersionString', 'CFBundleVersion']

export function readVersion(text) {
    const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length !== 1) throw new Error('VERSION must contain one version line')
    const version = lines[0]
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`VERSION must be major.minor.patch, got ${version}`)
    }
    return version
}

export function marketingVersion(projectYml) {
    const match = String(projectYml).match(/MARKETING_VERSION:\s*"([^"]+)"/)
    return match ? match[1] : null
}

export function versionAlignmentProblems({ version, marketingVersion: marketed, uiVersion, engineVersion }) {
    const problems = []
    if (marketed !== version) {
        problems.push(`apps/mac-shell/project.yml MARKETING_VERSION is ${marketed ?? 'missing'}, VERSION is ${version}`)
    }
    if (uiVersion !== version) {
        problems.push(`apps/ui/package.json version is ${uiVersion ?? 'missing'}, VERSION is ${version}`)
    }
    if (engineVersion !== version) {
        problems.push(`apps/engine/package.json version is ${engineVersion ?? 'missing'}, VERSION is ${version}`)
    }
    return problems
}

export function alignmentProblems(root = repoRoot) {
    const version = readVersion(readFileSync(join(root, 'VERSION'), 'utf8'))
    const marketed = marketingVersion(readFileSync(join(root, 'apps/mac-shell/project.yml'), 'utf8'))
    const uiVersion = JSON.parse(readFileSync(join(root, 'apps/ui/package.json'), 'utf8')).version ?? null
    const engineVersion = JSON.parse(readFileSync(join(root, 'apps/engine/package.json'), 'utf8')).version ?? null
    return { version, problems: versionAlignmentProblems({ version, marketingVersion: marketed, uiVersion, engineVersion }) }
}

export function formatPlan(version) {
    const lines = [
        `${APP_NAME} ${version}`,
        `app: ${APP_OUTPUT}`,
        `bundle id: ${BUNDLE_ID}`,
        `zip: build.noindex/${APP_NAME}-${version}.zip`,
        '',
        `${APP_OUTPUT}/Contents/MacOS/${APP_NAME}`,
        `${APP_OUTPUT}/Contents/Info.plist`,
        `  CFBundleShortVersionString = ${version}`,
        `  CFBundleVersion = ${version}`,
        ...STAGED_RUNTIME_FILES.map((entry) => `${APP_OUTPUT}/Contents/Resources/runtime/${entry}`),
        '',
        'On macOS, Scripts/bundle.sh:',
        '  1. pnpm install --frozen-lockfile',
        '  2. node scripts/blinky-local/blinky-local.mjs build',
        '  3. pnpm --filter rerun-engine --prod deploy, then copy apps/engine/dist and apps/engine/assets',
        '  4. stage apps/ui/.next/standalone (server.js) plus .next/static and public',
        '  5. prune node_modules docs, tests, source maps, foreign native builds, and browser caches',
        '  6. copy Node to Contents/Resources/runtime/node/bin/node',
        '  7. xcodegen generate && xcodebuild -configuration Release',
        '  8. write CFBundleShortVersionString and CFBundleVersion from VERSION',
        '  9. codesign (ad-hoc unless CODESIGN_IDENTITY is set)',
        '',
        'Compose launch: runtime/ui/server.js or runtime/ui/apps/ui/server.js (Next standalone).',
        'Chromium is not in the app. The engine downloads it on first use.',
        '',
        'This plan prints on any system. The .app is produced on macOS.',
        `The bundled Node and the Swift app are the architecture of the Mac that runs the script.`,
    ]
    return lines.join('\n')
}

export function hostRefusal(platform) {
    return [
        `Scripts/bundle.sh builds ${APP_NAME}.app on macOS. This machine is ${platform}.`,
        'Use a Mac with Xcode 15 or newer, XcodeGen 2.38 or newer, Node.js 22, and pnpm 8.15.4.',
        `The app is written to ${APP_OUTPUT}. See Scripts/README.md.`,
        'The bundled servers are the pnpm production build of the engine and Compose.',
    ].join('\n')
}

export function formatMissingTools(names) {
    const known = new Map(MAC_TOOLS.map((tool) => [tool.bin, tool.hint]))
    return names.map((name) => {
        const hint = known.get(name)
        return hint ? `Missing ${name}. ${hint}` : `Missing ${name}.`
    }).join('\n')
}

export function nodeMajorProblem(versionText) {
    const major = Number(String(versionText).trim().replace(/^v/, '').split('.')[0])
    if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
        return `Node ${String(versionText).trim()} is too old. BlinkyBot bundles Node ${MIN_NODE_MAJOR} or newer.`
    }
    return null
}

export function xcodeMajorProblem(text) {
    const match = String(text).match(/Xcode (\d+)/)
    if (!match) return `Could not read an Xcode version from: ${String(text).trim()}`
    const major = Number(match[1])
    if (major < MIN_XCODE_MAJOR) return `Xcode ${major} is too old. BlinkyBot needs Xcode ${MIN_XCODE_MAJOR} or newer.`
    return null
}

export function nonRelocatableLibraries(otoolText) {
    const libs = []
    for (const line of String(otoolText).split('\n')) {
        if (!/^\s/.test(line)) continue
        const path = line.trim().split(/\s+/)[0]
        if (path) libs.push(path)
    }
    return libs.slice(1).filter((path) => {
        if (path.startsWith('/usr/lib/') || path.startsWith('/System/')) return false
        if (path.startsWith('@rpath/') || path.startsWith('@loader_path/') || path.startsWith('@executable_path/')) return false
        return true
    })
}

export function formatNodeLibraryProblem(libs) {
    return [
        'Node links libraries outside the system SDK, so this binary will not run on another Mac:',
        ...libs.map((lib) => `  ${lib}`),
        'Point BLINKY_NODE at the official Node 22 macOS tarball binary, or pass --allow-host-node to bundle a copy that only has to run on this machine.',
    ].join('\n')
}

export function nodeMachOProblem(fileText) {
    if (/Mach-O/.test(String(fileText))) return null
    return `The node binary is not a macOS Mach-O executable:\n${String(fileText).trim()}\nSet BLINKY_NODE to the Node 22 macOS binary.`
}

export function missingCheckoutArtifacts(root, exists = existsSync) {
    return CHECKOUT_ARTIFACTS.filter((item) => !exists(join(root, item.path)))
}

export function formatMissingCheckout(items) {
    return [
        'Missing server build output:',
        ...items.map((item) => `  ${item.path}  (${item.hint})`),
        '',
        'Build them with:',
        '  node scripts/blinky-local/blinky-local.mjs build',
    ].join('\n')
}

export function patchInfoPlist(xml, version) {
    readVersion(`${version}\n`)
    let next = String(xml)
    for (const key of PLIST_VERSION_KEYS) {
        const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[\\s\\S]*?(</string>)`)
        if (!pattern.test(next)) throw new Error(`Info.plist is missing ${key}`)
        next = next.replace(pattern, (_match, open, close) => `${open}${version}${close}`)
    }
    return next
}

export function infoPlistVersion(xml, key) {
    const match = String(xml).match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
    return match ? match[1] : null
}

export function uiLaunchRelative(root, exists = existsSync) {
    return UI_LAUNCH_FILES.find((entry) => exists(join(root, entry))) ?? null
}

export function missingRuntimeEntries(root, exists = existsSync) {
    const missing = STAGED_RUNTIME_FILES.filter((entry) => !exists(join(root, entry)))
    const launch = uiLaunchRelative(root, exists)
    if (!launch) {
        missing.push(UI_LAUNCH_FILES.join(' or '))
        return missing
    }
    const appDir = dirname(launch)
    for (const entry of [join(appDir, '.next/BUILD_ID'), join(appDir, 'public')]) {
        if (!exists(join(root, entry))) missing.push(entry)
    }
    return missing
}

export const STANDALONE_SERVERS = ['server.js', 'apps/ui/server.js']

export function standaloneServerRelative(root, exists = existsSync) {
    return STANDALONE_SERVERS.find((entry) => exists(join(root, entry))) ?? null
}

export function stageStandaloneUi({ standaloneRoot, staticDir, publicDir, destination, exists = existsSync, copy = cpSync, remove = rmSync }) {
    const serverRel = standaloneServerRelative(standaloneRoot, exists)
    if (!serverRel) {
        return { ok: false, error: `Next standalone server.js is missing under ${standaloneRoot}. Compose needs output: 'standalone'.` }
    }
    if (!exists(staticDir)) return { ok: false, error: `Next static files are missing at ${staticDir}` }
    if (!exists(publicDir)) return { ok: false, error: `Compose public files are missing at ${publicDir}` }
    remove(destination, { recursive: true, force: true })
    copy(standaloneRoot, destination, { recursive: true })
    const appDir = join(destination, dirname(serverRel))
    mkdirSync(join(appDir, '.next'), { recursive: true })
    copy(publicDir, join(appDir, 'public'), { recursive: true })
    copy(staticDir, join(appDir, '.next', 'static'), { recursive: true })
    return { ok: true, serverRel }
}

const DOC_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'docs', 'doc', 'example', 'examples', '.github'])
const BROWSER_DIR_NAMES = new Set(['.local-browsers', 'ms-playwright', 'chrome-headless-shell'])

export function foreignNativePackage(name, host) {
    const label = String(name).replace(/@\d.*$/, '')
    const marks = label.match(/(?:linux|win32|android|freebsd|darwin)(?:musl)?-(?:x64|arm64|arm|ia32)/g)
    if (!marks) return false
    const token = `${host.platform}-${host.arch}`
    return marks.every((mark) => !mark.includes(token))
}

export function isBundledBrowserDir(name) {
    return BROWSER_DIR_NAMES.has(name) || /^chromium-\d/.test(name) || /^chrome-mac/.test(name) || /^chromium_headless_shell/.test(name)
}

function insideNodeModules(root, full) {
    const rel = relative(root, full)
    return rel === 'node_modules' || rel.startsWith(`node_modules${sep}`) || rel.includes(`${sep}node_modules${sep}`)
}

export function pruneProductionTree(root, host) {
    const removed = []
    const pending = []
    function walk(dir) {
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (entry.isSymbolicLink()) continue
            if (!insideNodeModules(root, full)) {
                if (entry.isDirectory()) walk(full)
                continue
            }
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && (isBundledBrowserDir(entry.name) || DOC_DIR_NAMES.has(entry.name) || foreignNativePackage(entry.name, host))) {
                    pending.push(full)
                    continue
                }
                walk(full)
                continue
            }
            if (/\.(md|markdown|map)$/.test(entry.name) || entry.name.endsWith('.d.ts') || /^(LICENSE|CHANGELOG|README)/i.test(entry.name)) {
                pending.push(full)
            }
        }
    }
    if (existsSync(root)) walk(root)
    pending.sort((a, b) => b.length - a.length)
    for (const path of pending) {
        rmSync(path, { recursive: true, force: true })
        removed.push(path)
    }
    const dangling = []
    function dropDangling(dir) {
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (!entry.isSymbolicLink()) {
                if (entry.isDirectory()) dropDangling(full)
                continue
            }
            if (!insideNodeModules(root, full)) continue
            let target
            try {
                target = readlinkSync(full)
            } catch {
                continue
            }
            if (!existsSync(resolve(dirname(full), target))) {
                unlinkSync(full)
                dangling.push(full)
            }
        }
    }
    if (existsSync(root)) dropDangling(root)
    return { removed, dangling, browsers: bundledBrowserDirs(root) }
}

export function bundledBrowserDirs(root) {
    const found = []
    function walk(dir) {
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (entry.isSymbolicLink()) continue
            if (!entry.isDirectory()) continue
            if (isBundledBrowserDir(entry.name)) {
                found.push(full)
                continue
            }
            walk(full)
        }
    }
    if (existsSync(root)) walk(root)
    return found
}

export function formatMissingRuntime(entries) {
    return [
        'The staged runtime is missing:',
        ...entries.map((entry) => `  ${entry}`),
        'BlinkyBot.app expects these paths under Contents/Resources/runtime.',
    ].join('\n')
}

export function symlinkEscapesRoot(linkPath, target, root) {
    const abs = resolve(dirname(linkPath), target)
    const rel = relative(resolve(root), abs)
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) return true
    return isAbsolute(rel)
}

export function escapedSymlinks(root) {
    const rootReal = resolve(root)
    const escapes = []
    const seen = new Set()
    function walk(dir) {
        const key = resolve(dir)
        if (seen.has(key)) return
        seen.add(key)
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            let linked = false
            try {
                linked = entry.isSymbolicLink()
            } catch {
                linked = lstatSync(full).isSymbolicLink()
            }
            if (linked) {
                let target
                try {
                    target = readlinkSync(full)
                } catch {
                    continue
                }
                if (symlinkEscapesRoot(full, target, rootReal)) {
                    escapes.push({ link: full, target: resolve(dirname(full), target) })
                    continue
                }
                try {
                    if (statSync(full).isDirectory()) walk(full)
                } catch {
                    // dangling link inside the tree
                }
                continue
            }
            if (entry.isDirectory()) walk(full)
        }
    }
    walk(rootReal)
    return escapes
}

function isBuildShim(linkPath, target) {
    const blob = `${linkPath}\n${target}`
    return blob.includes('node_gyp_bins') || /(?:^|\/)python3(?:\.\d+)?$/.test(target)
}

function tracedPackageName(linkName) {
    const pkg = linkName.replace(/-[0-9a-f]{8,}$/, '')
    return pkg && pkg !== linkName ? pkg : null
}

function findDeployedPackage(root, pkg) {
    const direct = join(root, 'node_modules', pkg)
    if (existsSync(direct)) return direct
    const store = join(root, 'node_modules', '.pnpm')
    if (!existsSync(store)) return null
    for (const entry of readdirSync(store)) {
        if (entry !== pkg && !entry.startsWith(`${pkg}@`)) continue
        const candidate = join(store, entry, 'node_modules', pkg)
        if (existsSync(candidate)) return candidate
    }
    return null
}

export function containRuntimeLinks(root) {
    const rootReal = resolve(root)
    const removed = []
    const retargeted = []
    const copied = []
    function walk(dir) {
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            let linked = false
            try {
                linked = entry.isSymbolicLink()
            } catch {
                continue
            }
            if (!linked) {
                if (entry.isDirectory()) walk(full)
                continue
            }
            let target
            try {
                target = readlinkSync(full)
            } catch {
                continue
            }
            if (!symlinkEscapesRoot(full, target, rootReal)) {
                try {
                    if (statSync(full).isDirectory()) walk(full)
                } catch {
                    // dangling link that stays inside the tree
                }
                continue
            }
            if (isBuildShim(full, target)) {
                unlinkSync(full)
                removed.push(full)
                continue
            }
            const pkg = tracedPackageName(entry.name)
            const deployed = pkg ? findDeployedPackage(rootReal, pkg) : null
            if (deployed) {
                unlinkSync(full)
                symlinkSync(relative(dirname(full), deployed), full)
                retargeted.push(full)
                continue
            }
            const abs = resolve(dirname(full), target)
            if (existsSync(abs)) {
                unlinkSync(full)
                cpSync(abs, full, { recursive: true, dereference: true })
                copied.push(full)
                continue
            }
            unlinkSync(full)
            removed.push(full)
        }
    }
    walk(rootReal)
    return { removed, retargeted, copied }
}

export function formatEscapedSymlinks(escapes) {
    return [
        'The staged runtime contains symlinks that point outside the app:',
        ...escapes.map((item) => `  ${item.link} -> ${item.target}`),
        'pnpm deploy left store links. The bundle keeps only files inside Contents/Resources/runtime.',
    ].join('\n')
}

export function deployFailedMessage(kind) {
    const name = kind === 'engine' ? 'rerun-engine' : 'rerun'
    return [
        `pnpm deploy did not pack ${name}.`,
        'The app needs that package and its production node_modules under Contents/Resources/runtime.',
        `The command is: pnpm --filter ${name} --prod deploy <dir>`,
        'Fix the pnpm error above, then run Scripts/bundle.sh again.',
    ].join('\n')
}

function fail(message) {
    console.error(message)
    process.exit(1)
}

function readStdin() {
    return readFileSync(0, 'utf8')
}

function main(argv) {
    const command = argv[0]
    if (command === 'plan') {
        const { version, problems } = alignmentProblems()
        if (problems.length) fail(problems.join('\n'))
        console.log(formatPlan(version))
        return
    }
    if (command === 'version') {
        console.log(alignmentProblems().version)
        return
    }
    if (command === 'tools') {
        for (const tool of MAC_TOOLS) console.log(tool.bin)
        return
    }
    if (command === 'check-alignment') {
        const { problems } = alignmentProblems()
        if (problems.length) fail(problems.join('\n'))
        return
    }
    if (command === 'node-version') {
        const problem = nodeMajorProblem(argv[1] ?? '')
        if (problem) fail(problem)
        return
    }
    if (command === 'xcode-version') {
        const problem = xcodeMajorProblem(readStdin())
        if (problem) fail(problem)
        return
    }
    if (command === 'node-libs') {
        const libs = nonRelocatableLibraries(readStdin())
        if (libs.length) fail(formatNodeLibraryProblem(libs))
        return
    }
    if (command === 'node-macho') {
        const problem = nodeMachOProblem(readStdin())
        if (problem) fail(problem)
        return
    }
    if (command === 'missing-tools') {
        const names = argv.slice(1).filter(Boolean)
        if (names.length) fail(formatMissingTools(names))
        return
    }
    if (command === 'refuse-host') {
        console.log(hostRefusal(argv[1] || 'this host'))
        return
    }
    if (command === 'require-checkout') {
        const root = argv[1] ? resolve(argv[1]) : repoRoot
        const missing = missingCheckoutArtifacts(root)
        if (missing.length) fail(formatMissingCheckout(missing))
        const standalone = join(root, 'apps/ui/.next/standalone')
        if (!standaloneServerRelative(standalone)) {
            fail(`Next standalone server.js is missing under ${standalone}. Compose needs output: 'standalone'.`)
        }
        return
    }
    if (command === 'stage-ui') {
        const destination = argv[1]
        if (!destination) fail('stage-ui needs the destination directory')
        const staged = stageStandaloneUi({
            standaloneRoot: join(repoRoot, 'apps/ui/.next/standalone'),
            staticDir: join(repoRoot, 'apps/ui/.next/static'),
            publicDir: join(repoRoot, 'apps/ui/public'),
            destination,
        })
        if (!staged.ok) fail(staged.error)
        console.log(`staged Compose standalone (${staged.serverRel})`)
        return
    }
    if (command === 'prune-runtime') {
        const roots = argv.slice(1).filter(Boolean)
        if (!roots.length) fail('prune-runtime needs one or more directories')
        const host = { platform: process.platform, arch: process.arch }
        for (const root of roots) {
            const result = pruneProductionTree(root, host)
            console.log(`pruned ${root}: ${result.removed.length} paths removed, ${result.dangling.length} dangling links dropped`)
            if (result.browsers.length) {
                fail(['Chromium is downloaded on first use and must not ship inside the app:', ...result.browsers].join('\n'))
            }
        }
        return
    }
    if (command === 'patch-plist') {
        const file = argv[1]
        if (!file) fail('patch-plist needs the Info.plist path')
        const { version, problems } = alignmentProblems()
        if (problems.length) fail(problems.join('\n'))
        const patched = patchInfoPlist(readFileSync(file, 'utf8'), version)
        writeFileSync(file, patched)
        return
    }
    if (command === 'assert-plist-version') {
        const file = argv[1]
        if (!file) fail('assert-plist-version needs the Info.plist path')
        const version = readVersion(readFileSync(join(repoRoot, 'VERSION'), 'utf8'))
        const xml = readFileSync(file, 'utf8')
        for (const key of PLIST_VERSION_KEYS) {
            const found = infoPlistVersion(xml, key)
            if (found !== version) fail(`${key} is ${found ?? 'missing'}, VERSION is ${version}`)
        }
        return
    }
    if (command === 'verify-runtime') {
        const root = argv[1]
        if (!root) fail('verify-runtime needs the runtime directory')
        const missing = missingRuntimeEntries(root)
        if (missing.length) fail(formatMissingRuntime(missing))
        return
    }
    if (command === 'contain-links') {
        const root = argv[1]
        if (!root) fail('contain-links needs a staged runtime directory')
        const result = containRuntimeLinks(root)
        const kept = escapedSymlinks(root)
        if (kept.length) fail(formatEscapedSymlinks(kept))
        console.log(
            `contained links in ${root}: ${result.retargeted.length} retargeted, ${result.copied.length} copied, ${result.removed.length} removed`,
        )
        return
    }
    if (command === 'audit-symlinks') {
        const root = argv[1]
        if (!root) fail('audit-symlinks needs the runtime directory')
        const escapes = escapedSymlinks(root)
        if (escapes.length) fail(formatEscapedSymlinks(escapes))
        return
    }
    if (command === 'deploy-failed') {
        fail(deployFailedMessage(argv[1] === 'engine' ? 'engine' : 'ui'))
    }
    fail('Usage: node Scripts/plan.mjs plan|version|tools|check-alignment|...')
}

function invokedDirectly() {
    if (!process.argv[1]) return false
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    } catch {
        return import.meta.url === pathToFileURL(process.argv[1]).href
    }
}

if (invokedDirectly()) main(process.argv.slice(2))
