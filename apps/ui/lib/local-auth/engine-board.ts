import type { IsoAgent, SessionEntry, SessionStatus, SpacePublic } from '@/lib/board/types'

import { agentStatusForBoard, sessionsWithRunStatus, type BoardRun } from './board-status'
import { LOCAL_SPACE_ID, LOCAL_WORKSPACE_ID } from './constants'
import { readLocalWorkspace, type LocalWorkspaceRow } from './db'

type EngineAgent = { id: string; name: string; displayName?: string; avatarEmoji?: string; status?: string; createdAt?: string }
type EngineSession = { id: string; agentId?: string; agent_id?: string; originAgentId?: string | null; status?: string }
type EngineRun = { sessionId?: string; session_id?: string; status?: string; startedAt?: string; started_at?: string }

const LOCAL_SPACE: SpacePublic = {
    id: LOCAL_SPACE_ID,
    workspace_id: LOCAL_WORKSPACE_ID,
    name: 'Home',
    col_start: 0,
    row_start: 0,
    col_end: 11,
    row_end: 9,
    created_at: new Date(0).toISOString(),
}

function sessionStatus(status: string | undefined): SessionStatus {
    if (status === 'working' || status === 'error' || status === 'waiting_human' || status === 'awaiting_question' || status === 'awaiting_approval' || status === 'awaiting_connector' || status === 'awaiting_ack') return status
    return 'idle'
}

async function engineJson<T>(workspace: LocalWorkspaceRow, path: string): Promise<T | null> {
    if (!workspace.engine_host) return null
    try {
        const res = await fetch(`${workspace.engine_host.replace(/\/$/, '')}${path}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(4000),
            headers: workspace.engine_api_key ? { authorization: `Bearer ${workspace.engine_api_key}` } : {},
        })
        if (!res.ok) return null
        return (await res.json()) as T
    } catch {
        return null
    }
}

export async function localBoard(workspace: LocalWorkspaceRow): Promise<{ agents: IsoAgent[]; spaces: SpacePublic[]; sessions: SessionEntry[] }> {
    const listed = await engineJson<{ agents?: EngineAgent[] }>(workspace, '/agents')
    const engineAgents = listed?.agents ?? []
    const details = await Promise.all(
        engineAgents.map(async agent => {
            const [listedSessions, listedRuns] = await Promise.all([
                engineJson<{ sessions?: EngineSession[] }>(workspace, `/agents/${encodeURIComponent(agent.id)}/sessions`),
                engineJson<{ runs?: EngineRun[] }>(workspace, `/agents/${encodeURIComponent(agent.id)}/runs?limit=200`),
            ])
            const sessions = (listedSessions?.sessions ?? []).map(session => ({
                id: session.id,
                agentId: session.agentId ?? session.agent_id ?? agent.id,
                originAgentId: session.originAgentId ?? null,
                status: sessionStatus(session.status),
            }))
            const runs = listedRuns ? listedRuns.runs?.map(boardRun) ?? [] : null
            return { agent, sessions: sessionsWithRunStatus(sessions, runs), runsKnown: runs !== null }
        }),
    )
    const agents: IsoAgent[] = details.map(({ agent, sessions, runsKnown }, index) => ({
        id: agent.id,
        name: agent.displayName?.trim() || agent.name,
        handle: agent.name,
        avatarEmoji: agent.avatarEmoji || null,
        description: null,
        templateId: null,
        status: agentStatusForBoard(agent.status, sessions, runsKnown),
        position: { col: 1 + index * 2, row: 1 },
        workspaceId: LOCAL_WORKSPACE_ID,
        spaceId: LOCAL_SPACE_ID,
        disabledAt: null,
        disabledReason: null,
    }))
    const sessions: SessionEntry[] = details.flatMap(detail => detail.sessions)
    return { agents, spaces: [LOCAL_SPACE], sessions }
}

function boardRun(run: EngineRun): BoardRun {
    return { sessionId: run.sessionId ?? run.session_id ?? '', status: run.status ?? '', startedAt: run.startedAt ?? run.started_at ?? '' }
}

export async function findLocalEngineSession(sessionId: string): Promise<{ agentId: string } | null> {
    const workspace = readLocalWorkspace()
    if (!workspace) return null
    const board = await localBoard(workspace)
    const session = board.sessions.find(row => row.id === sessionId)
    return session?.agentId ? { agentId: session.agentId } : null
}
