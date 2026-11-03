import type { AgentRepo } from '@rerun/contracts'
import { Badge, type BadgeTone } from '@rerun/ui/primitives'

const STATUS: Record<AgentRepo['status'], { label: string; tone: BadgeTone }> = {
    cloning: { label: 'Cloning', tone: 'orange' },
    ready: { label: 'Ready', tone: 'green' },
    error: { label: 'Error', tone: 'red' },
}

export function AgentRepoStatusBadge({ repo }: { repo: Pick<AgentRepo, 'status' | 'active'> }) {
    const status = STATUS[repo.status]
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <Badge size="xs" tone={status.tone} glow={false}>
                {status.label}
            </Badge>
            {repo.active ? (
                <Badge size="xs" tone="brand" glow={false}>
                    Active
                </Badge>
            ) : null}
        </span>
    )
}
