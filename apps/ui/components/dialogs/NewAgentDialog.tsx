'use client'

import type { NewAgentRequest } from '@rerun/ui/new-agent'

import { readAgentJobAction } from '@/app/api/_actions/onboarding.actions'
import { NewAgentForm } from '@/components/dialogs/new-agent/NewAgentForm'
import { SplitDialogContent } from '@/components/dialogs/SplitDialogContent'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useConnectorCatalog } from '@/lib/new-agent/useConnectorCatalog'
import { useBoxAgentSuggestions } from '@/lib/onboarding/useBoxAgentSuggestions'
import { useStartScratchAgent } from '@/lib/templates/useStartScratchAgent'

// The agent described in one sentence: Rerun reads its name, its apps and its timing in it. The
// dialog writes nothing and calls no action to create anything: the agent is created on the tile
// drop, with its apps, and the description is its first message.
//
// One column rather than the house form and aside: the description is the whole dialog, and the
// templates the aside used to carry are one button under it. The frame keeps the house size.
//
// Opened from an empty Box, it carries that Box: the suggestions are the ones that belong there, and
// the agent can only be dropped in it.
export function NewAgentDialog({ open, onOpenChange, onBrowseTemplates, spaceId = null }: { open: boolean; onOpenChange: (open: boolean) => void; onBrowseTemplates: (slug?: string) => void; spaceId?: string | null }) {
    const startScratchAgent = useStartScratchAgent()
    const { suggestions, heading } = useBoxAgentSuggestions(spaceId, open)
    const catalog = useConnectorCatalog(open)

    function create(agent: NewAgentRequest) {
        startScratchAgent(agent, spaceId)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <SplitDialogContent aside={null} gridClassName="sm:grid-cols-1">
                <DialogTitle data-testid="new-bot-title" className="sr-only">New Bot</DialogTitle>
                <DialogDescription className="sr-only">Describe the job, or start from a suggestion or a template.</DialogDescription>
                <NewAgentForm suggestions={suggestions} suggestionsHeading={heading} catalog={catalog} read={readAgentJobAction} onCreate={create} onBrowseTemplates={() => onBrowseTemplates()} />
            </SplitDialogContent>
        </Dialog>
    )
}

export const NewBotDialog = NewAgentDialog
