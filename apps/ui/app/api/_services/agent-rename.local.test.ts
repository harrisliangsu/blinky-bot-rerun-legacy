import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/local-auth/mode', () => ({ isBlinkyLocalAuth: () => true }))
vi.mock('@/lib/engine/client', () => ({
    createAgent: vi.fn(),
    deleteAgent: vi.fn(),
    duplicateAgent: vi.fn(),
    importAgentArchive: vi.fn(),
    listEngineAgents: vi.fn(),
    listSchedules: vi.fn(),
    patchAgent: vi.fn(),
    updateSchedule: vi.fn(),
}))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectMany: vi.fn(), selectSingle: vi.fn() }))
vi.mock('@/lib/copy-name', () => ({ duplicateAgentName: vi.fn() }))
vi.mock('./capacity.service', () => ({ PLAN_LIMIT_REASON: 'plan_limit', hasFreeAgentSlot: vi.fn() }))
vi.mock('./space.service', () => ({ getSpaceConnection: vi.fn().mockResolvedValue('conn') }))

const { listEngineAgents, patchAgent, deleteAgent: engineDelete } = await import('@/lib/engine/client')
const { deleteAgent, renameAgent } = await import('./agent.service')

describe('local Bot rename and delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(engineDelete).mockResolvedValue(undefined)
        vi.mocked(listEngineAgents).mockResolvedValue([
            { id: 'a1', name: 'lighthouse' },
            { id: 'a2', name: 'harbor' },
        ])
    })

    it('renames the display name and keeps the handle unique on the engine', async () => {
        await expect(renameAgent('a1', 'Lantern')).resolves.toEqual({ name: 'Lantern', handle: 'lantern' })
        expect(patchAgent).toHaveBeenCalledWith('conn', 'a1', { name: 'lantern', displayName: 'Lantern' })
    })

    it('suffixes the handle when another Bot already uses it', async () => {
        await expect(renameAgent('a1', 'Harbor')).resolves.toEqual({ name: 'Harbor', handle: 'harbor_2' })
    })

    it('deletes through the engine and does not ask Supabase', async () => {
        await expect(deleteAgent('a1')).resolves.toEqual({ success: true })
        expect(engineDelete).toHaveBeenCalledWith('conn', 'a1')
    })
})
