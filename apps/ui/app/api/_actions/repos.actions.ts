'use server'

import { getAgentChatTarget } from '@/app/api/_services/chat.service'
import {
    attachAgentRepo,
    clearAgentRepoCache,
    fetchAgentRepo,
    gcAgentRepos,
    listAgentRepos,
    listGithubReposForAgent,
    removeAgentRepo,
    setActiveAgentRepo,
    testAgentRepo,
} from '@/lib/engine/client'
import type { EngineAgentRepo, EngineAgentRepoList, EngineGithubRepoList } from '@/lib/engine/types'

export type RepoAction<T> = { ok: true; data: T } | { ok: false; error: string }

function failure(err: unknown, fallback: string): RepoAction<never> {
    if (err instanceof Error) {
        const match = err.message.match(/\{[\s\S]*\}$/)
        if (match) {
            try {
                const body = JSON.parse(match[0]) as { error?: string }
                if (body.error) return { ok: false, error: body.error }
            } catch {
                return { ok: false, error: err.message }
            }
        }
        return { ok: false, error: err.message }
    }
    return { ok: false, error: fallback }
}

export async function listAgentReposAction(agentId: string): Promise<RepoAction<EngineAgentRepoList>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        return { ok: true, data: await listAgentRepos(conn, engineAgentId) }
    } catch (err) {
        return failure(err, 'Could not load repositories.')
    }
}

export async function attachAgentRepoAction(agentId: string, body: { source: 'url'; url: string } | { source: 'github'; nameWithOwner: string }): Promise<RepoAction<EngineAgentRepo>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        return { ok: true, data: await attachAgentRepo(conn, engineAgentId, body) }
    } catch (err) {
        return failure(err, 'Could not attach that repository.')
    }
}

export async function testAgentRepoAction(agentId: string, url: string): Promise<RepoAction<{ remote: string; defaultBranch: string }>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        const result = await testAgentRepo(conn, engineAgentId, url)
        return { ok: true, data: { remote: result.remote, defaultBranch: result.defaultBranch } }
    } catch (err) {
        return failure(err, 'Could not reach that repository.')
    }
}

export async function listGithubReposAction(agentId: string): Promise<RepoAction<EngineGithubRepoList>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        return { ok: true, data: await listGithubReposForAgent(conn, engineAgentId) }
    } catch (err) {
        return failure(err, 'Could not list GitHub repositories.')
    }
}

export async function fetchAgentRepoAction(agentId: string, repoId: string): Promise<RepoAction<EngineAgentRepo>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        return { ok: true, data: await fetchAgentRepo(conn, engineAgentId, repoId) }
    } catch (err) {
        return failure(err, 'Could not update that repository.')
    }
}

export async function setActiveAgentRepoAction(agentId: string, repoId: string | null): Promise<RepoAction<EngineAgentRepoList>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        return { ok: true, data: await setActiveAgentRepo(conn, engineAgentId, repoId) }
    } catch (err) {
        return failure(err, 'Could not change the working repository.')
    }
}

export async function removeAgentRepoAction(agentId: string, repoId: string): Promise<RepoAction<{ ok: true }>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        await removeAgentRepo(conn, engineAgentId, repoId)
        return { ok: true, data: { ok: true } }
    } catch (err) {
        return failure(err, 'Could not remove that repository.')
    }
}

export async function gcAgentReposAction(agentId: string): Promise<RepoAction<{ removed: number; skipped: number }>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        const result = await gcAgentRepos(conn, engineAgentId)
        return { ok: true, data: { removed: result.removed ?? 0, skipped: result.skipped ?? 0 } }
    } catch (err) {
        return failure(err, 'Could not remove unused checkouts.')
    }
}

export async function clearAgentRepoCacheAction(agentId: string): Promise<RepoAction<{ removed: number }>> {
    try {
        const { conn, engineAgentId } = await getAgentChatTarget(agentId)
        const result = await clearAgentRepoCache(conn, engineAgentId)
        return { ok: true, data: { removed: result.removed ?? 0 } }
    } catch (err) {
        return failure(err, 'Could not clear the repository cache.')
    }
}
