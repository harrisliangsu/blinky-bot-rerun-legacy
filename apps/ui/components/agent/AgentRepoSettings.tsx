'use client'

import { attachAgentRepoAction, clearAgentRepoCacheAction, fetchAgentRepoAction, gcAgentReposAction, listAgentReposAction, listGithubReposAction, removeAgentRepoAction, setActiveAgentRepoAction, testAgentRepoAction } from '@/app/api/_actions/repos.actions'
import { AgentRepoRow } from '@/components/agent/AgentRepoRow'
import { AgentReposSkeleton } from '@/components/agent/AgentReposSkeleton'
import { GithubRepoPicker } from '@/components/agent/GithubRepoPicker'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AgentRepoList, GithubRepo } from '@rerun/contracts'
import { useCallback, useEffect, useState } from 'react'

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export function AgentRepoSettings({ agentId }: { agentId: string }) {
    const [loading, setLoading] = useState(true)
    const [agentKey, setAgentKey] = useState(agentId)
    const [list, setList] = useState<AgentRepoList | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState<string | null>(null)
    const [github, setGithub] = useState<GithubRepo[] | null>(null)

    const reload = useCallback(async () => {
        const result = await listAgentReposAction(agentId)
        if (!result.ok) {
            setError(result.error)
            return
        }
        setList(result.data)
        setError(null)
    }, [agentId])

    if (agentKey !== agentId) {
        setAgentKey(agentId)
        setLoading(true)
        setList(null)
        setError(null)
        setGithub(null)
    }

    useEffect(() => {
        let cancelled = false
        reload().finally(() => {
            if (!cancelled) setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [reload])

    async function run(key: string, task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
        setBusy(key)
        setError(null)
        const result = await task()
        if (!result.ok) setError(result.error)
        await reload()
        setBusy(null)
    }

    if (loading && !list) return <AgentReposSkeleton />

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Repositories</p>
                <p className="text-xs text-muted-foreground">
                    {formatBytes(list?.disk.bytes ?? 0)} of {formatBytes(list?.disk.quotaBytes ?? 0)}
                </p>
            </div>
            {error ? <p className="break-words text-xs text-destructive">{error}</p> : null}
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {list?.repos.map(repo => (
                    <AgentRepoRow
                        key={repo.id}
                        repo={repo}
                        busy={busy === repo.id}
                        onUse={() => void run(repo.id, () => setActiveAgentRepoAction(agentId, repo.id))}
                        onRefresh={() => void run(repo.id, () => fetchAgentRepoAction(agentId, repo.id))}
                        onRemove={() => void run(repo.id, () => removeAgentRepoAction(agentId, repo.id))}
                    />
                ))}
                {list && list.repos.length === 0 ? <p className="text-xs text-muted-foreground">No repositories yet. Runs use this coworker&apos;s workspace until you attach one.</p> : null}
            </div>
            <Input label="Git URL" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/org/repo.git or git@host:org/repo.git" />
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    loading={busy === 'add'}
                    onClick={() =>
                        void run('add', async () => {
                            const result = await attachAgentRepoAction(agentId, { source: 'url', url })
                            if (result.ok) setUrl('')
                            return result
                        })
                    }
                >
                    Add repository
                </Button>
                <Button type="button" size="sm" variant="outline" loading={busy === 'test'} onClick={() => void run('test', () => testAgentRepoAction(agentId, url))}>
                    Test access
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={busy === 'github'}
                    onClick={() =>
                        void run('github', async () => {
                            const result = await listGithubReposAction(agentId)
                            if (!result.ok) return result
                            setGithub(result.data.repos)
                            return { ok: true as const }
                        })
                    }
                >
                    Browse GitHub
                </Button>
            </div>
            {github ? (
                <GithubRepoPicker
                    repos={github}
                    disabled={busy !== null}
                    onPick={repo =>
                        void run(`gh:${repo.nameWithOwner}`, async () => {
                            const result = await attachAgentRepoAction(agentId, { source: 'github', nameWithOwner: repo.nameWithOwner })
                            return result
                        })
                    }
                />
            ) : null}
            <div className="flex flex-wrap gap-2">
                {list?.repos.some(repo => repo.active) ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('root', () => setActiveAgentRepoAction(agentId, null))}>
                        Use workspace root
                    </Button>
                ) : null}
                <ConfirmDialog title="Remove unused checkouts?" description="Idle task checkouts with no local changes are deleted. Remotes are left as they are." confirmLabel="Remove unused" onConfirm={() => void run('gc', () => gcAgentReposAction(agentId))}>
                    <Button type="button" size="sm" variant="outline">
                        Remove unused checkouts
                    </Button>
                </ConfirmDialog>
                <ConfirmDialog title="Clear repository cache?" description="Every checkout for this coworker is deleted from disk. Remotes are not changed, and you can attach them again." confirmLabel="Clear cache" onConfirm={() => void run('clear', () => clearAgentRepoCacheAction(agentId))}>
                    <Button type="button" size="sm" variant="outline">
                        Clear repository cache
                    </Button>
                </ConfirmDialog>
            </div>
        </div>
    )
}
