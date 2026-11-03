import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import type { AgentRepo, AgentRepoList, AttachRepoInput } from '@rerun/contracts'
import { DEFAULT_REPO_IDLE_DAYS } from '@rerun/contracts'
import { repoLockDir } from '../config/paths.js'
import { readAgentConfig } from '../agents/loader.js'
import { newId, nowIso } from '../lib/ids.js'
import { badRequest, notFound } from '../lib/errors.js'
import { checkoutPath, ensureWorkspaceLayout } from './cwd.js'
import { repoBytes, reposTreeBytes } from './disk.js'
import { classifyGitFailure, GitAccessError } from './git-error.js'
import { gitLfsAvailable, gitOk, lsRemote, runGit } from './git.js'
import { resolveGithubRemote } from './github.js'
import { agentBranch, checkoutDirname, parseGitRemote, repoSlug, sanitizeSlug, type ParsedGitRemote } from './git-url.js'
import { withRepoLock } from './lock.js'
import { readRegistry, withRegistry, type StoredCheckout, type StoredRepo } from './registry.js'

const DAY_MS = 24 * 60 * 60 * 1000

function lockFor(agentId: string, remoteKey: string): string {
    const name = createHash('sha256').update(remoteKey).digest('hex').slice(0, 20)
    return `${repoLockDir(agentId)}/${name}`
}

