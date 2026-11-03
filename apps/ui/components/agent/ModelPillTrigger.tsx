'use client'

import type { ComponentProps } from 'react'

import { ProviderIcon } from '@/lib/engine/provider-icons'
import { ChevronDownIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type ModelPillTriggerProps = ComponentProps<'button'> & { provider?: string | null; label: string }

/**
 * The model pill in a composer footer. Shared shell so the agent chat's picker and the foreman's
 * fixed "Rerun Balanced" read as the same control: one opens a popover, the other opens nothing.
 * `type="button"` matters, the pill lives inside the composer's form.
 */
export function ModelPillTrigger({ provider, label, className, ...props }: ModelPillTriggerProps) {
    return (
        <button
            type="button"
            data-testid="model-picker"
            className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:pointer-events-none',
                className
            )}
            {...props}
        >
            <ProviderIcon provider={provider} className="size-3.5" />
            {label}
            <ChevronDownIcon className="size-3" />
        </button>
    )
}
