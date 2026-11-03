import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'rerun-repos-'))
process.env.RERUN_DATA_DIR = join(root, 'data')
process.env.RERUN_GIT_ALLOW_FILE = '1'
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GIT_CONFIG_GLOBAL = join(root, 'gitconfig')
process.env.HOME = join(root, 'home')
mkdirSync(process.env.HOME, { recursive: true })
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '')

const { afterAll, beforeAll, describe, expect, it } = await import('vitest')
const { access, readFile, rm, writeFile } = await import('node:fs/promises')
const { agentConfigSchema } = await import('../agents/types.js')
const { writeAgentConfig } = await import('../agents/config-write.js')
const { agentDir, reposDir, workspaceDir } = await import('../config/paths.js')
const { runGit } = await import('./git.js')
const { attachRepo, clearRepoCache, ensureTaskWorktree, gcAgentRepos, listAgentRepos } = await import('./provision.js')
const { readRegistry, writeRegistry } = await import('./registry.js')
const { describeAgentWorkspace } = await import('./runs.js')

const bare = join(root, 'origin.git')
const locked = join(root, 'locked.git')

async function git(args: string[], cwd?: string): Promise<void> {
    const result = await runGit(args, { cwd, timeoutMs: 30_000 })
    if (result.code !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr}`)
}

async function seedBare(target: string): Promise<void> {
    const seed = join(root, `seed-${target.split('/').at(-1)}`)
    await git(['init', '--bare', '-b', 'main', target])
    await git(['init', '-b', 'main', seed])
    await git(['config', 'user.email', 'test@example.com'], seed)
    await git(['config', 'user.name', 'Test'], seed)
    await writeFile(join(seed, 'README'), 'from-origin\n')
    await git(['add', 'README'], seed)
    await git(['commit', '-m', 'init'], seed)
    await git(['remote', 'add', 'origin', target], seed)
    await git(['push', 'origin', 'main'], seed)
}

async function prepare(id: string, name: string): Promise<void> {
    mkdirSync(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name }))
}

beforeAll(async () => {
    await seedBare(bare)
    await seedBare(locked)
    const fileUrl = `file://${bare}`
    writeFileSync(
        process.env.GIT_CONFIG_GLOBAL!,
        `[url "${fileUrl}"]\n\tinsteadOf = https://git.fixture.invalid/widget.git\n\tinsteadOf = ssh://git@git.fixture.invalid/widget.git\n\tinsteadOf = git@git.fixture.invalid:widget.git\n`,
    )
    await prepare('agent-a', 'Ada Lovelace')
    await prepare('agent-b', 'Grace Hopper')
    await prepare('agent-c', 'Https Fixture')
    await prepare('agent-d', 'Ssh Fixture')
})

afterAll(() => {
    chmodSync(locked, 0o700)
})

