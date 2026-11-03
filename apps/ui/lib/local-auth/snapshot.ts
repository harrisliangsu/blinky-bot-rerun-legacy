import { DEFAULT_NOTIFICATION_PREFS } from '@rerun/contracts'

import { LOCAL_WORKSPACE_ID, SESSION_COOKIE } from './constants'
import { readLocalSession, type LocalSessionRow, type LocalUserRow, type LocalWorkspaceRow } from './db'

export type LocalSnapshot = {
    token: string
    expiresAt: string
    displayName: string
    user: {
        id: string
        created_at: string
        workspace_id: number
        email_notification_prefs: typeof DEFAULT_NOTIFICATION_PREFS
        account_role: 'member'
        expert_profile_id: null
        signed_up_at: string
    }
    workspace: {
        id: number
        name: string
        icon_url: string
        created_at: string
        plan: string
        stripe_customer_id: null
        max_agents: null
        max_seats: null
        model_access: 'best'
        custom_integrations: true
        subscription_status: null
        current_period_end: null
        trial_ends_at: null
        rerun_used_micros: number
        rerun_budget_micros: number
        rerun_topup_micros: number
        rerun_period_anchor: null
        rerun_credit_paused_at: null
        is_sandbox: false
        boxes_disabled_at: null
        boxes_archived_at: null
        onboarded_at: string
        price_arm: null
    }
    authUser: {
        id: string
        aud: 'authenticated'
        role: 'authenticated'
        email: undefined
        phone: ''
        created_at: string
        app_metadata: { full_name: string }
        user_metadata: { name: string }
        is_anonymous: false
    }
}

export function snapshotFromSession(session: LocalSessionRow & { user: LocalUserRow; workspace: LocalWorkspaceRow }): LocalSnapshot {
    const { user, workspace } = session
    return {
        token: session.token,
        expiresAt: session.expires_at,
        displayName: user.display_name,
        user: {
            id: user.id,
            created_at: user.created_at,
            workspace_id: LOCAL_WORKSPACE_ID,
            email_notification_prefs: DEFAULT_NOTIFICATION_PREFS,
            account_role: 'member',
            expert_profile_id: null,
            signed_up_at: user.created_at,
        },
        workspace: {
            id: workspace.id,
            name: workspace.name,
            icon_url: '/icon-192.png',
            created_at: user.created_at,
            plan: 'self_hosted',
            stripe_customer_id: null,
            max_agents: null,
            max_seats: null,
            model_access: 'best',
            custom_integrations: true,
            subscription_status: null,
            current_period_end: null,
            trial_ends_at: null,
            rerun_used_micros: 0,
            rerun_budget_micros: 0,
            rerun_topup_micros: 0,
            rerun_period_anchor: null,
            rerun_credit_paused_at: null,
            is_sandbox: false,
            boxes_disabled_at: null,
            boxes_archived_at: null,
            onboarded_at: user.created_at,
            price_arm: null,
        },
        authUser: {
            id: user.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: undefined,
            phone: '',
            created_at: user.created_at,
            app_metadata: { full_name: user.display_name },
            user_metadata: { name: user.display_name },
            is_anonymous: false,
        },
    }
}

export async function readRequestSnapshot(): Promise<LocalSnapshot | null> {
    const { cookies } = await import('next/headers')
    let token: string | undefined
    try {
        token = (await cookies()).get(SESSION_COOKIE)?.value
    } catch {
        return null
    }
    if (!token) return null
    const session = readLocalSession(token)
    return session ? snapshotFromSession(session) : null
}
