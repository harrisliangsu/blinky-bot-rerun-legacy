'use client'

import { useEffect, useState } from 'react'

import { getAgentDetailAction } from '@/app/api/_actions/agent.actions'
import { createBotAction, saveBotAction } from '@/app/api/_actions/bot.actions'
import { DeleteAgentDialog } from '@/components/dialogs/DeleteAgentDialog'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { emptyBotDraft, type BotDraft } from '@/lib/blinky/bot-draft'
import { useBotCopy } from '@/lib/blinky/bot-locale'
import { useLocalAuthMode } from '@/lib/local-auth/mode-context'
import { useBoardStore } from '@/stores/board.store'
import { useSession } from '@/supabase/session/SessionProvider'

import { BotAvatarField } from './BotAvatarField'
import { BotModelField } from './BotModelField'

export function BotEditorForm({ agentId, onOpenChange, onSaved }: { agentId: string | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    const copy = useBotCopy()
    const localAuth = useLocalAuthMode()
    const { workspace } = useSession()
    const hydrate = useBoardStore(s => s.hydrate)
    const openAgentChat = useBoardStore(s => s.openAgentChat)
    const agentName = useBoardStore(s => s.agents.find(entry => entry.id === agentId)?.name ?? '')
    const [draft, setDraft] = useState<BotDraft>(() => ({ ...emptyBotDraft(), name: agentName }))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const creating = agentId == null

    useEffect(() => {
        if (!agentId) return
        let cancelled = false
        void getAgentDetailAction(agentId).then(detail => {
            if (cancelled || !detail) return
            setDraft({
                name: detail.config.displayName?.trim() || agentName || detail.config.name,
                persona: detail.soul,
                model: detail.config.model,
                provider: detail.config.provider,
                connectionId: detail.config.connectionId,
                avatar: detail.config.avatar ?? { emoji: '', image: '' },
            })
        })
        return () => {
            cancelled = true
        }
    }, [agentId, agentName])

    async function save() {
        const name = draft.name.trim()
        if (!name) return
        setSaving(true)
        setError(null)
        const payload = { ...draft, name, avatar: draft.avatar ?? { emoji: '', image: '' } }
        const result = creating ? await createBotAction(payload) : await saveBotAction(agentId, payload)
        setSaving(false)
        if (!result.ok) {
            setError(result.error)
            return
        }
        if (workspace) await hydrate(workspace.id, { local: localAuth })
        onSaved()
        onOpenChange(false)
        if (creating && 'agentId' in result && typeof result.agentId === 'string') openAgentChat(result.agentId)
    }

    return (
        <DialogContent data-testid="bot-editor" className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="px-4 pt-4 sm:px-6">
                <DialogTitle>{creating ? copy.newBot : copy.editBot}</DialogTitle>
                <DialogDescription>{copy.personaHint}</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
                <Input data-testid="bot-name" label={copy.name} hideRequired value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
                <BotAvatarField copy={copy} name={draft.name} value={draft.avatar ?? { emoji: '', image: '' }} onChange={avatar => setDraft(current => ({ ...current, avatar }))} />
                <Textarea data-testid="bot-persona" label={copy.persona} helperText={copy.personaHint} value={draft.persona} onChange={event => setDraft(current => ({ ...current, persona: event.target.value }))} className="min-h-32" />
                <BotModelField copy={copy} value={{ connectionId: draft.connectionId, model: draft.model, provider: draft.provider }} onChange={choice => setDraft(current => ({ ...current, ...choice }))} />
                {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter className="flex-wrap gap-2 border-t px-4 py-3 sm:px-6">
                {!creating && agentId && (
                    <DeleteAgentDialog agentId={agentId} agentName={draft.name.trim() || agentName}>
                        <Button type="button" variant="destructive" data-testid="bot-delete">
                            {copy.delete}
                        </Button>
                    </DeleteAgentDialog>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {copy.cancel}
                </Button>
                <Button type="button" data-testid="bot-save" loading={saving} disabled={!draft.name.trim()} onClick={() => void save()}>
                    {creating ? copy.create : copy.save}
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}
