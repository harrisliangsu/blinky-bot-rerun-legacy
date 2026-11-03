import type { IsoAgent, SessionEntry, SessionStatus, SpacePublic } from '@/lib/board/types'

import { LOCAL_SPACE_ID, LOCAL_WORKSPACE_ID } from './constants'
import { readLocalWorkspace, type LocalWorkspaceRow } from './db'

type EngineAgent = { id: string; name: string; status?: string; createdAt?: string }
type EngineSession = { id: string; agentId?: string; agent_id?: string; originAgentId?: string | null; status?: string }

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

function agentStatus(status: string | undefined): IsoAgent['status'] {
    if (status === 'busy' || status === 'working') return 'working'
    if (status === 'error') return 'error'
    if (status === 'waiting_human') return 'waiting_human'
    if (status === 'offline') return 'offline'
    return 'idle'
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
    const agents: IsoAgent[] = engineAgents.map((agent, index) => ({
        id: agent.id,
        name: agent.name,
        handle: null,
        description: null,
        templateId: null,
        status: agentStatus(agent.status),
        position: { col: 1 + index * 2, row: 1 },
        workspaceId: LOCAL_WORKSPACE_ID,
        spaceId: LOCAL_SPACE_ID,
        disabledAt: null,
        disabledReason: null,
    }))
    const sessionLists = await Promise.all(agents.map(async agent => (await engineJson<{ sessions?: EngineSession[] }>(workspace, `/agents/${encodeURIComponent(agent.id)}/sessions`))?.sessions ?? []))
    const sessions: SessionEntry[] = sessionLists.flat().map(session => ({
        id: session.id,
        agentId: session.agentId ?? session.agent_id ?? '',
        originAgentId: session.originAgentId ?? null,
        status: sessionStatus(session.status),
    }))
    return { agents, spaces: [LOCAL_SPACE], sessions }
}

export async function findLocalEngineSession(sessionId: string): Promise<{ agentId: string } | null> {
    const workspace = readLocalWorkspace()
    if (!workspace) return null
    const board = await localBoard(workspace)
    const session = board.sessions.find(row => row.id === sessionId)
    return session?.agentId ? { agentId: session.agentId } : null
}
