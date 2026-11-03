import type { AgentRunProcess, AgentWorkspaceSnapshot } from '@rerun/contracts'
import { reposDir } from '../config/paths.js'
import { newId, nowIso } from '../lib/ids.js'
import { agentWorkingDirectory } from './cwd.js'
import { readRegistry, withRegistry } from './registry.js'

type LiveProcess = AgentRunProcess & { agentId: string; kind: 'run' | 'process' }

const live = new Map<string, LiveProcess>()

function snapshotOf(row: LiveProcess): AgentRunProcess {
    return {
        id: row.id,
        runId: row.runId,
        sessionId: row.sessionId,
        runtime: row.runtime,
        cwd: row.cwd,
        workspacePath: row.workspacePath,
        repoPath: row.repoPath,
        pid: row.pid,
        command: row.command,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
    }
}

export type AgentRunHandle = {
    id: string
    end: () => void
    setRuntime: (runtime: string) => void
    setPid: (pid: number | null) => void
}

function track(agentId: string, kind: LiveProcess['kind'], fields: { runId?: string | null; sessionId?: string | null; runtime: string; pid?: number | null; command?: string | null }): AgentRunHandle {
    const dir = agentWorkingDirectory(agentId)
    const row: LiveProcess = {
        id: newId(),
        agentId,
        kind,
        runId: fields.runId ?? null,
        sessionId: fields.sessionId ?? null,
        runtime: fields.runtime,
        cwd: dir.cwd,
        workspacePath: dir.workspace,
        repoPath: dir.repoPath,
        pid: fields.pid ?? null,
        command: fields.command ?? null,
        startedAt: nowIso(),
        endedAt: null,
    }
    live.set(row.id, row)
    if (kind === 'run') noteRepoUse(agentId)
    return {
        id: row.id,
        end() {
            const current = live.get(row.id)
            if (!current) return
            current.endedAt = nowIso()
            live.delete(row.id)
        },
        setRuntime(runtime: string) {
            const current = live.get(row.id)
            if (current) current.runtime = runtime
        },
        setPid(pid: number | null) {
            const current = live.get(row.id)
            if (current) current.pid = pid
        },
    }
}

function noteRepoUse(agentId: string): void {
    let current
    try {
        current = readRegistry(agentId)
    } catch {
        return
    }
    if (!current.activeRepoId) return
    void withRegistry(agentId, registry => {
        const repo = registry.repos.find(item => item.id === registry.activeRepoId)
        if (!repo) return
        repo.lastUsedAt = nowIso()
        const primary = repo.checkouts.find(checkout => checkout.kind === 'primary')
        if (primary) primary.lastUsedAt = repo.lastUsedAt
    }).catch(() => {})
}

export function trackAgentRun(agentId: string, sessionId: string, runId: string): AgentRunHandle {
    return track(agentId, 'run', { runId, sessionId, runtime: 'pending' })
}

export function trackCliProcess(agentId: string, runtime: string, command: string, pid: number | null): AgentRunHandle {
    return track(agentId, 'process', { runtime, command, pid })
}

export function listAgentRuns(agentId: string): AgentRunProcess[] {
    return [...live.values()].filter(row => row.agentId === agentId && row.kind === 'run').map(snapshotOf)
}

export function listCliProcesses(agentId: string): AgentRunProcess[] {
    return [...live.values()].filter(row => row.agentId === agentId && row.kind === 'process').map(snapshotOf)
}

export function releaseAgentWorkspace(agentId: string): void {
    for (const [id, row] of live) {
        if (row.agentId === agentId) live.delete(id)
    }
}

export function describeAgentWorkspace(agentId: string): AgentWorkspaceSnapshot {
    const dir = agentWorkingDirectory(agentId)
    const registry = (() => {
        try {
            return readRegistry(agentId)
        } catch {
            return { version: 1 as const, activeRepoId: null, quotaBytes: 8 * 1024 * 1024 * 1024, repos: [] }
        }
    })()
    const active = registry.repos.find(repo => repo.id === registry.activeRepoId && repo.status === 'ready') ?? null
    const primary = active?.checkouts.find(checkout => checkout.kind === 'primary') ?? active?.checkouts[0]
    return {
        agentId,
        workspacePath: dir.workspace,
        reposDir: reposDir(agentId),
        activeRepo: active
            ? {
                  id: active.id,
                  remote: active.remote,
                  branch: active.branch,
                  path: dir.repoPath ?? (primary ? `${dir.workspace}/repos/${primary.dirname}` : dir.workspace),
              }
            : null,
        disk: {
            bytes: registry.repos.reduce((sum, repo) => sum + repo.bytes, 0),
            quotaBytes: registry.quotaBytes,
        },
        runs: listAgentRuns(agentId),
        processes: listCliProcesses(agentId),
    }
}
