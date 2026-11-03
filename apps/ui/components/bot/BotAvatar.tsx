'use client'

import { cn } from '@/lib/utils'

export function BotAvatar({ name, emoji, image, className }: { name: string; emoji?: string | null; image?: string | null; className?: string }) {
    if (image) return <span aria-hidden className={cn('size-8 shrink-0 rounded-full bg-cover bg-center', className)} style={{ backgroundImage: `url("${image}")` }} />
    if (emoji) return <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-base', className)}>{emoji}</span>
    const letter = name.trim().slice(0, 1).toUpperCase() || 'B'
    return <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium', className)}>{letter}</span>
}