describe('repository provisioning', () => {
    it('clones a file URL into the agent workspace and reuses it', async () => {
        const first = await attachRepo('agent-a', { source: 'url', url: `file://${bare}` }, true)
        const again = await attachRepo('agent-a', { source: 'url', url: `file://${bare}` }, true)
        expect(again.id).toBe(first.id)
        expect(first.branch).toBe('blinky/ada-lovelace/workspace')
        expect(first.path.startsWith(reposDir('agent-a'))).toBe(true)
        expect(await readFile(join(first.path, 'README'), 'utf8')).toBe('from-origin\n')
        expect(first.active).toBe(true)
        const snap = describeAgentWorkspace('agent-a')
        expect(snap.workspacePath).toBe(workspaceDir('agent-a'))
        expect(snap.activeRepo?.path).toBe(first.path)
        expect(readFileSync(join(workspaceDir('agent-a'), '.blinky', 'repos.json'), 'utf8')).not.toMatch(/:\/\/[^/\s]+:[^/\s@]+@/)
    })

    it('gives a second agent its own worktree for the same remote', async () => {
        const mine = await attachRepo('agent-b', { source: 'url', url: `file://${bare}` }, true)
        const theirs = (await listAgentRepos('agent-a')).repos[0]
        expect(mine.path).not.toBe(theirs.path)
        await writeFile(join(mine.path, 'only-b.txt'), 'b')
        await expect(access(join(theirs.path, 'only-b.txt'))).rejects.toThrow()
        expect(mine.branch).toBe('blinky/grace-hopper/workspace')
    })

    it('clones https-shaped and ssh-shaped URLs through a local insteadOf fixture', async () => {
        const https = await attachRepo('agent-c', { source: 'url', url: 'https://git.fixture.invalid/widget.git' })
        const ssh = await attachRepo('agent-d', { source: 'url', url: 'ssh://git@git.fixture.invalid/widget.git' })
        expect(https.path).not.toBe(ssh.path)
        expect(await readFile(join(https.path, 'README'), 'utf8')).toBe('from-origin\n')
        expect(await readFile(join(ssh.path, 'README'), 'utf8')).toBe('from-origin\n')
        await writeFile(join(https.path, 'only-c.txt'), 'c')
        await expect(access(join(ssh.path, 'only-c.txt'))).rejects.toThrow()
    })

    it('rejects a repository the user cannot read and leaves no checkout', async () => {
        chmodSync(locked, 0o000)
        const slug = 'locked'
        await expect(attachRepo('agent-a', { source: 'url', url: `file://${locked}` }, true)).rejects.toThrow(/permission|access rights|does not store/i)
        const names = (await listAgentRepos('agent-a')).repos.map(repo => repo.slug)
        expect(names).not.toContain(slug)
        await expect(access(join(reposDir('agent-a'), slug))).rejects.toThrow()
        expect((await listAgentRepos('agent-a')).repos.every(repo => repo.status !== 'error' || repo.remote !== `file://${locked}`)).toBe(true)
    })

    it('checks out a task branch in its own worktree and garbage-collects an idle one', async () => {
        const repo = (await listAgentRepos('agent-a')).repos[0]
        const task = await ensureTaskWorktree('agent-a', repo.id, 'fix-login')
        expect(task.branch).toBe('blinky/ada-lovelace/fix-login')
        expect(task.path).toContain('@fix-login')
        await writeFile(join(task.path, 'task.txt'), 'task')
        await expect(access(join(repo.path, 'task.txt'))).rejects.toThrow()
        await rm(join(task.path, 'task.txt'))
        const registry = readRegistry('agent-a')
        const row = registry.repos.find(item => item.id === repo.id)
        const checkout = row?.checkouts.find(item => item.dirname.endsWith('@fix-login'))
        if (!checkout || !row) throw new Error('missing worktree')
        checkout.lastUsedAt = '2000-01-01T00:00:00.000Z'
        writeRegistry('agent-a', registry)
        const collected = await gcAgentRepos('agent-a', { olderThanMs: 1_000, now: Date.now() })
        expect(collected.removed).toBeGreaterThan(0)
        await expect(access(task.path)).rejects.toThrow()
        await expect(access(repo.path)).resolves.toBeUndefined()
    })

    it('clears the cache and the agent directory delete removes what remains', async () => {
        const cleared = await clearRepoCache('agent-b')
        expect(cleared.removed).toBeGreaterThan(0)
        expect((await listAgentRepos('agent-b')).repos).toEqual([])
        await expect(access(reposDir('agent-b'))).resolves.toBeUndefined()
    })

    it('runs two attaches of one remote without a second checkout', async () => {
        const [left, right] = await Promise.all([
            attachRepo('agent-c', { source: 'url', url: 'https://git.fixture.invalid/widget.git' }),
            attachRepo('agent-c', { source: 'url', url: 'https://git.fixture.invalid/widget.git' }),
        ])
        expect(left.id).toBe(right.id)
        expect((await listAgentRepos('agent-c')).repos.filter(repo => repo.remote.includes('fixture.invalid'))).toHaveLength(1)
    })
})
