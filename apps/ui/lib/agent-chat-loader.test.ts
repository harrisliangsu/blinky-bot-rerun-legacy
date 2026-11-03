import { describe, expect, it } from 'vitest'
import { liveActivityLabel, stepGroupShowsActivity } from './agent-chat-loader'

const toolLabel = (name: string) => (name === 'web_search' ? 'Web Search' : name)
type Parts = NonNullable<Parameters<typeof liveActivityLabel>[0]>['parts']
const assistant = (parts: Parts) => ({ role: 'assistant', parts })

describe('liveActivityLabel', () => {
    it('stays silent without a streaming assistant message', () => {
        expect(liveActivityLabel(undefined, toolLabel)).toBeNull()
        expect(liveActivityLabel({ role: 'user', parts: [{ type: 'text' }] }, toolLabel)).toBeNull()
        expect(liveActivityLabel(assistant([]), toolLabel)).toBeNull()
    })

    it('counts the sub-agents of a running delegation', () => {
        const message = assistant([
            { type: 'dynamic-tool', toolName: 'mcp__rerun__delegate_tasks', toolCallId: 'call-1', state: 'input-available' },
            {
                type: 'data-delegate',
                id: 'call-1',
                data: {
                    tasks: [
                        { title: 'A', status: 'done', steps: 3 },
                        { title: 'B', status: 'running', steps: 1, idleMs: 200_000 },
                        { title: 'C', status: 'queued', steps: 0 },
                    ],
                },
            },
        ])
        expect(liveActivityLabel(message, toolLabel)).toBe('Waiting on 3 sub-Bots · 1 done · 1 stalled')
    })

    it('reads a delegation whose id a CLI bridge rewrote', () => {
        const message = assistant([
            { type: 'dynamic-tool', toolName: 'mcp__rerun__delegate_tasks', toolCallId: 'toolu_01', state: 'input-available' },
            { type: 'data-delegate', id: '7', data: { tasks: [{ title: 'A', status: 'running', steps: 1 }] } },
        ])
        expect(liveActivityLabel(message, toolLabel)).toBe('Waiting on 1 sub-Bot · 0 done')
    })

    it('names the agent the onboarding is building', () => {
        const message = assistant([
            { type: 'tool-build_team', toolCallId: 'build-1', state: 'input-available' },
            { type: 'data-delegate', id: 'build-1', data: { tasks: [{ title: 'Inbox Concierge', status: 'running', steps: 1 }] } },
        ])
        expect(liveActivityLabel(message, toolLabel)).toBe('Building Inbox Concierge')
    })

    it('names the agent a waiting call is on', () => {
        const message = assistant([
            { type: 'tool-call_agent', toolCallId: 'call-2', state: 'input-available' },
            { type: 'data-call-agent', id: 'call-2', data: { agentName: 'Growth', status: 'running', steps: 2 } },
        ])
        expect(liveActivityLabel(message, toolLabel)).toBe('Waiting on Growth')
    })

    it('ignores a delegation that already returned', () => {
        const message = assistant([
            { type: 'tool-delegate_tasks', toolCallId: 'call-1', state: 'output-available' },
            { type: 'data-delegate', id: 'call-1', data: { tasks: [{ title: 'A', status: 'running', steps: 1 }] } },
            { type: 'reasoning', state: 'streaming' },
        ])
        expect(liveActivityLabel(message, toolLabel)).toBe('Thinking...')
    })

    it('names the tool being run, without the bridge prefix', () => {
        const message = assistant([{ type: 'dynamic-tool', toolName: 'mcp__rerun__web_search', toolCallId: 'call-3', state: 'input-streaming' }])
        expect(liveActivityLabel(message, toolLabel)).toBe('Running Web Search')
    })

    it('says nothing about a question waiting on the user', () => {
        const message = assistant([{ type: 'tool-ask_user', toolCallId: 'call-4', state: 'input-available' }])
        expect(liveActivityLabel(message, toolLabel)).toBeNull()
    })

    it('falls back to the rotation once a step has settled', () => {
        const message = assistant([{ type: 'tool-web_search', toolCallId: 'call-5', state: 'output-available' }])
        expect(liveActivityLabel(message, toolLabel)).toBeNull()
    })
})

describe('stepGroupShowsActivity', () => {
    it('holds while the step group is thinking or running a tool', () => {
        expect(stepGroupShowsActivity(assistant([{ type: 'reasoning', state: 'streaming' }, { type: 'data-usage' }]))).toBe(true)
        expect(stepGroupShowsActivity(assistant([{ type: 'dynamic-tool', toolName: 'mcp__rerun__web_search', toolCallId: 'call-1', state: 'input-available' }]))).toBe(true)
    })

    it('leaves the loader when nothing in the group is live', () => {
        expect(stepGroupShowsActivity(undefined)).toBe(false)
        expect(stepGroupShowsActivity(assistant([]))).toBe(false)
        expect(stepGroupShowsActivity(assistant([{ type: 'reasoning', state: 'done' }]))).toBe(false)
        expect(stepGroupShowsActivity(assistant([{ type: 'text', state: 'streaming' }]))).toBe(false)
        expect(stepGroupShowsActivity(assistant([{ type: 'tool-web_search', toolCallId: 'call-2', state: 'output-available' }]))).toBe(false)
    })

    it('leaves the loader for what is drawn outside the group', () => {
        expect(stepGroupShowsActivity(assistant([{ type: 'tool-ask_user', toolCallId: 'call-3', state: 'input-available' }]))).toBe(false)
        expect(stepGroupShowsActivity(assistant([{ type: 'tool-send_email', toolCallId: 'call-4', state: 'approval-requested' }]))).toBe(false)
        const delegation = assistant([
            { type: 'tool-delegate_tasks', toolCallId: 'call-5', state: 'input-available' },
            { type: 'data-delegate', id: 'call-5', data: { tasks: [{ title: 'A', status: 'running', steps: 1 }] } },
        ])
        expect(stepGroupShowsActivity(delegation)).toBe(false)
    })
})
