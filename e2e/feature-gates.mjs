import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rexGate } from './rex-hook.mjs'

const SKIP = new Set(['node_modules', 'dist', '.next', 'build', 'build.noindex', 'out', '.git'])

export function probeFeatures(root) {
    const macFiles = filesUnder(join(root, 'apps/mac-shell'), ['.swift', '.plist'])
    const appFiles = filesUnder(join(root, 'apps'), ['.swift', '.ts', '.tsx', '.plist', '.mjs'])
    return {
        onboarding: gate('bc-1f5db870', 'first-run onboarding', onboardingHit(macFiles)),
        menuBar: gate('bc-0a7b6354', 'menu bar and background mode', textHit(macFiles, ['MenuBarExtra', 'MenuBarMenu'])),
        crashDiagnostics: gate('bc-0a7b6354', 'crash diagnostics error view', textHit(macFiles, ['ServiceErrorView', 'That port is already in use'])),
        ego: gate('bc-6644260a', 'ego(lite) browser routing', textHit(appFiles, ['ego-browser'])),
        workspaceClone: gate('workspace-clone', 'per-agent workspace and repo clone', textHit(appFiles, ['cloneRepository', 'RepoClone'])),
        rex: rexGate(entriesWithText(macFiles)),
    }
}

function gate(id, title, hit) {
    if (hit) return { id, title, enabled: true, reason: hit }
    return { id, title, enabled: false, reason: `Skipped: ${title} (${id}) is not on this tree.` }
}

function onboardingHit(macFiles) {
    for (const file of macFiles) {
        if (/Onboarding|FirstRun/.test(file.path)) return file.path
    }
    return textHit(macFiles, ['blinky-first-run-onboarding', 'bc-1f5db870'])
}

function entriesWithText(entries) {
    return entries.map(file => {
        try {
            return { path: file.path, text: readFileSync(file.path, 'utf8') }
        } catch {
            return { path: file.path, text: '' }
        }
    })
}

function textHit(entries, needles) {
    for (const file of entries) {
        let text = ''
        try {
            text = readFileSync(file.path, 'utf8')
        } catch {
            continue
        }
        const found = needles.find(needle => text.includes(needle))
        if (found) return `${found} in ${file.path}`
    }
    return null
}

function filesUnder(dir, extensions) {
    const found = []
    let entries = []
    try {
        entries = readdirSync(dir)
    } catch {
        return found
    }
    for (const name of entries) {
        if (SKIP.has(name) || name.startsWith('.')) continue
        const path = join(dir, name)
        let info
        try {
            info = statSync(path)
        } catch {
            continue
        }
        if (info.isDirectory()) found.push(...filesUnder(path, extensions))
        else if (extensions.some(extension => name.endsWith(extension))) found.push({ path })
    }
    return found
}

function invokedDirectly() {
    if (!process.argv[1]) return false
    try {
        return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    } catch {
        return false
    }
}

if (invokedDirectly()) {
    const root = process.argv[2] || fileURLToPath(new URL('..', import.meta.url))
    process.stdout.write(`${JSON.stringify(probeFeatures(root), null, 2)}\n`)
}
