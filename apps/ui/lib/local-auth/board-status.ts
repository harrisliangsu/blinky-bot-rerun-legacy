import { computeAgentStatus, type IsoAgent, type SessionEntry, type SessionStatus } from '@/lib/board/types'

export type BoardRun = { sessionId: string; status: string; startedAt: string }

// A successful run is `done` on the engine and `idle` on the board: the session enum has no
// `done`. Cancelled is idle too, so Stop clears a conversation that was working or in error.
export function sessionStatusesFromRuns(runs: BoardRun[]): Map<string, SessionStatus> {
    const grouped = new Map<string, BoardRun[]>()
    for (const run of runs) {
        if (!run.sessionId) continue
        const list = grouped.get(run.sessionId) ?? []
        list.push(run)
        grouped.set(run.sessionId, list)
    }
    const statuses = new Map<string, SessionStatus>()
    for (const [sessionId, list] of grouped) {
        const ordered = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        if (ordered.some(run => run.status === 'running')) statuses.set(sessionId, 'working')
        else if (ordered[0]?.status === 'error') statuses.set(sessionId, 'error')
        else statuses.set(sessionId, 'idle')
    }
    return statuses
}

export function sessionsWithRunStatus(sessions: SessionEntry[], runs: BoardRun[] | null): SessionEntry[] {
    if (!runs) return sessions
    const derived = sessionStatusesFromRuns(runs)
    return sessions.map(session => {
        const status = derived.get(session.id)
        return status && status !== session.status ? { ...session, status } : session
    })
}

export function agentStatusForBoard(engineStatus: string | undefined, sessions: SessionEntry[], runsKnown: boolean): IsoAgent['status'] {
    const busy = engineStatus === 'busy' || engineStatus === 'working'
    const online = engineStatus !== 'offline'
    return computeAgentStatus(sessions, online, runsKnown ? false : busy)
}
