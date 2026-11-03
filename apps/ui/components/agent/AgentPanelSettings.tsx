'use client'

import { getAgentDetailAction, updateAgentConfigAction } from '@/app/api/_actions/agent.actions'
import { PanelDeleteButton, PanelEditorBody, PanelEditorFooter, PanelEditorShell } from '@/components/ui/panel-editor'
import { AgentRepoSettings } from '@/components/agent/AgentRepoSettings'
import { SharedLinksSection } from '@/components/agent/share/SharedLinksSection'
import { TemplateContentLock } from '@/components/agent/TemplateContentLock'
import { useTemplateContentLock } from '@/hooks/useTemplateContentLock'
import { DeleteAgentDialog } from '@/components/dialogs/DeleteAgentDialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SkeletonForm } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import { MarkdownTextarea } from '@/components/ui/markdown-textarea'
import { VERBOSITY_LEVELS, type AgentAvatar } from '@rerun/contracts'
import { BotAvatarField } from '@/components/bot/BotAvatarField'
import { BotModelField } from '@/components/bot/BotModelField'
import { useBotCopy } from '@/lib/blinky/bot-locale'
import { botConfigPatch, type BotModelChoice } from '@/lib/blinky/bot-draft'
import type { IsoAgent } from '@/lib/board/types'
import type { EngineVerbosity } from '@/lib/engine/types'
import { useBoardStore } from '@/stores/board.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { BellIcon, CheckIcon } from '@/lib/icons'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

type AgentPanelSettingsProps = {
    agent: IsoAgent
}

type ConfigValues = { soul: string; verbosity: EngineVerbosity }

const VERBOSITY_LABELS: Record<EngineVerbosity, string> = { minimal: 'Minimal', concise: 'Concise', normal: 'Normal', detailed: 'Detailed' }
const VERBOSITY_OPTIONS = VERBOSITY_LEVELS.map(value => ({ value, label: VERBOSITY_LABELS[value] }))

// Le bouton de sauvegarde vit dans le footer sticky, hors du <form> : il le vise par son id.
const SETTINGS_FORM_ID = 'agent-settings-form'

export function AgentPanelSettings({ agent }: AgentPanelSettingsProps) {
    const copy = useBotCopy()
    const renameAgent = useBoardStore(s => s.renameAgent)
    const openNotifications = useNotificationsStore(s => s.openNotifications)
    const soulLocked = useTemplateContentLock(agent.id)
    const [name, setName] = useState(agent.name)
    const [avatar, setAvatar] = useState<AgentAvatar>({ emoji: '', image: '' })
    const [modelChoice, setModelChoice] = useState<BotModelChoice>({ connectionId: null, model: null, provider: null })
    const [loading, setLoading] = useState(true)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const form = useForm<ConfigValues>({ defaultValues: { soul: '', verbosity: 'normal' } })
    const {
        formState: { isSubmitting },
    } = form

    useEffect(() => {
        setName(agent.name)
    }, [agent.name])

    const commitName = useCallback(() => {
        const trimmed = name.trim()
        if (!trimmed) {
            setName(agent.name)
            return
        }
        if (trimmed !== agent.name) renameAgent(agent.id, trimmed)
    }, [name, agent.id, agent.name, renameAgent])

    useEffect(() => {
        setLoading(true)
        getAgentDetailAction(agent.id)
            .then(detail => {
                if (!detail) {
                    setError(copy.engineDown)
                    return
                }
                const c = detail.config
                setAvatar(c.avatar ?? { emoji: '', image: '' })
                setModelChoice({ connectionId: c.connectionId, model: c.model, provider: c.provider })
                form.reset({
                    soul: detail.soul,
                    verbosity: c.verbosity,
                })
            })
            .catch(() => setError(copy.engineDown))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.id])

    const handleSave = form.handleSubmit(async ({ soul, verbosity }) => {
        setError(null)
        const result = await updateAgentConfigAction(agent.id, { soul, verbosity, ...botConfigPatch({ ...modelChoice, avatar }) })
        if (result.success) {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } else {
            setError(result.error ?? 'Failed to save')
        }
    })

    if (loading) {
        return (
            <div className="flex flex-col gap-4 p-4">
                <SkeletonForm />
            </div>
        )
    }

    return (
        <PanelEditorShell>
            <PanelEditorBody>
                <Input
                    data-testid="bot-settings-name"
                    label={copy.name}
                    hideRequired
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') {
                            setName(agent.name)
                            e.currentTarget.blur()
                        }
                    }}
                    className="h-8 text-xs"
                />

                {/* Un agent éteint ne répond plus : son détail engine est inatteignable par construction,
                    pas par panne. Seuls le renommage et la suppression restent utiles ici. */}
                {agent.disabledAt ? <p className="text-xs text-muted-foreground">{copy.settingsInactive}</p> : error && <p className="text-xs text-destructive">{error}</p>}

                <Separator />

                <Form {...form}>
                    <form id={SETTINGS_FORM_ID} onSubmit={handleSave} className="flex flex-col gap-4">
                        <FormField
                            control={form.control}
                            name="soul"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <TemplateContentLock locked={soulLocked} subject="system prompt">
                                        <FormControl>
                                            <MarkdownTextarea data-testid="bot-settings-persona" label={copy.persona} dialogTitle={copy.persona} className="text-xs min-h-32 font-mono" placeholder="You are..." {...field} disabled={soulLocked} />
                                        </FormControl>
                                    </TemplateContentLock>
                                </FormItem>
                            )}
                        />

                        <BotAvatarField copy={copy} name={name} value={avatar} onChange={setAvatar} />
                        <BotModelField copy={copy} value={modelChoice} onChange={setModelChoice} />

                        <FormField
                            control={form.control}
                            name="verbosity"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <Field label="Verbosity" helperText="How long its replies are, not how much work it does.">
                                        <FormControl>
                                            <Segmented options={VERBOSITY_OPTIONS} value={field.value} onChange={field.onChange} />
                                        </FormControl>
                                    </Field>
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>

                <SharedLinksSection agentId={agent.id} />

                {agent.disabledAt ? null : <AgentRepoSettings agentId={agent.id} />}

                <Field label="Notifications">
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => openNotifications(agent.id)}>
                        <BellIcon className="size-3.5" />
                        Choose what reaches you
                    </Button>
                </Field>
            </PanelEditorBody>
            <PanelEditorFooter>
                <DeleteAgentDialog agentId={agent.id} agentName={agent.name}>
                    <PanelDeleteButton data-testid="bot-settings-delete" label={copy.delete} confirm={false} />
                </DeleteAgentDialog>
                <Button type="submit" form={SETTINGS_FORM_ID} size="sm" className="flex-1" loading={isSubmitting}>
                    {saved ? (
                        <>
                            <CheckIcon className="size-3.5 mr-1.5 text-emerald-500" /> {copy.saved}
                        </>
                    ) : (
                        copy.save
                    )}
                </Button>
            </PanelEditorFooter>
        </PanelEditorShell>
    )
}
