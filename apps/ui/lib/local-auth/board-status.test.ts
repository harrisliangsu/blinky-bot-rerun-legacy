import { describe, expect, it } from 'vitest'

import type { SessionEntry } from '@/lib/board/types'

import { agentStatusForBoard, sessionStatusesFromRuns, sessionsWithRunStatus, type BoardRun } from './board-status'

const session = (id: string, status: SessionEntry['status'] = 'idle'): SessionEntry => ({ id, agentId: 'agent', originAgentId: null, status })
const run = (sessionId: string, status: string, startedAt: string): BoardRun => ({ sessionId, status, startedAt })

describe('sessionStatusesFromRuns', () => {
    it('follows a run from working through done, cancel, and error', () => {
        expect(sessionStatusesFromRuns([run('s', 'running', '2'), run('s', 'done', '1')]).get('s')).toBe('working')
        expect(sessionStatusesFromRuns([run('s', 'done', '2'), run('s', 'error', '1')]).get('s')).toBe('idle')
        expect(sessionStatusesFromRuns([run('s', 'cancelled', '3'), run('s', 'error', '2')]).get('s')).toBe('idle')
        expect(sessionStatusesFromRuns([run('s', 'error', '2'), run('s', 'done', '1')]).get('s')).toBe('error')
    })
})

describe('sessionsWithRunStatus', () => {
    it('overlays engine runs and leaves sessions alone when the run list could not be read', () => {
        expect(sessionsWithRunStatus([session('s')], [run('s', 'running', '1')])).toEqual([session('s', 'working')])
        expect(sessionsWithRunStatus([session('s', 'working')], null)).toEqual([session('s', 'working')])
    })
})

describe('agentStatusForBoard', () => {
    it('shows error after a failed run and keeps a busy agent working when runs could not be read', () => {
        expect(agentStatusForBoard('idle', [session('s', 'error')], true)).toBe('error')
        expect(agentStatusForBoard('idle', [session('s', 'working')], true)).toBe('working')
        expect(agentStatusForBoard('idle', [session('s')], true)).toBe('idle')
        expect(agentStatusForBoard('busy', [session('s')], false)).toBe('working')
    })
})
