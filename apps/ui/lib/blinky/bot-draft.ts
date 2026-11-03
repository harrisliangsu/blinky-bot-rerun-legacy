import { agentAvatarSchema, providerSchema, type AgentAvatar, type Provider } from '@rerun/contracts'
import { z } from 'zod'

export const botDraftSchema = z.object({
    name: z.string().trim().min(1).max(60),
    persona: z.string().max(20_000).default(''),
    model: z.string().trim().min(1).nullable().default(null),
    provider: providerSchema.nullable().default(null),
    connectionId: z.string().trim().min(1).nullable().default(null),
    avatar: agentAvatarSchema.nullable().default(null),
})

export type BotDraft = z.infer<typeof botDraftSchema>

export type BotModelChoice = { connectionId: string | null; model: string | null; provider: Provider | null }

export function emptyBotDraft(): BotDraft {
    return { name: '', persona: '', model: null, provider: null, connectionId: null, avatar: { emoji: '', image: '' } }
}

export function botConfigPatch(draft: Pick<BotDraft, 'model' | 'provider' | 'connectionId' | 'avatar'>): {
    model: string | null
    provider: Provider | null
    connectionId: string | null
    avatar?: AgentAvatar
} {
    const avatar = draft.avatar && (draft.avatar.emoji || draft.avatar.image) ? { emoji: draft.avatar.emoji, image: draft.avatar.image } : { emoji: '', image: '' }
    return {
        model: draft.model,
        provider: draft.model ? draft.provider : null,
        connectionId: draft.model ? draft.connectionId : null,
        avatar,
    }
}
