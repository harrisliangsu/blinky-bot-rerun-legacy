import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    selectSingle: vi.fn(),
    selectMaybeSingle: vi.fn(),
    selectMany: vi.fn(),
    selectMaybeSingleWithJoins: vi.fn(),
    client: {},
}))

vi.mock('@/supabase/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: () => mocks.client }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectSingle: mocks.selectSingle, selectMaybeSingle: mocks.selectMaybeSingle, selectMany: mocks.selectMany, selectMaybeSingleWithJoins: mocks.selectMaybeSingleWithJoins }))

const {
    AuthorizationError,
    UnauthenticatedError,
    assertAgentInWorkspace,
    assertSessionInWorkspace,
    assertSpaceInWorkspace,
    assertSpaceOwnedBy,
    requireWorkspaceContext,
    requireWorkspaceId,
    workspaceFounderUserId,
} = await import('./ownership')

function sessionIn(workspaceId: number | null, extra: Record<string, unknown> = {}) {
    return {
        user: workspaceId === null ? null : { id: 'u1', workspace_id: workspaceId },
        workspace: workspaceId === null ? null : { id: workspaceId },
        session: workspaceId === null ? undefined : { id: 'u1', email: 'a@b.c' },
        workspaceRefused: false,
        ...extra,
    }
}

beforeEach(() => {
    mocks.getServerSession.mockReset().mockResolvedValue(sessionIn(1))
    mocks.selectSingle.mockReset()
    mocks.selectMaybeSingle.mockReset()
    mocks.selectMany.mockReset()
    mocks.selectMaybeSingleWithJoins.mockReset()
})

describe('requireWorkspaceId', () => {
    it('answers the workspace of the session', async () => {
        await expect(requireWorkspaceId()).resolves.toBe(1)
    })

    it('refuses a workspace the caller is not a member of as a forbidden access, not a missing identity', async () => {
        mocks.getServerSession.mockResolvedValue(sessionIn(null, { workspaceRefused: true }))
        const error = await requireWorkspaceId().catch(e => e)
        expect(error).toBeInstanceOf(AuthorizationError)
        expect(error).not.toBeInstanceOf(UnauthenticatedError)
    })

    it('throws UnauthenticatedError when the user has no workspace', async () => {
        mocks.getServerSession.mockResolvedValue({ ...sessionIn(1), user: { id: 'u1', workspace_id: null } })
        await expect(requireWorkspaceId()).rejects.toBeInstanceOf(UnauthenticatedError)
    })

    it('throws UnauthenticatedError without a user', async () => {
        mocks.getServerSession.mockResolvedValue(sessionIn(null))
        await expect(requireWorkspaceId()).rejects.toBeInstanceOf(UnauthenticatedError)
    })
})

describe('requireWorkspaceContext', () => {
    it('hands back the workspace once the membership is proven', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null })
        const context = await requireWorkspaceContext()
        expect(context).toMatchObject({ userId: 'u1', userEmail: 'a@b.c', workspace: { id: 1 }, supabase: mocks.client })
        expect(mocks.selectMaybeSingle.mock.calls[0][1]).toBe('workspace_members')
        expect(mocks.selectMaybeSingle.mock.calls[0][3]).toEqual({ user_id: 'u1', workspace_id: 1 })
    })

    it('refuses a stale users.workspace_id whose membership row is gone', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: null, error: null })
        const error = await requireWorkspaceContext().catch(e => e)
        expect(error).toBeInstanceOf(AuthorizationError)
        expect(error).not.toBeInstanceOf(UnauthenticatedError)
    })

    it('refuses a workspace the session refused without reading the membership', async () => {
        mocks.getServerSession.mockResolvedValue(sessionIn(null, { workspaceRefused: true }))
        await expect(requireWorkspaceContext()).rejects.toThrow('You are not a member of this workspace')
        expect(mocks.selectMaybeSingle).not.toHaveBeenCalled()
    })

    it('throws UnauthenticatedError without an auth session', async () => {
        mocks.getServerSession.mockResolvedValue({ ...sessionIn(1), session: undefined })
        await expect(requireWorkspaceContext()).rejects.toBeInstanceOf(UnauthenticatedError)
    })
})

describe('assertAgentInWorkspace', () => {
    it('returns the agent of the caller workspace', async () => {
        const agent = { workspace_id: 1, space_id: 's1', engine_agent_id: 'e1' }
        mocks.selectSingle.mockResolvedValue({ data: agent, error: null })
        await expect(assertAgentInWorkspace('a1')).resolves.toEqual(agent)
        expect(mocks.selectSingle.mock.calls[0][3]).toEqual({ id: 'a1' })
    })

    it('refuses an agent from another workspace', async () => {
        mocks.selectSingle.mockResolvedValue({ data: { workspace_id: 2, space_id: 's1', engine_agent_id: 'e1' }, error: null })
        await expect(assertAgentInWorkspace('a1')).rejects.toThrow('Coworker not found')
    })

    it('refuses an agent that does not exist', async () => {
        mocks.selectSingle.mockResolvedValue({ data: null, error: null })
        await expect(assertAgentInWorkspace('a1')).rejects.toBeInstanceOf(AuthorizationError)
    })
})

