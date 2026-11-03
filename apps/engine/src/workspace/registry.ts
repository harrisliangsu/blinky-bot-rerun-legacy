import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { z } from 'zod'
import { DEFAULT_REPO_QUOTA_BYTES } from '@rerun/contracts'
import { reposRegistryPath } from '../config/paths.js'
import { withKeyedLock } from '../lib/lock.js'
import { badRequest } from '../lib/errors.js'

const checkoutSchema = z.object({
    dirname: z.string(),
    branch: z.string(),
    kind: z.enum(['primary', 'worktree']),
    lastUsedAt: z.string().nullable(),
})

const storedRepoSchema = z.object({
    id: z.string(),
    slug: z.string(),
    remote: z.string(),
    remoteKey: z.string(),
    source: z.enum(['github', 'url']),
    defaultBranch: z.string(),
    branch: z.string(),
    status: z.enum(['cloning', 'ready', 'error']),
    error: z.string().nullable(),
    warning: z.string().nullable(),
    github: z.object({ nameWithOwner: z.string(), private: z.boolean() }).nullable(),
    bytes: z.number().int().nonnegative(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    checkouts: z.array(checkoutSchema),
})

const registrySchema = z.object({
    version: z.literal(1),
    activeRepoId: z.string().nullable(),
    quotaBytes: z.number().int().positive(),
    repos: z.array(storedRepoSchema),
})

export type StoredCheckout = z.infer<typeof checkoutSchema>
export type StoredRepo = z.infer<typeof storedRepoSchema>
export type RepoRegistry = z.infer<typeof registrySchema>

export function emptyRegistry(): RepoRegistry {
    return { version: 1, activeRepoId: null, quotaBytes: DEFAULT_REPO_QUOTA_BYTES, repos: [] }
}

function registryFile(agentId: string): string {
    return reposRegistryPath(agentId)
}

export function readRegistry(agentId: string): RepoRegistry {
    let raw: string
    try {
        raw = readFileSync(registryFile(agentId), 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry()
        throw error
    }
    let json: unknown
    try {
        json = JSON.parse(raw)
    } catch {
        throw badRequest('The repository registry for this coworker is unreadable.')
    }
    const parsed = registrySchema.safeParse(json)
    if (!parsed.success) throw badRequest('The repository registry for this coworker is unreadable.')
    return parsed.data
}

export function writeRegistry(agentId: string, registry: RepoRegistry): void {
    const file = registryFile(agentId)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
}

// Writes go out through rename, so a reader sees the previous file or the next one.
export async function withRegistry<T>(agentId: string, fn: (registry: RepoRegistry) => Promise<T> | T): Promise<T> {
    return withKeyedLock(`repos-file:${agentId}`, async () => {
        const registry = readRegistry(agentId)
        const result = await fn(registry)
        writeRegistry(agentId, registry)
        return result
    })
}
