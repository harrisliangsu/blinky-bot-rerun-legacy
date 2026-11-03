'use client'

import { cn } from '@/lib/utils'

import { BotAvatar } from './BotAvatar'

export function BotListItem({ name, emoji, image, selected, onSelect }: { name: string; emoji?: string | null; image?: string | null; selected: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            data-testid="bot-list-item"
            data-bot-name={name}
            aria-current={selected ? 'true' : undefined}
            onClick={onSelect}
            className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted', selected && 'bg-muted')}
        >
            <BotAvatar name={name} emoji={emoji} image={image} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
        </button>
    )
}