describe('assertSpaceOwnedBy', () => {
    it('returns a Box of the given workspace', async () => {
        mocks.selectSingle.mockResolvedValue({ data: { workspace_id: 1 }, error: null })
        await expect(assertSpaceOwnedBy(1, 's1')).resolves.toEqual({ workspace_id: 1 })
    })

    it('refuses a Box from another workspace', async () => {
        mocks.selectSingle.mockResolvedValue({ data: { workspace_id: 2 }, error: null })
        await expect(assertSpaceOwnedBy(1, 's1')).rejects.toThrow('Space not found')
    })

    it('refuses a Box that does not exist', async () => {
        mocks.selectSingle.mockResolvedValue({ data: null, error: null })
        await expect(assertSpaceOwnedBy(1, 's1')).rejects.toBeInstanceOf(AuthorizationError)
    })
})

describe('assertSpaceInWorkspace', () => {
    it('refuses a Box from another workspace than the session one', async () => {
        mocks.selectSingle.mockResolvedValue({ data: { workspace_id: 2 }, error: null })
        await expect(assertSpaceInWorkspace('s1')).rejects.toThrow('Space not found')
    })

    it('accepts the local home box without a spaces row', async () => {
        vi.stubEnv('BLINKY_LOCAL_AUTH', '1')
        await expect(assertSpaceInWorkspace('local-home')).resolves.toEqual({ workspace_id: 1 })
        expect(mocks.selectSingle).not.toHaveBeenCalled()
        vi.unstubAllEnvs()
    })
})

describe('assertSessionInWorkspace', () => {
    const row = (workspaceId: number | null) => ({ id: 'se1', agent_id: 'a1', engine_session_id: 'es1', agent: workspaceId === null ? null : { workspace_id: workspaceId, engine_agent_id: 'e1' } })

    it('returns a session whose agent belongs to the caller workspace, from one read joined to its agent', async () => {
        mocks.selectMaybeSingleWithJoins.mockResolvedValueOnce({ data: row(1), error: null })
        await expect(assertSessionInWorkspace('se1')).resolves.toEqual({ id: 'se1', agent_id: 'a1', engine_session_id: 'es1', engine_agent_id: 'e1' })
        const [, table, , joins, filters] = mocks.selectMaybeSingleWithJoins.mock.calls[0]
        expect(table).toBe('sessions')
        expect(joins.agent.foreignKey).toBe('agents!sessions_agent_id_fkey')
        expect(filters).toEqual({ id: 'se1' })
    })

    it('refuses a session whose agent belongs to another workspace', async () => {
        mocks.selectMaybeSingleWithJoins.mockResolvedValueOnce({ data: row(2), error: null })
        await expect(assertSessionInWorkspace('se1')).rejects.toThrow('Session not found')
    })

    it('refuses a session whose agent row is missing', async () => {
        mocks.selectMaybeSingleWithJoins.mockResolvedValueOnce({ data: row(null), error: null })
        await expect(assertSessionInWorkspace('se1')).rejects.toBeInstanceOf(AuthorizationError)
    })

    it('refuses a session that does not exist', async () => {
        mocks.selectMaybeSingleWithJoins.mockResolvedValueOnce({ data: null, error: null })
        await expect(assertSessionInWorkspace('se1')).rejects.toThrow('Session not found')
    })

    it('takes the workspace a caller already started resolving instead of reading it again', async () => {
        mocks.selectMaybeSingleWithJoins.mockResolvedValueOnce({ data: row(7), error: null })
        await expect(assertSessionInWorkspace('se1', Promise.resolve(7))).resolves.toMatchObject({ id: 'se1' })
        expect(mocks.getServerSession).not.toHaveBeenCalled()
    })
})

describe('workspaceFounderUserId', () => {
    it('answers the earliest member, ordered by created_at', async () => {
        mocks.selectMany.mockResolvedValue({ data: [{ user_id: 'first' }, { user_id: 'second' }], error: null })
        await expect(workspaceFounderUserId(1)).resolves.toBe('first')
        const [, table, , filters, orderBy] = mocks.selectMany.mock.calls[0]
        expect(table).toBe('workspace_members')
        expect(filters).toEqual({ workspace_id: 1 })
        expect(orderBy).toEqual({ column: 'created_at' })
    })

    it('answers null when the workspace has no member', async () => {
        mocks.selectMany.mockResolvedValue({ data: [], error: null })
        await expect(workspaceFounderUserId(1)).resolves.toBeNull()
    })

    it('answers null when the read fails', async () => {
        mocks.selectMany.mockResolvedValue({ data: null, error: { message: 'boom' } })
        await expect(workspaceFounderUserId(1)).resolves.toBeNull()
    })
})
