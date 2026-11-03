import { describe, expect, it } from 'vitest'

import { normalizeNotificationPrefs } from '@/lib/notifications/prefs'

describe('notification prefs Bot alias', () => {
    it('reads rules stored under bots when coworkers is empty', () => {
        const prefs = normalizeNotificationPrefs({ version: 2, bots: { scout: { mode: 'muted' } }, coworkers: {} })
        expect(prefs.coworkers.scout).toEqual({ mode: 'muted' })
    })

    it('keeps an existing coworkers map when both keys are present', () => {
        const prefs = normalizeNotificationPrefs({
            version: 2,
            coworkers: { scout: { mode: 'everything' } },
            bots: { scout: { mode: 'muted' } },
        })
        expect(prefs.coworkers.scout).toEqual({ mode: 'everything' })
    })
})