function insideRepos(agentId: string, target: string): boolean {
    const root = `${ensureWorkspaceLayout(agentId)}/repos`
    const rel = relative(root, target)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function handleFor(agentId: string): Promise<string> {
    try {
        const config = await readAgentConfig(agentId)
        return sanitizeSlug(config.displayName || config.name) || sanitizeSlug(agentId) || 'agent'
    } catch {
        return sanitizeSlug(agentId) || 'agent'
    }
}

function toPublic(agentId: string, repo: StoredRepo, activeRepoId: string | null): AgentRepo {
    const primary = repo.checkouts.find(checkout => checkout.kind === 'primary') ?? repo.checkouts[0]
    return {
        id: repo.id,
        slug: repo.slug,
        remote: repo.remote,
        source: repo.source,
        defaultBranch: repo.defaultBranch,
        branch: repo.branch,
        path: checkoutPath(agentId, primary?.dirname ?? repo.slug),
        status: repo.status,
        error: repo.error,
        warning: repo.warning,
        github: repo.github,
        bytes: repo.bytes,
        lastUsedAt: repo.lastUsedAt,
        active: repo.id === activeRepoId,
    }
}

async function resolveRemote(agentId: string, input: AttachRepoInput, allowFile: boolean): Promise<{ parsed: ParsedGitRemote; github: StoredRepo['github']; defaultBranch: string | null }> {
    if (input.source === 'url') {
        return { parsed: parseGitRemote(input.url, { allowFile, agentId }), github: null, defaultBranch: input.branch ?? null }
    }
    const resolved = await resolveGithubRemote(input.nameWithOwner, { allowFile, agentId })
    return { parsed: resolved.parsed, github: resolved.github, defaultBranch: input.branch ?? resolved.defaultBranch }
}

export async function testRepoAccess(agentId: string, url: string, allowFile = process.env.RERUN_GIT_ALLOW_FILE === '1'): Promise<{ ok: true; remote: string; defaultBranch: string }> {
    const parsed = parseGitRemote(url, { allowFile, agentId })
    const head = await lsRemote(parsed.remote)
    return { ok: true, remote: parsed.remote, defaultBranch: head.defaultBranch }
}

export async function listAgentRepos(agentId: string): Promise<AgentRepoList> {
    ensureWorkspaceLayout(agentId)
    const registry = await withRegistry(agentId, async current => {
        for (const repo of current.repos) repo.bytes = await repoBytes(agentId, repo)
        return current
    })
    return {
        repos: registry.repos.map(repo => toPublic(agentId, repo, registry.activeRepoId)),
        disk: { bytes: registry.repos.reduce((sum, repo) => sum + repo.bytes, 0), quotaBytes: registry.quotaBytes },
        workspacePath: ensureWorkspaceLayout(agentId),
    }
}

export async function attachRepo(agentId: string, input: AttachRepoInput, allowFile = process.env.RERUN_GIT_ALLOW_FILE === '1'): Promise<AgentRepo> {
    ensureWorkspaceLayout(agentId)
    const resolved = await resolveRemote(agentId, input, allowFile)
    const handle = await handleFor(agentId)
    return withRepoLock(`${agentId}:${resolved.parsed.remoteKey}`, lockFor(agentId, resolved.parsed.remoteKey), () => provision(agentId, input.source, resolved, handle))
}

async function provision(agentId: string, source: StoredRepo['source'], resolved: { parsed: ParsedGitRemote; github: StoredRepo['github']; defaultBranch: string | null }, handle: string): Promise<AgentRepo> {
    const existing = readRegistry(agentId).repos.find(repo => repo.remoteKey === resolved.parsed.remoteKey)
    if (existing && existing.status === 'ready' && existsSync(checkoutPath(agentId, existing.slug))) {
        await refreshCheckout(agentId, existing)
        const registry = readRegistry(agentId)
        const repo = registry.repos.find(item => item.id === existing.id) ?? existing
        return toPublic(agentId, repo, registry.activeRepoId)
    }
    const head = await lsRemote(resolved.parsed.remote)
    const defaultBranch = resolved.defaultBranch || head.defaultBranch
    const localBranch = agentBranch(handle, 'workspace')
    const now = nowIso()
    const drafted = await withRegistry(agentId, current => {
        const prior = current.repos.find(repo => repo.remoteKey === resolved.parsed.remoteKey)
        const taken = new Set(current.repos.filter(repo => repo.id !== prior?.id).map(repo => repo.slug))
        const slug = prior?.slug ?? repoSlug(resolved.parsed.repoPath, taken)
        const repo: StoredRepo = prior ?? {
            id: newId(),
            slug,
            remote: resolved.parsed.remote,
            remoteKey: resolved.parsed.remoteKey,
            source,
            defaultBranch,
            branch: localBranch,
            status: 'cloning',
            error: null,
            warning: null,
            github: resolved.github,
            bytes: 0,
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now,
            checkouts: [],
        }
        repo.slug = slug
        repo.remote = resolved.parsed.remote
        repo.source = source
        repo.defaultBranch = defaultBranch
        repo.branch = localBranch
        repo.status = 'cloning'
        repo.error = null
        repo.github = resolved.github
        repo.updatedAt = now
        repo.checkouts = repo.checkouts.filter(checkout => checkout.kind !== 'primary')
        repo.checkouts.unshift({ dirname: slug, branch: localBranch, kind: 'primary', lastUsedAt: null })
        if (!prior) current.repos.push(repo)
        return repo
    })
    try {
        await cloneInto(agentId, drafted, defaultBranch, head.commit !== null)
    } catch (error) {
        await rm(checkoutPath(agentId, drafted.slug), { recursive: true, force: true }).catch(() => {})
        const message = error instanceof Error ? error.message : 'Clone failed.'
        await withRegistry(agentId, current => {
            const row = current.repos.find(item => item.id === drafted.id)
            if (!row) return
            row.status = 'error'
            row.error = message
            row.updatedAt = nowIso()
        })
        throw error
    }
    const saved = await withRegistry(agentId, async current => {
        const row = current.repos.find(item => item.id === drafted.id)
        if (!row) return drafted
        row.status = 'ready'
        row.error = null
        row.bytes = await repoBytes(agentId, row)
        row.lastUsedAt = nowIso()
        row.updatedAt = row.lastUsedAt
        const primary = row.checkouts.find(checkout => checkout.kind === 'primary')
        if (primary) primary.lastUsedAt = row.lastUsedAt
        if (!current.activeRepoId) current.activeRepoId = row.id
        return row
    })
    return toPublic(agentId, saved, readRegistry(agentId).activeRepoId)
}

async function cloneInto(agentId: string, repo: StoredRepo, defaultBranch: string, hasHead: boolean): Promise<void> {
    const dest = checkoutPath(agentId, repo.slug)
    if (!insideRepos(agentId, dest)) throw badRequest('Refusing to clone outside this coworker.')
    await rm(dest, { recursive: true, force: true })
    const lfs = await gitLfsAvailable()
    const args = ['clone', '--recurse-submodules=on-demand']
    if (hasHead) args.push('--branch', defaultBranch)
    args.push('--', repo.remote, dest)
    const result = await runGit(args, { timeoutMs: 5 * 60_000, extraEnv: lfs ? undefined : { GIT_LFS_SKIP_SMUDGE: '1' } })
    if (!(result.code === 0 && !result.timedOut)) {
        await rm(dest, { recursive: true, force: true }).catch(() => {})
        if (/git is not installed/.test(result.stderr)) throw new GitAccessError('failed', 'git is not installed.')
        throw classifyGitFailure(`${result.stderr}\n${result.stdout}`, result.timedOut)
    }
    if (!lfs) {
        await withRegistry(agentId, current => {
            const row = current.repos.find(item => item.id === repo.id)
            if (row) row.warning = 'Git LFS is not installed, so large-file contents were left as pointers.'
        })
    }
    await gitOk(['checkout', '-B', repo.branch], { cwd: dest })
    await runGit(['branch', '--set-upstream-to', `origin/${defaultBranch}`, repo.branch], { cwd: dest })
}

async function refreshCheckout(agentId: string, repo: StoredRepo): Promise<void> {
    const cwd = checkoutPath(agentId, repo.slug)
    await gitOk(['fetch', '--prune', 'origin'], { cwd, timeoutMs: 120_000 })
    const dirty = await runGit(['status', '--porcelain'], { cwd })
    let warning: string | null = null
    if (dirty.stdout.trim()) warning = 'Local changes were kept. Nothing was reset.'
    else {
        const ff = await runGit(['merge', '--ff-only', `origin/${repo.defaultBranch}`], { cwd })
        if (ff.code !== 0) warning = 'Could not fast-forward. Local commits were kept.'
    }
    await withRegistry(agentId, async current => {
        const row = current.repos.find(item => item.id === repo.id)
        if (!row) return
        row.status = 'ready'
        row.error = null
        row.warning = warning
        row.lastUsedAt = nowIso()
        row.updatedAt = row.lastUsedAt
        row.bytes = await repoBytes(agentId, row)
        const primary = row.checkouts.find(checkout => checkout.kind === 'primary')
        if (primary) primary.lastUsedAt = row.lastUsedAt
    })
}

export async function fetchAgentRepo(agentId: string, repoId: string): Promise<AgentRepo> {
    const current = readRegistry(agentId).repos.find(repo => repo.id === repoId)
    if (!current) throw notFound('repository')
    if (!existsSync(checkoutPath(agentId, current.slug))) {
        return attachRepo(agentId, { source: 'url', url: current.remote })
    }
    await withRepoLock(`${agentId}:${current.remoteKey}`, lockFor(agentId, current.remoteKey), () => refreshCheckout(agentId, current))
    const registry = readRegistry(agentId)
    const repo = registry.repos.find(item => item.id === repoId)
    if (!repo) throw notFound('repository')
    return toPublic(agentId, repo, registry.activeRepoId)
}

export async function setActiveRepo(agentId: string, repoId: string | null): Promise<AgentRepoList> {
    await withRegistry(agentId, current => {
        if (repoId === null) {
            current.activeRepoId = null
            return
        }
        const repo = current.repos.find(item => item.id === repoId)
        if (!repo) throw notFound('repository')
        if (repo.status !== 'ready') throw badRequest('That repository is not ready.')
        current.activeRepoId = repo.id
        repo.lastUsedAt = nowIso()
    })
    return listAgentRepos(agentId)
}

export async function removeAgentRepo(agentId: string, repoId: string): Promise<void> {
    const repo = readRegistry(agentId).repos.find(item => item.id === repoId)
    if (!repo) throw notFound('repository')
    await withRepoLock(`${agentId}:${repo.remoteKey}`, lockFor(agentId, repo.remoteKey), async () => {
        await deleteCheckouts(agentId, repo)
        await withRegistry(agentId, current => {
            current.repos = current.repos.filter(item => item.id !== repoId)
            if (current.activeRepoId === repoId) current.activeRepoId = null
        })
    })
}

async function deleteCheckouts(agentId: string, repo: StoredRepo): Promise<void> {
    const ordered = [...repo.checkouts].sort((a, b) => Number(b.kind === 'worktree') - Number(a.kind === 'worktree'))
    for (const checkout of ordered) {
        const path = checkoutPath(agentId, checkout.dirname)
        if (!insideRepos(agentId, path)) throw badRequest('Refusing to delete a checkout outside this coworker.')
        await rm(path, { recursive: true, force: true })
    }
}

export async function ensureTaskWorktree(agentId: string, repoId: string, taskSlug: string): Promise<{ path: string; branch: string }> {
    const repo = readRegistry(agentId).repos.find(item => item.id === repoId)
    if (!repo || repo.status !== 'ready') throw notFound('repository')
    const branch = agentBranch(await handleFor(agentId), taskSlug)
    const dirname = checkoutDirname(repo.slug, taskSlug)
    const path = checkoutPath(agentId, dirname)
    if (!insideRepos(agentId, path)) throw badRequest('That worktree path is outside this coworker.')
    await withRepoLock(`${agentId}:${repo.remoteKey}`, lockFor(agentId, repo.remoteKey), async () => {
        const primary = checkoutPath(agentId, repo.slug)
        if (!existsSync(path)) {
            const exists = await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: primary })
            if (exists.code === 0) await gitOk(['worktree', 'add', '--', path, branch], { cwd: primary })
            else await gitOk(['worktree', 'add', '-b', branch, '--', path, 'HEAD'], { cwd: primary })
        }
        const checkout: StoredCheckout = { dirname, branch, kind: 'worktree', lastUsedAt: nowIso() }
        await withRegistry(agentId, current => {
            const row = current.repos.find(item => item.id === repoId)
            if (!row) return
            row.checkouts = row.checkouts.filter(item => item.dirname !== dirname)
            row.checkouts.push(checkout)
            row.updatedAt = checkout.lastUsedAt ?? nowIso()
        })
    })
    return { path, branch }
}

