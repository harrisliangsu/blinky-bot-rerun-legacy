'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useBotCopy } from '@/lib/blinky/bot-locale'
import { useBoardStore } from '@/stores/board.store'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const AGENT_NAME_MAX = 60

const schema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(AGENT_NAME_MAX, `Keep it under ${AGENT_NAME_MAX} characters`),
})

type FormValues = z.infer<typeof schema>

export function RenameAgentDialog({ agent, open, onOpenChange }: { agent: { id: string; name: string } | undefined; open: boolean; onOpenChange: (open: boolean) => void }) {
    const copy = useBotCopy()
    const renameAgent = useBoardStore(s => s.renameAgent)
    const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: agent?.name ?? '' } })

    useEffect(() => {
        if (open) form.reset({ name: agent?.name ?? '' })
    }, [open, agent?.name, form])

    const onSubmit = form.handleSubmit(values => {
        const name = values.name.trim()
        if (agent && name !== agent.name) renameAgent(agent.id, name)
        onOpenChange(false)
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="bot-rename-dialog" className="sm:max-w-md">
                <Form {...form}>
                    <form onSubmit={onSubmit} className="flex flex-col gap-4">
                        <DialogHeader>
                            <DialogTitle>{copy.renameTitle}</DialogTitle>
                            <DialogDescription>{copy.renameBody}</DialogDescription>
                        </DialogHeader>

                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input data-testid="bot-rename-name" label={copy.name} required autoFocus {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {copy.cancel}
                            </Button>
                            <Button type="submit" data-testid="bot-rename" disabled={!form.watch('name').trim()}>
                                {copy.rename}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
