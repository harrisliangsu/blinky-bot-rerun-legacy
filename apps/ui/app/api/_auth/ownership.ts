import { realEmail } from '@/lib/auth/placeholder-email'
import type { Database } from '@/app/api/database.types'
import { emptySupabase } from '@/lib/local-auth/empty-client'
import { LOCAL_SPACE_ID, LOCAL_WORKSPACE_ID } from '@/lib/local-auth/constants'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { getServerSession, getSessionWorkspace } from '@/supabase/session/getServerSession'
import { selectMany, selectMaybeSingle, selectMaybeSingleWithJoins, selectSingle } from '@/supabase/supabase-helpers'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Why this module exists: every mutation/read in the API goes through the
// service-role client (createServiceRoleClient), which BYPASSES Row Level
// Security. RLS therefore protects direct browser/PostgREST access but not this
// path. These helpers re-establish object-level authorization in code: they
// resolve the caller's workspace from the auth session (never trusting an id
// passed by the client) and assert the target resource belongs to it.

// Thrown when the caller is unauthenticated or targets a resource outside their
// workspace. Most callers swallow it to fail closed (empty/null result); the
// ones that throw surface a generic "not found" so we don't leak existence.
export class AuthorizationError extends Error {
    constructor(message = 'Not authorized') {
        super(message)
        this.name = 'AuthorizationError'
    }
}

// No caller identity at all, as opposed to an identity that may not touch the resource. The API
// answers the first with a 401 so the app refreshes its token, the second with a 404.
export class UnauthenticatedError extends AuthorizationError {
    constructor() {
        super('Not authenticated')
        this.name = 'UnauthenticatedError'
    }
}

const NOT_A_MEMBER = 'You are not a member of this workspace'

// The signed-in user's workspace, read through the RLS-respecting session client
// (getSessionWorkspace), so it can't be spoofed by the request body. Throws when
// there is no authenticated user.
export async function requireWorkspaceId(): Promise<number> {
    const { user, workspaceRefused } = await getSessionWorkspace()
    if (workspaceRefused) throw new AuthorizationError(NOT_A_MEMBER)
    if (!user?.workspace_id) throw new UnauthenticatedError()
    return user.workspace_id
}

export type WorkspaceContext = {
    userId: string
    userEmail: string | null
    authUser: User
    workspace: NonNullable<Awaited<ReturnType<typeof getServerSession>>['workspace']>
    supabase: SupabaseClient<Database>
}

// The same resolution as requireWorkspaceId, one step further: it also proves membership and
// hands back the row and the service-role client the caller is about to need. A workspace can
// stay on users.workspace_id after the membership is gone, so the membership is re-read rather
// than inferred from the session.
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
    if (isBlinkyLocalAuth()) {
        const { user, workspace, session, workspaceRefused } = await getServerSession()
        if (workspaceRefused) throw new AuthorizationError(NOT_A_MEMBER)
        if (!user?.id || !user.workspace_id || !workspace || !session) throw new UnauthenticatedError()
        return { userId: user.id, userEmail: realEmail(session.email), authUser: session, workspace, supabase: emptySupabase() }
    }
    const { user, workspace, session, workspaceRefused } = await getServerSession()
    if (workspaceRefused) throw new AuthorizationError(NOT_A_MEMBER)
    if (!user?.id || !user.workspace_id || !workspace || !session) throw new UnauthenticatedError()

    const supabase = createServiceRoleClient()
    const { data: membership } = await selectMaybeSingle(supabase, 'workspace_members', ['user_id'] as const, { user_id: user.id, workspace_id: workspace.id })
    if (!membership) throw new AuthorizationError(NOT_A_MEMBER)

    return { userId: user.id, userEmail: realEmail(session.email), authUser: session, workspace, supabase }
}

type OwnedAgent = { workspace_id: number; space_id: string; engine_agent_id: string | null }

// Loads an agent (service-role) and asserts it belongs to the caller's
// workspace. Returns the row so callers don't fetch it twice.
export async function assertAgentInWorkspace(agentId: string): Promise<OwnedAgent> {
    if (isBlinkyLocalAuth()) {
        const workspaceId = await requireWorkspaceId()
        return { workspace_id: workspaceId, space_id: LOCAL_SPACE_ID, engine_agent_id: agentId }
    }
    const [workspaceId, { data: agent }] = await Promise.all([requireWorkspaceId(), selectSingle(createServiceRoleClient(), 'agents', ['workspace_id', 'space_id', 'engine_agent_id'] as const, { id: agentId })])
    if (!agent || agent.workspace_id !== workspaceId) throw new AuthorizationError('Coworker not found')
    return agent
}

