'use client'

import { Dialog } from '@/components/ui/dialog'

import { BotEditorForm } from './BotEditorForm'

export function BotEditorDialog({ open, agentId, onOpenChange, onSaved }: { open: boolean; agentId: string | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <BotEditorForm key={agentId ?? 'new'} agentId={agentId} onOpenChange={onOpenChange} onSaved={onSaved} />}
        </Dialog>
    )
}
