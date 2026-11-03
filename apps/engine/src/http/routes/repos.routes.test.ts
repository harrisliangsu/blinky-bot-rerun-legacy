import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'rerun-repo-routes-'))
process.env.RERUN_DATA_DIR = join(root, 'data')
process.env.RERUN_API_KEY = ''
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GIT_CONFIG_GLOBAL = join(root, 'gitconfig')
process.env.HOME = join(root, 'home')
mkdirSync(process.env.HOME, { recursive: true })
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '')
delete process.env.RERUN_GIT_ALLOW_FILE

const { beforeAll, describe, expect, it } = await import('vitest')
const { writeFile } = await import('node:fs/promises')
const { createServer } = await import('../server.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { agentDir } = await import('../../config/paths.js')
const { migrate } = await import('../../db/migrate.js')
const { runGit } = await import('../../workspace/git.js')

const app = createServer()
const bare = join(root, 'origin.git')

async function git(args: string[], cwd?: string): Promise<void> {
    const result = await runGit(args, { cwd, timeoutMs: 30_000 })
    if (result.code !== 0) throw new Error(result.stderr)
}

beforeAll(async () => {
    await migrate()
    const seed = join(root, 'seed')
    await git(['init', '--bare', '-b', 'main', bare])
    await git(['init', '-b', 'main', seed])
    await git(['config', 'user.email', 'test@example.com'], seed)
    await git(['config', 'user.name', 'Test'], seed)
    await writeFile(join(seed, 'README'), 'route\n')
    await git(['add', 'README'], seed)
    await git(['commit', '-m', 'init'], seed)
    await git(['remote', 'add', 'origin', bare], seed)
    await git(['push', 'origin', 'main'], seed)
    for (const id of ['route-a', 'route-b']) {
        mkdirSync(agentDir(id), { recursive: true })
        await writeAgentConfig(id, agentConfigSchema.parse({ name: id }))
    }
})

function send(method: string, path: string, body?: unknown) {
    return app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

describe('repo routes', () => {
    it('rejects a file URL unless the test flag is on, and does not create a checkout', async () => {
        delete process.env.RERUN_GIT_ALLOW_FILE
        const res = await send('POST', '/agents/route-a/repos', { source: 'url', url: `file://${bare}` })
        expect(res.status).toBe(400)
        const listed = (await (await send('GET', '/agents/route-a/repos')).json()) as { repos: unknown[] }
        expect(listed.repos).toEqual([])
    })

    it('clones through the HTTP API, isolates two agents, and deletes the tree with the agent', async () => {
        process.env.RERUN_GIT_ALLOW_FILE = '1'
        const created = await send('POST', '/agents/route-a/repos', { source: 'url', url: `file://${bare}` })
        expect(created.status).toBe(201)
        const repo = (await created.json()) as { id: string; path: string; status: string; branch: string }
        expect(repo.status).toBe('ready')
        expect(repo.branch.startsWith('blinky/')).toBe(true)
        const other = await send('POST', '/agents/route-b/repos', { source: 'url', url: `file://${bare}` })
        const second = (await other.json()) as { path: string }
        expect(second.path).not.toBe(repo.path)
        const workspace = (await (await send('GET', '/agents/route-a/workspace')).json()) as { workspacePath: string; activeRepo: { path: string } | null; runs: unknown[]; processes: unknown[] }
        expect(workspace.activeRepo?.path).toBe(repo.path)
        expect(workspace.runs).toEqual([])
        expect(workspace.processes).toEqual([])
        const removed = await send('DELETE', `/agents/route-a`)
        expect(removed.status).toBe(200)
        const gone = await send('GET', '/agents/route-a/repos')
        expect(gone.status).toBe(404)
    })

    it('reports a no-permission URL without a ready checkout', async () => {
        process.env.RERUN_GIT_ALLOW_FILE = '1'
        const blocked = join(root, 'blocked.git')
        await git(['init', '--bare', '-b', 'main', blocked])
        chmodSync(blocked, 0o000)
        try {
            const res = await send('POST', '/agents/route-b/repos/test', { url: `file://${blocked}` })
            expect(res.status).toBe(403)
            const body = (await res.json()) as { error: string }
            expect(body.error).toMatch(/permission|access rights|does not store/i)
            const listed = (await (await send('GET', '/agents/route-b/repos')).json()) as { repos: Array<{ remote: string }> }
            expect(listed.repos.some(repo => repo.remote.includes('blocked.git'))).toBe(false)
        } finally {
            chmodSync(blocked, 0o700)
        }
    })
})
