'use client'

import { displayNameOf, readProfile } from '@/lib/auth/user-profile'
import { useLocalAuthMode } from '@/lib/local-auth/mode-context'
import { createClient } from '@/supabase/client'
import { useSession } from '@/supabase/session/SessionProvider'
import { REALTIME_CHANNEL_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

export type TeamCursor = {
    userId: string
    name: string
    avatarUrl: string | null
    color: string
    x: number
    y: number
}

const STALE_MS = 5000
const THROTTLE_MS = 50

function colorFromId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    return `hsl(${Math.abs(hash) % 360} 70% 55%)`
}

type Identity = { userId: string | undefined; name: string; avatarUrl: string | null; color: string }

export function useTeamCursors(channelKey: string | undefined) {
    const { session } = useSession()
    const authUser = session?.user

    const identity: Identity = {
        userId: authUser?.id,
        name: (authUser && displayNameOf(authUser)) || 'Anonymous',
        avatarUrl: authUser ? readProfile(authUser).avatarUrl : null,
        color: authUser?.id ? colorFromId(authUser.id) : '#888',
    }
    const identityRef = useRef(identity)
    useEffect(() => {
        identityRef.current = identity
    })

    const [cursors, setCursors] = useState<TeamCursor[]>([])
    const cursorsRef = useRef<Map<string, TeamCursor & { ts: number }>>(new Map())
    const channelRef = useRef<RealtimeChannel | null>(null)
    const lastSentRef = useRef(0)

    const flush = useCallback(() => setCursors(Array.from(cursorsRef.current.values())), [])

    const localAuth = useLocalAuthMode()
    const userId = identity.userId
    useEffect(() => {
        if (localAuth || !channelKey || !userId) return

        const supabase = createClient()
        const cursorsMap = cursorsRef.current
        let disposed = false
        let channel: RealtimeChannel | null = null
        let attempt = 0
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null

        // Le topic est une room broadcast partagée, donc il ne peut pas être rendu unique. Le
        // client browser étant un singleton, un remontage rapide peut retomber sur le canal
        // précédent encore joint (removeChannel est asynchrone) et ses `.on()` throwent : on
        // attend la fin du teardown du canal homonyme avant d'en créer un neuf.
        const setup = async () => {
            const stale = supabase.getChannels().find(c => c.topic === `realtime:${channelKey}`)
            if (stale) await supabase.removeChannel(stale)
            if (disposed) return

            const created = supabase.channel(channelKey, {
                config: { broadcast: { self: false }, presence: { key: userId } },
            })
            channel = created
            channelRef.current = created

            created.on('broadcast', { event: 'cursor' }, ({ payload }) => {
                const p = payload as TeamCursor
                if (p.userId === userId) return
                cursorsMap.set(p.userId, { ...p, ts: performance.now() })
                flush()
            })

            const drop = (id: string | undefined) => {
                if (id && cursorsMap.delete(id)) flush()
            }
            created.on('broadcast', { event: 'cursor-leave' }, ({ payload }) => drop((payload as { userId?: string }).userId))
            created.on('presence', { event: 'leave' }, ({ key }) => drop(key))

            let alive = true
            // Un canal fermé par le serveur (token expiré, onglet réveillé) n'est jamais rejoint par
            // realtime-js : sans reconnexion, les curseurs restent morts jusqu'au reload.
            created.subscribe(status => {
                if (!alive || disposed) return
                if (status === 'SUBSCRIBED') {
                    attempt = 0
                    created.track({ userId })
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    alive = false
                    const delay = Math.min(1000 * 2 ** attempt, 15000)
                    attempt++
                    if (reconnectTimer) clearTimeout(reconnectTimer)
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null
                        if (!disposed) void setup()
                    }, delay)
                }
            })
        }
        void setup()

        const prune = setInterval(() => {
            const now = performance.now()
            let changed = false
            for (const [id, c] of cursorsMap) {
                if (now - c.ts > STALE_MS) {
                    cursorsMap.delete(id)
                    changed = true
                }
            }
            if (changed) flush()
        }, 1000)

        return () => {
            disposed = true
            clearInterval(prune)
            if (reconnectTimer) clearTimeout(reconnectTimer)
            cursorsMap.clear()
            setCursors([])
            channelRef.current = null
            if (channel) supabase.removeChannel(channel)
        }
    }, [channelKey, userId, flush, localAuth])

    const onPointerWorldMove = useCallback((world: { x: number; y: number } | null) => {
        const channel = channelRef.current
        const { userId, name, avatarUrl, color } = identityRef.current
        // Hors d'un canal joint, realtime-js retombe sur un POST HTTP à chaque appel, soit jusqu'à
        // 20 requêtes par seconde pendant un pan. Un curseur perdu n'a aucune importance.
        if (!channel || channel.state !== REALTIME_CHANNEL_STATES.joined || !userId) return

        if (!world) {
            channel.send({ type: 'broadcast', event: 'cursor-leave', payload: { userId } })
            return
        }

        const now = performance.now()
        if (now - lastSentRef.current < THROTTLE_MS) return
        lastSentRef.current = now
        channel.send({ type: 'broadcast', event: 'cursor', payload: { userId, name, avatarUrl, color, x: world.x, y: world.y } })
    }, [])

    return { cursors, onPointerWorldMove }
}
