'use client'

import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import type { AgentRepo } from '@rerun/contracts'
import { AgentRepoStatusBadge } from '@/components/agent/AgentRepoStatusBadge'

type AgentRepoRowProps = {
    repo: AgentRepo
    busy: boolean
    onUse: () => void
    onRefresh: () => void
    onRemove: () => void
}

export function AgentRepoRow({ repo, busy, onUse, onRefresh, onRemove }: AgentRepoRowProps) {
    return (
        <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{repo.slug}</p>
                <p className="break-all text-xs text-muted-foreground">{repo.remote}</p>
                <p className="truncate text-xs text-muted-foreground">{repo.branch}</p>
                {repo.error ? <p className="break-words text-xs text-destructive">{repo.error}</p> : null}
                {repo.warning ? <p className="break-words text-xs text-muted-foreground">{repo.warning}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <AgentRepoStatusBadge repo={repo} />
                {repo.status === 'ready' && !repo.active ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onUse}>
                        Use for runs
                    </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" loading={busy} onClick={onRefresh}>
                    Refresh
                </Button>
                <ConfirmDialog title="Remove this repository?" description="The checkout is deleted from this coworker's workspace. The remote repository is left as it is." confirmLabel="Remove" onConfirm={onRemove}>
                    <Button type="button" size="sm" variant="outline" disabled={busy}>
                        Remove
                    </Button>
                </ConfirmDialog>
            </div>
        </div>
    )
}