async function isClean(cwd: string): Promise<boolean> {
    if (!existsSync(cwd)) return true
    const status = await runGit(['status', '--porcelain'], { cwd })
    return status.code === 0 && status.stdout.trim() === ''
}

export async function gcAgentRepos(agentId: string, options: { olderThanMs?: number; now?: number } = {}): Promise<{ ok: true; removed: number; skipped: number }> {
    const olderThanMs = options.olderThanMs ?? DEFAULT_REPO_IDLE_DAYS * DAY_MS
    const now = options.now ?? Date.now()
    let removed = 0
    let skipped = 0
    for (const repo of readRegistry(agentId).repos) {
        const idle = repo.checkouts.filter(checkout => checkout.kind === 'worktree' && stale(checkout.lastUsedAt ?? repo.lastUsedAt ?? repo.createdAt, now, olderThanMs))
        for (const checkout of idle) {
            const path = checkoutPath(agentId, checkout.dirname)
            if (!(await isClean(path))) {
                skipped += 1
                continue
            }
            if (insideRepos(agentId, path)) await rm(path, { recursive: true, force: true })
            await withRegistry(agentId, current => {
                const row = current.repos.find(item => item.id === repo.id)
                if (!row) return
                row.checkouts = row.checkouts.filter(item => item.dirname !== checkout.dirname)
            })
            removed += 1
        }
    }
    let measured = await reposTreeBytes(agentId)
    const quota = readRegistry(agentId).quotaBytes
    if (measured > quota) {
        const activeId = readRegistry(agentId).activeRepoId
        const candidates = readRegistry(agentId).repos.filter(repo => repo.id !== activeId).sort((a, b) => (a.lastUsedAt ?? a.createdAt).localeCompare(b.lastUsedAt ?? b.createdAt))
        for (const repo of candidates) {
            if (measured <= quota) break
            if (!(await isClean(checkoutPath(agentId, repo.slug)))) {
                skipped += 1
                continue
            }
            await deleteCheckouts(agentId, repo)
            await withRegistry(agentId, current => {
                current.repos = current.repos.filter(item => item.id !== repo.id)
                if (current.activeRepoId === repo.id) current.activeRepoId = null
            })
            removed += 1
            measured = await reposTreeBytes(agentId)
        }
    }
    return { ok: true, removed, skipped }
}

function stale(iso: string, now: number, olderThanMs: number): boolean {
    const at = Date.parse(iso)
    return Number.isFinite(at) && now - at >= olderThanMs
}

export async function clearRepoCache(agentId: string): Promise<{ ok: true; removed: number }> {
    const repos = readRegistry(agentId).repos
    for (const repo of repos) await deleteCheckouts(agentId, repo)
    await withRegistry(agentId, current => {
        current.repos = []
        current.activeRepoId = null
    })
    return { ok: true, removed: repos.length }
}
