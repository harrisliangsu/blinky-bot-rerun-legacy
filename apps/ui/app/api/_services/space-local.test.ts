import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_WORKSPACE_ID } from '@/lib/local-auth/constants'
import { getWorkspaceConnection } from './workspace-engine.service'
import { getSpaceConnection } from './space.service'

vi.mock('./workspace-engine.service', () => ({ getWorkspaceConnection: vi.fn(), findWorkspaceEngine: vi.fn() }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectMany: vi.fn(), selectMaybeSingle: vi.fn(), selectSingle: vi.fn() }))

describe('getSpaceConnection in local auth', () => {
    afterEach(() => vi.unstubAllEnvs())

    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv('BLINKY_LOCAL_AUTH', '1')
        vi.mocked(getWorkspaceConnection).mockResolvedValue({ baseUrl: 'http://127.0.0.1:3001', apiKey: 'k' })
    })

    it('resolves the home box to the local engine', async () => {
        await expect(getSpaceConnection('local-home')).resolves.toEqual({ baseUrl: 'http://127.0.0.1:3001', apiKey: 'k' })
        expect(getWorkspaceConnection).toHaveBeenCalledWith(LOCAL_WORKSPACE_ID)
    })

    it('refuses a box the local board does not have', async () => {
        await expect(getSpaceConnection('other')).rejects.toThrow('Box not found')
        expect(getWorkspaceConnection).not.toHaveBeenCalled()
    })
})
