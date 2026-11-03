import type { AgentSchedule } from '@/lib/board/next-runs'
import { listSchedules } from '@/lib/engine/client'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle, selectMany } from '@/supabase/supabase-helpers'
import { findWorkspaceEngine } from './workspace-engine.service'

// The engine only lists schedules per agent, so this fans out over the workspace's agents on its one
// machine. An agent whose call fails drops out rather than emptying the whole board.
export async function listWorkspaceSchedules(workspaceId: number): Promise<AgentSchedule[]> {
    if (isBlinkyLocalAuth()) {
        const engine = await findWorkspaceEngine(workspaceId)
        if (!engine) return []
        try {
            const res = await fetch(`${engine.conn.baseUrl}/agents`, {
                signal: AbortSignal.timeout(8000),
                headers: engine.conn.apiKey ? { authorization: `Bearer ${engine.conn.apiKey}` } : {},
            })
            if (!res.ok) return []
            const body = (await res.json()) as { agents?: { id: string }[] }
            const perAgent = await Promise.allSettled(
                (body.agents ?? []).map(async agent => {
                    const schedules = await listSchedules(engine.conn, agent.id)
                    return schedules.map(({ slug, name, cron, runAt, timezone, enabled, lastRunAt }): AgentSchedule => ({ agentId: agent.id, slug, name, cron, runAt, timezone, enabled, lastRunAt }))
                }),
            )
            return perAgent.flatMap(result => (result.status === 'fulfilled' ? result.value : []))
        } catch {
            return []
        }
    }
    const supabase = createServiceRoleClient()
    const [{ data: agents }, { data: workspace }] = await Promise.all([
        selectMany(supabase, 'agents', ['id', 'engine_agent_id', 'disabled_at'] as const, { workspace_id: workspaceId }),
        selectMaybeSingle(supabase, 'workspaces', ['boxes_disabled_at', 'boxes_archived_at'] as const, { id: workspaceId }),
    ])

    const runnable = (agents ?? []).filter(agent => agent.engine_agent_id && !agent.disabled_at)
    if (runnable.length === 0 || workspace?.boxes_disabled_at || workspace?.boxes_archived_at) return []

    const engine = await findWorkspaceEngine(workspaceId)
    if (!engine) return []

    const perAgent = await Promise.allSettled(
        runnable.map(async agent => {
            const schedules = await listSchedules(engine.conn, agent.engine_agent_id as string)
            return schedules.map(({ slug, name, cron, runAt, timezone, enabled, lastRunAt }): AgentSchedule => ({ agentId: agent.id, slug, name, cron, runAt, timezone, enabled, lastRunAt }))
        })
    )
    return perAgent.flatMap(result => (result.status === 'fulfilled' ? result.value : []))
}
