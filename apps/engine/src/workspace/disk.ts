import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { reposDir } from '../config/paths.js'
import type { StoredRepo } from './registry.js'
import { checkoutPath } from './cwd.js'

export async function directoryBytes(root: string): Promise<number> {
    let total = 0
    const stack = [root]
    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) break
        let entries
        try {
            entries = await readdir(current, { withFileTypes: true })
        } catch {
            continue
        }
        for (const entry of entries) {
            const path = resolve(current, entry.name)
            if (entry.isSymbolicLink()) continue
            if (entry.isDirectory()) {
                stack.push(path)
                continue
            }
            try {
                total += (await stat(path)).size
            } catch {
                // A file can disappear while the walk is in progress.
            }
        }
    }
    return total
}

export async function repoBytes(agentId: string, repo: StoredRepo): Promise<number> {
    let total = 0
    for (const checkout of repo.checkouts) {
        total += await directoryBytes(checkoutPath(agentId, checkout.dirname))
    }
    return total
}

export async function reposTreeBytes(agentId: string): Promise<number> {
    return directoryBytes(reposDir(agentId))
}
