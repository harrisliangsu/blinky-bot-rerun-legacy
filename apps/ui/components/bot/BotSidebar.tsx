'use client'

import { useCallback, useEffect, useState } from 'react'

import { listBotFacesAction } from '@/app/api/_actions/bot.actions'
import { Button } from '@/components/ui/button'
import { botCopy } from '@/lib/blinky/bot-copy'
import { setBotLocale, useBotLocale } from '@/lib/blinky/bot-locale'
import { useBoardStore } from '@/stores/board.store'

import { BotEditorDialog } from './BotEditorDialog'
import { BotListItem } from './BotListItem'

const NEW_BOT_KEY = 'blinky.newBot'

function labelOf(id: string, name: string, main: string) {
    if (id === 'foreman' && name.trim().toLowerCase() === 'foreman') return main
    return name
}

export function BotSidebar() {
    const locale = useBotLocale()
    const copy = botCopy(locale)
    const agents = useBoardStore(s => s.agents)
    const selectedId = useBoardStore(s => s.selectedAgentId)
    const openAgentChat = useBoardStore(s => s.openAgentChat)
    const [faces, setFaces] = useState<Record<string, { emoji: string; image: string }>>({})
    const [editorOpen, setEditorOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const reloadFaces = useCallback(() => {
        void listBotFacesAction()
            .then(rows => {
                const next: Record<string, { emoji: string; image: string }> = {}
                for (const row of rows) next[row.id] = { emoji: row.emoji, image: row.image }
                setFaces(next)
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        reloadFaces()
    }, [reloadFaces, agents.length])

    useEffect(() => {
        const openNew = () => {
            try {
                sessionStorage.removeItem(NEW_BOT_KEY)
            } catch {}
            setEditingId(null)
            setEditorOpen(true)
        }
        try {
            if (sessionStorage.getItem(NEW_BOT_KEY) === '1') openNew()
        } catch {}
        window.addEventListener('blinky-new-bot', openNew)
        return () => window.removeEventListener('blinky-new-bot', openNew)
    }, [])

    return (
        <aside data-testid="bot-sidebar" className="flex max-h-56 w-full shrink-0 flex-col border-b bg-background md:max-h-none md:w-60 md:border-r md:border-b-0 lg:w-72">
            <div className="flex items-center justify-between gap-2 px-3 py-3">
                <h2 className="text-sm font-medium">{copy.bots}</h2>
                <Button type="button" size="sm" data-testid="bot-create" onClick={() => { setEditingId(null); setEditorOpen(true) }}>
                    {copy.newBot}
                </Button>
            </div>
            <div data-testid="bot-list" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
                {agents.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{copy.empty}</p>}
                {agents.map(agent => {
                    const face = faces[agent.id]
                    const name = labelOf(agent.id, agent.name, copy.mainBot)
                    return (
                        <div key={agent.id} className="flex items-center gap-1">
                            <BotListItem name={name} emoji={face?.emoji || agent.avatarEmoji} image={face?.image} selected={selectedId === agent.id} onSelect={() => openAgentChat(agent.id)} />
                            <Button type="button" variant="ghost" size="sm" className="shrink-0" data-testid="bot-edit" aria-label={`${copy.editBot} ${name}`} onClick={() => { setEditingId(agent.id); setEditorOpen(true) }}>
                                {copy.editBot}
                            </Button>
                        </div>
                    )
                })}
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <span className="text-xs text-muted-foreground">{copy.language}</span>
                <div className="flex gap-1">
                    <Button type="button" size="sm" variant={locale === 'en' ? 'secondary' : 'ghost'} aria-pressed={locale === 'en'} onClick={() => setBotLocale('en')}>
                        EN
                    </Button>
                    <Button type="button" size="sm" variant={locale === 'zh' ? 'secondary' : 'ghost'} aria-pressed={locale === 'zh'} onClick={() => setBotLocale('zh')}>
                        中文
                    </Button>
                </div>
            </div>
            <BotEditorDialog open={editorOpen} agentId={editingId} onOpenChange={setEditorOpen} onSaved={reloadFaces} />
        </aside>
    )
}
