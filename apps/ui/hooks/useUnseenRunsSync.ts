'use client'

import { useEffect } from 'react'

import { useLocalAuthMode } from '@/lib/local-auth/mode-context'
import { useUnseenRunsStore } from '@/stores/unseen-runs.store'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'

// Loads the finished runs this member has not opened yet, and keeps every tab in step: a
// conversation opened in one tab, or answered from the phone, leaves the list everywhere. New runs
// arrive through `useNotificationsRealtime`, which already listens to `notifications`.
export function useUnseenRunsSync(workspaceId: number | undefined, userId: string | undefined) {
    const localAuth = useLocalAuthMode()
    useEffect(() => {
        if (localAuth || !workspaceId || !userId) return
        useUnseenRunsStore.getState().hydrate(workspaceId, userId)
    }, [workspaceId, userId, localAuth])

    useEffect(() => {
        const refresh = () => void useUnseenRunsStore.getState().refresh()
        window.addEventListener('focus', refresh)
        return () => window.removeEventListener('focus', refresh)
    }, [])

    const refresh = () => void useUnseenRunsStore.getState().refresh()
    useRealtimeSubscription('session_reads', {
        channelId: `session-reads-${userId}`,
        filter: userId ? { column: 'user_id', value: userId } : undefined,
        enabled: !!userId && !!workspaceId && !localAuth,
        onInsert: refresh,
        onUpdate: refresh,
        onResync: refresh,
    })
}
