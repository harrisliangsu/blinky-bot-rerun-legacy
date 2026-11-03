'use client'

import { useMemo } from 'react'

import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BotCopy } from '@/lib/blinky/bot-copy'
import type { BotModelChoice } from '@/lib/blinky/bot-draft'
import { connectionGroups } from '@/lib/engine/model-groups'
import { useWorkspaceConnections } from '@/hooks/useWorkspaceConnections'
import { isPremiumModelEntitled } from '@/cloud/billing'
import { useSession } from '@/supabase/session/SessionProvider'

const DEFAULT_VALUE = 'default'

function keyOf(choice: BotModelChoice): string {
    if (!choice.model || !choice.connectionId) return DEFAULT_VALUE
    return `${choice.connectionId}\t${choice.model}\t${choice.provider ?? ''}`
}

export function BotModelField({ copy, value, onChange }: { copy: BotCopy; value: BotModelChoice; onChange: (next: BotModelChoice) => void }) {
    const { connections, loading } = useWorkspaceConnections()
    const { workspace } = useSession()
    const premiumAllowed = !workspace || isPremiumModelEntitled(workspace)
    const groups = useMemo(() => connectionGroups(connections, premiumAllowed), [connections, premiumAllowed])

    return (
        <Field label={copy.model} helperText={groups.length === 0 && !loading ? copy.modelEmpty : undefined}>
            <Select
                value={keyOf(value)}
                onValueChange={next => {
                    if (next === DEFAULT_VALUE) {
                        onChange({ connectionId: null, model: null, provider: null })
                        return
                    }
                    const [connectionId, model, provider] = next.split('\t')
                    const group = groups.find(entry => entry.connectionId === connectionId)
                    onChange({ connectionId, model, provider: (group?.provider ?? (provider || null)) as BotModelChoice['provider'] })
                }}
            >
                <SelectTrigger data-testid="bot-model" className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={DEFAULT_VALUE}>{copy.modelDefault}</SelectItem>
                    {groups.flatMap(group =>
                        group.models.map(model => (
                            <SelectItem key={`${group.connectionId}:${model.id}`} value={`${group.connectionId}\t${model.id}\t${group.provider}`}>
                                {group.label} · {model.label}
                            </SelectItem>
                        )),
                    )}
                </SelectContent>
            </Select>
        </Field>
    )
}
