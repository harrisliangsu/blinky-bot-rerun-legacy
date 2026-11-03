'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { readAvatarFile } from '@/lib/blinky/avatar-image'
import type { BotCopy } from '@/lib/blinky/bot-copy'
import type { AgentAvatar } from '@rerun/contracts'

import { BotAvatar } from './BotAvatar'

const EMOJI = ['🤖', '🦊', '🦉', '🐙', '🌟', '⚡️', '🌿', '🔥', '🎯', '📚', '🛠️', '🌊', '🎨', '🧭', '💡', '🚀']

export function BotAvatarField({ copy, name, value, onChange }: { copy: BotCopy; name: string; value: AgentAvatar; onChange: (next: AgentAvatar) => void }) {
    const [error, setError] = useState<string | null>(null)

    return (
        <Field label={copy.avatar} error={error ?? undefined}>
            <div className="flex flex-wrap items-center gap-3">
                <BotAvatar name={name || copy.bots} emoji={value.emoji} image={value.image} className="size-12 text-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div data-testid="bot-avatar" className="flex flex-wrap gap-1">
                        {EMOJI.map(emoji => (
                            <button
                                key={emoji}
                                type="button"
                                data-testid="bot-avatar-emoji"
                                aria-pressed={value.emoji === emoji}
                                className="flex size-9 items-center justify-center rounded-md text-base hover:bg-muted aria-pressed:bg-muted"
                                onClick={() => onChange({ ...value, emoji: value.emoji === emoji ? '' : emoji })}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-xs font-medium text-muted-foreground">
                            {copy.avatarImage}
                            <input
                                data-testid="bot-avatar-image"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="sr-only"
                                onChange={event => {
                                    const file = event.target.files?.[0]
                                    event.target.value = ''
                                    if (!file) return
                                    setError(null)
                                    void readAvatarFile(file)
                                        .then(image => onChange({ ...value, image }))
                                        .catch(err => setError(err instanceof Error ? err.message : copy.saveFailed))
                                }}
                            />
                        </label>
                        {value.image && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, image: '' })}>
                                {copy.avatarClear}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Field>
    )
}
