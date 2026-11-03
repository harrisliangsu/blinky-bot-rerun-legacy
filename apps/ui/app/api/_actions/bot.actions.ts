'use server'

import { assertAgentInWorkspace, assertSpaceInWorkspace, requireWorkspaceId } from '@/app/api/_auth/ownership'
import { updateAgentConfigAction } from '@/app/api/_actions/agent.actions'
import { createAgent, renameAgent } from '@/app/api/_services/agent.service'
import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import { botConfigPatch, botDraftSchema } from '@/lib/blinky/bot-draft'
import { getAgent as engineGetAgent, listEngineAgents } from '@/lib/engine/client'
import { LOCAL_SPACE_ID, LOCAL_WORKSPACE_ID } from '@/lib/local-auth/constants'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'

export async function createBotAction(input: unknown): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
    try {
        const draft = botDraftSchema.parse(input)
        const workspaceId = await requireWorkspaceId()
        if (!isBlinkyLocalAuth()) return { ok: false, error: 'Create a Bot from the list on this Mac.' }
        await assertSpaceInWorkspace(LOCAL_SPACE_ID)
        const persona = draft.persona.trim()
        const agent = await createAgent({
            name: draft.name,
            description: persona.slice(0, 280),
            soulMd: persona || undefined,
            workspaceId,
            spaceId: LOCAL_SPACE_ID,
            config: botConfigPatch(draft),
        })
        return { ok: true, agentId: agent.id }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not create this Bot' }
    }
}

export async function saveBotAction(agentId: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const draft = botDraftSchema.parse(input)
        await assertAgentInWorkspace(agentId)
        await renameAgent(agentId, draft.name)
        const saved = await updateAgentConfigAction(agentId, { soul: draft.persona, ...botConfigPatch(draft) })
        return saved.success ? { ok: true } : { ok: false, error: saved.error ?? 'Could not save this Bot' }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not save this Bot' }
    }
}

export async function listBotFacesAction(): Promise<{ id: string; emoji: string; image: string }[]> {
    if (!isBlinkyLocalAuth()) return []
    await requireWorkspaceId()
    const conn = await getWorkspaceConnection(LOCAL_WORKSPACE_ID)
    const listed = await listEngineAgents(conn).catch(() => [])
    return Promise.all(
        listed.map(async row => {
            try {
                const detail = await engineGetAgent(conn, row.id)
                return { id: row.id, emoji: detail.config.avatar?.emoji ?? row.avatarEmoji ?? '', image: detail.config.avatar?.image ?? '' }
            } catch {
                return { id: row.id, emoji: row.avatarEmoji ?? '', image: '' }
            }
        }),
    )
}
