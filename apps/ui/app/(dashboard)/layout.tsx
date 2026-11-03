import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CrispChat } from '@/cloud/support'
import { BoardChatSplit } from '@/components/layout/BoardChatSplit'
import { FeatureFlagsProvider } from '@/components/layout/FeatureFlagsProvider'
import { WorkspaceSwitchLoader } from '@/components/layout/WorkspaceSwitchLoader'
import { paidAppFlags } from '@/cloud/apps.server'
import { startBackgroundSchedules } from '@/cloud/tasks'
import { computerFlag, rewindFlag } from '@/flags'
import { FOREMAN_PLACEMENT_COOKIE, parseForemanPlacement } from '@/lib/foreman-layout'
import { FOREMAN_OPEN_COOKIE, parseForemanOpen } from '@/lib/foreman-open'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'
import { readRequestSnapshot } from '@/lib/local-auth/snapshot'
import { SessionProvider } from '@/supabase/session/SessionProvider'

export const metadata: Metadata = {
    title: 'Dashboard',
    description: 'Your Boxes and coworkers on BlinkyBot.',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Once per server process, on the first board anyone opens: the crons a self-hosted app runs itself.
    startBackgroundSchedules()
    const [rewind, computer, apps] = await Promise.all([rewindFlag(), computerFlag(), paidAppFlags()])
    // Les miroirs des préférences de la colonne, ouverture et placement, pour la rendre déjà à sa place.
    const cookieStore = await cookies()
    const foremanOpen = parseForemanOpen(cookieStore.get(FOREMAN_OPEN_COOKIE)?.value)
    const foremanPlacement = parseForemanPlacement(cookieStore.get(FOREMAN_PLACEMENT_COOKIE)?.value)

    const local = isBlinkyLocalAuth() ? await readRequestSnapshot() : null
    if (isBlinkyLocalAuth() && !local) redirect('/api/local-auth/enter?next=/')

    return (
        <SessionProvider local={local}>
            <FeatureFlagsProvider rewind={rewind} computer={computer} apps={apps}>
                <BoardChatSplit initialOpen={foremanOpen} initialPlacement={foremanPlacement}>{children}</BoardChatSplit>
                <CrispChat hideLauncher position="left" />
                <WorkspaceSwitchLoader />
            </FeatureFlagsProvider>
        </SessionProvider>
    )
}
