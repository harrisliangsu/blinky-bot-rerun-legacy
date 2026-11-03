import { createAgent as engineCreateAgent } from '@/lib/engine/client'
import { selectMany, selectSingle } from '@/supabase/supabase-helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createServiceRoleClient } from '@/supabase/serviceRole'

import { createAgent, findFreeCellInSpace, moveAgentToBox } from './agent.service'
import { hasFreeAgentSlot } from './capacity.service'
import { getSpaceConnection } from './space.service'

vi.mock('@/lib/engine/client', () => ({
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
    duplicateAgent: vi.fn(),
    importAgentArchive: vi.fn(),
    listEngineAgents: vi.fn().mockResolvedValue([]),
    listSchedules: vi.fn(),
    patchAgent: vi.fn(),
    updateSchedule: vi.fn(),
}))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectMany: vi.fn(), selectSingle: vi.fn() }))
vi.mock('@/lib/copy-name', () => ({ duplicateAgentName: vi.fn() }))
vi.mock('./capacity.service', () => ({ PLAN_LIMIT_REASON: 'plan_limit', hasFreeAgentSlot: vi.fn() }))
vi.mock('./space.service', () => ({ getSpaceConnection: vi.fn() }))

describe('findFreeCellInSpace', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(selectSingle).mockResolvedValue({ data: { col_start: 0, row_start: 0, col_end: 7, row_end: 7 } } as never)
    })

    it('uses the first corner when it is free', async () => {
        vi.mocked(selectMany).mockResolvedValue({ data: [] } as never)

        await expect(findFreeCellInSpace({} as never, 'space')).resolves.toEqual({ col: 0, row: 0 })
    })

    it('continues the historical row-major scan after occupied cells', async () => {
        vi.mocked(selectMany).mockResolvedValue({ data: [{ col: 0, row: 0 }] } as never)

        await expect(findFreeCellInSpace({} as never, 'space')).resolves.toEqual({ col: 2, row: 0 })
    })
})

describe('moveAgentToBox', () => {
    const update = vi.fn()
    const eq = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        eq.mockResolvedValue({ error: null })
        update.mockReturnValue({ eq })
        vi.mocked(createServiceRoleClient).mockReturnValue({ from: () => ({ update }) } as never)
        vi.mocked(selectSingle).mockImplementation(((_client: unknown, table: string) =>
            Promise.resolve(table === 'agents' ? { data: { space_id: 'from' } } : { data: { col_start: 10, row_start: 0, col_end: 17, row_end: 7 } })) as never)
        vi.mocked(selectMany).mockResolvedValue({ data: [] } as never)
    })

    it('moves the anchor along with the Box, so the tile is drawn where it now belongs', async () => {
        await expect(moveAgentToBox('agent', 'to')).resolves.toEqual({ ok: true, position: { col: 10, row: 0 } })
        expect(update).toHaveBeenCalledWith({ space_id: 'to', col: 10, row: 0 })
    })

    it('refuses a full Box rather than leaving the agent unplaced', async () => {
        vi.mocked(selectMany).mockResolvedValue({ data: [{ col: 10, row: 0 }, { col: 12, row: 0 }, { col: 14, row: 0 }, { col: 16, row: 0 }] } as never)
        vi.mocked(selectSingle).mockImplementation(((_client: unknown, table: string) =>
            Promise.resolve(table === 'agents' ? { data: { space_id: 'from' } } : { data: { col_start: 10, row_start: 0, col_end: 17, row_end: 1 } })) as never)

        await expect(moveAgentToBox('agent', 'to')).resolves.toEqual({ ok: false, error: 'That Box has no room left. Free a cell in it first.' })
        expect(update).not.toHaveBeenCalled()
    })

    it('refuses the Box the agent is already in', async () => {
        await expect(moveAgentToBox('agent', 'from')).resolves.toEqual({ ok: false, error: 'This coworker is already in that Box' })
        expect(update).not.toHaveBeenCalled()
    })
})

describe('createAgent in local auth', () => {
    afterEach(() => vi.unstubAllEnvs())

    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv('BLINKY_LOCAL_AUTH', '1')
        vi.mocked(hasFreeAgentSlot).mockResolvedValue(true)
        vi.mocked(getSpaceConnection).mockResolvedValue({ baseUrl: 'http://127.0.0.1:3001', apiKey: 'k' })
        vi.mocked(selectMany).mockResolvedValue({ data: [] } as never)
        vi.mocked(engineCreateAgent).mockResolvedValue({ id: 'engine-1' } as never)
    })

    it('keeps the engine coworker instead of rolling it back when Supabase has no row', async () => {
        const insert = vi.fn()
        vi.mocked(createServiceRoleClient).mockReturnValue({ from: () => ({ insert }) } as never)

        const agent = await createAgent({ name: 'Scout', workspaceId: 1, spaceId: 'local-home', position: { col: 1, row: 1 } })

        expect(agent).toMatchObject({ id: 'engine-1', engine_agent_id: 'engine-1', name: 'Scout', space_id: 'local-home', disabled_at: null, col: 1, row: 1 })
        expect(insert).not.toHaveBeenCalled()
        expect(engineCreateAgent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ config: expect.objectContaining({ displayName: 'Scout', enabled: true }) }))
    })
})
