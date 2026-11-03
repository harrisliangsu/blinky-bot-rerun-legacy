import { Skeleton } from '@/components/ui/skeleton'

export function AgentReposSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-full max-w-sm" />
                    <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-8 w-16" />
                </div>
            </div>
            <Skeleton className="h-9 w-full" />
            <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-32" />
            </div>
        </div>
    )
}
