import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP = new Set(['node_modules', 'dist', '.next', 'build', 'build.noindex', 'out', '.git'])

export async function routeEgoBrowser({ root, engineUrl, apiKey, stubLog }) {
    const files = filesContaining(root, 'ego-browser')
    const paths = new Set(['/ego/browse', '/browser/tasks', '/desktop/ego'])
    for (const file of files) {
        const text = readFileSync(file, 'utf8')
        for (const match of text.matchAll(/['"`](\/(?:ego|browser)[a-z0-9_./-]*)['"`]/gi)) paths.add(match[1])
    }
    const attempts = []
    for (const path of paths) {
        const response = await fetch(`${engineUrl}${path}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com', prompt: 'Open the example page' }),
        }).catch(error => ({ status: 0, error: String(error) }))
        attempts.push(`${path} ${response.status ?? 0}`)
        if (!response.status || response.status === 404 || response.status === 405) continue
        const log = safeRead(stubLog)
        if (!log.includes('"bin":"ego-browser"')) {
            throw new Error(`A browser route answered (${attempts.at(-1)}) without spawning ego-browser.`)
        }
        return { path, status: response.status, attempts }
    }
    throw new Error(`ego-browser is on this tree (${files.join(', ') || 'no file'}) but no browser route spawned it. Tried ${attempts.join(', ') || 'nothing'}.`)
}

function filesContaining(root, needle) {
    const found = []
    walk(join(root, 'apps'), needle, found)
    walk(join(root, 'packages'), needle, found)
    return found
}

function walk(dir, needle, found) {
    let names = []
    try {
        names = readdirSync(dir)
    } catch {
        return
    }
    for (const name of names) {
        if (SKIP.has(name)) continue
        const path = join(dir, name)
        let info
        try {
            info = statSync(path)
        } catch {
            continue
        }
        if (info.isDirectory()) walk(path, needle, found)
        else if (/\.(swift|ts|tsx|mjs|js)$/.test(name)) {
            try {
                if (readFileSync(path, 'utf8').includes(needle)) found.push(path)
            } catch {
                continue
            }
        }
    }
}

function safeRead(path) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return ''
    }
}
