'use client'

import { Button } from '@/components/ui/button'
import type { GithubRepo } from '@rerun/contracts'

type GithubRepoPickerProps = {
    repos: GithubRepo[]
    disabled: boolean
    onPick: (repo: GithubRepo) => void
}

export function GithubRepoPicker({ repos, disabled, onPick }: GithubRepoPickerProps) {
    if (repos.length === 0) {
        return <p className="text-xs text-muted-foreground">No GitHub repositories were returned for this login.</p>
    }
    return (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
            {repos.map(repo => (
                <Button key={repo.nameWithOwner} type="button" variant="ghost" size="sm" disabled={disabled} className="h-auto w-full justify-start px-2 py-1.5 text-left" onClick={() => onPick(repo)}>
                    <span className="flex min-w-0 flex-col items-start">
                        <span className="max-w-full truncate text-xs font-medium">{repo.nameWithOwner}</span>
                        {repo.description ? <span className="max-w-full truncate text-xs text-muted-foreground">{repo.description}</span> : null}
                    </span>
                </Button>
            ))}
        </div>
    )
}