// For an OAuth callback, which lands in a popup that names no workspace: the agent names its own,
// held to the caller's membership like a workspace a tab names.
export async function requireAgentWorkspaceId(agentId: string): Promise<number> {
    const { user } = await getSessionWorkspace()
    if (!user?.id) throw new UnauthenticatedError()
    const supabase = createServiceRoleClient()
    const { data: agent } = await selectMaybeSingle(supabase, 'agents', ['workspace_id'] as const, { id: agentId })
    if (!agent) throw new AuthorizationError('Coworker not found')
    const { data: membership } = await selectMaybeSingle(supabase, 'workspace_members', ['user_id'] as const, { user_id: user.id, workspace_id: agent.workspace_id })
    if (!membership) throw new AuthorizationError('Coworker not found')
    return agent.workspace_id
}

type OwnedSpace = { workspace_id: number }

// The workspace comes in explicitly for the callers that proved their identity with an API key
// rather than a browser session; the session variant below is the same check, one line thinner.
export async function assertSpaceOwnedBy(workspaceId: number, spaceId: string): Promise<OwnedSpace> {
    if (isBlinkyLocalAuth()) {
        if (spaceId !== LOCAL_SPACE_ID || workspaceId !== LOCAL_WORKSPACE_ID) throw new AuthorizationError('Space not found')
        return { workspace_id: LOCAL_WORKSPACE_ID }
    }
    const supabase = createServiceRoleClient()
    const { data: space } = await selectSingle(supabase, 'spaces', ['workspace_id'] as const, { id: spaceId })
    if (!space || space.workspace_id !== workspaceId) throw new AuthorizationError('Space not found')
    return space
}

export async function assertSpaceInWorkspace(spaceId: string): Promise<OwnedSpace> {
    return assertSpaceOwnedBy(await requireWorkspaceId(), spaceId)
}

// Every member holds the same rights, but some things need one person to stand for the workspace:
// the account an API key acts as, the recipient of billing mail. That is the earliest member, the
// account everything already hangs off. Answers null so each caller writes its own refusal.
export async function workspaceFounderUserId(workspaceId: number): Promise<string | null> {
    const supabase = createServiceRoleClient()
    const { data: members } = await selectMany(supabase, 'workspace_members', ['user_id'] as const, { workspace_id: workspaceId }, { column: 'created_at' })
    return members?.[0]?.user_id ?? null
}

type OwnedSession = { id: string; agent_id: string; engine_session_id: string | null; engine_agent_id: string | null }

// Asserts a session belongs to one of the caller's agents (session -> agent ->
// workspace), mirroring the DB RLS policy for sessions. The session and its agent come back in one
// read, alongside the caller's workspace rather than after it. `workspaceId` is passed in by a
// caller that already started resolving it.
export async function assertSessionInWorkspace(sessionId: string, workspaceId?: Promise<number>): Promise<OwnedSession> {
    if (isBlinkyLocalAuth()) {
        await (workspaceId ?? requireWorkspaceId())
        return { id: sessionId, agent_id: '', engine_session_id: sessionId, engine_agent_id: null }
    }
    const [callerWorkspaceId, session] = await Promise.all([workspaceId ?? requireWorkspaceId(), readSessionWithAgent(sessionId)])
    if (!session || session.agent?.workspace_id !== callerWorkspaceId) throw new AuthorizationError('Session not found')
    return { id: session.id, agent_id: session.agent_id, engine_session_id: session.engine_session_id, engine_agent_id: session.agent.engine_agent_id }
}

async function readSessionWithAgent(sessionId: string) {
    const { data } = await selectMaybeSingleWithJoins(
        createServiceRoleClient(),
        'sessions',
        ['id', 'agent_id', 'engine_session_id'] as const,
        // Named, because origin_agent_id points at agents too.
        { agent: { table: 'agents', foreignKey: 'agents!sessions_agent_id_fkey', columns: ['workspace_id', 'engine_agent_id'] } } as const,
        { id: sessionId },
    )
    return data
}
