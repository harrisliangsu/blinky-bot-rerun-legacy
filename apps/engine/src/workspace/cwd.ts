import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { repoCheckoutDir, reposDir, workspaceDir, workspaceMetaDir } from '../config/paths.js'
import { readRegistry, type StoredRepo } from './registry.js'

export type AgentWorkingDirectory = {
    workspace: string
    cwd: string
    repoPath: string | null
    repoId: string | null
}

function inside(root: string, target: string): boolean {
    const rel = relative(root, target)
    return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export function checkoutPath(agentId: string, dirname: string): string {
    return repoCheckoutDir(agentId, dirname)
}

export function ensureWorkspaceLayout(agentId: string): string {
    const workspace = workspaceDir(agentId)
    mkdirSync(workspace, { recursive: true })
    mkdirSync(reposDir(agentId), { recursive: true })
    mkdirSync(workspaceMetaDir(agentId), { recursive: true })
    return workspace
}

export function activeRepo(agentId: string): StoredRepo | null {
    let registry
    try {
        registry = readRegistry(agentId)
    } catch {
        return null
    }
    if (!registry.activeRepoId) return null
    return registry.repos.find(repo => repo.id === registry.activeRepoId && repo.status === 'ready') ?? null
}

export function agentWorkingDirectory(agentId: string): AgentWorkingDirectory {
    const workspace = ensureWorkspaceLayout(agentId)
    const repo = activeRepo(agentId)
    const primary = repo?.checkouts.find(checkout => checkout.kind === 'primary') ?? repo?.checkouts[0]
    if (repo && primary) {
        const path = checkoutPath(agentId, primary.dirname)
        if (inside(workspace, path) && existsSync(path)) {
            return { workspace, cwd: path, repoPath: path, repoId: repo.id }
        }
    }
    return { workspace, cwd: workspace, repoPath: null, repoId: null }
}

export function resolveCliCwd(agentId: string, requested: string): string {
    const { workspace, cwd } = agentWorkingDirectory(agentId)
    const candidate = requested.trim() ? resolve(requested.trim()) : cwd
    if (inside(workspace, candidate) && existsSync(candidate)) return candidate
    return cwd
}
