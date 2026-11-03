import { describe, expect, it } from 'vitest'

import { engineChatFailure } from './engine-failure'

describe('engineChatFailure', () => {
    it('surfaces a spent Rerun budget as the code the chat already classifies', () => {
        expect(engineChatFailure(402, JSON.stringify({ error: 'payment required' }))).toEqual({ status: 402, error: 'rerun_budget_exhausted' })
        expect(engineChatFailure(500, JSON.stringify({ error: { message: 'rerun_budget_exhausted' } }))).toEqual({ status: 402, error: 'rerun_budget_exhausted' })
    })

    it('keeps a CLI quota message readable instead of wrapping it as a generic engine failure', () => {
        expect(engineChatFailure(429, 'quota exceeded for grok-4.7')).toEqual({ status: 402, error: 'quota exceeded for grok-4.7' })
    })

    it('leaves an ordinary engine failure as a 502', () => {
        expect(engineChatFailure(500, 'boom')).toEqual({ status: 502, error: 'Engine error: 500 boom' })
    })
})
