import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'

export const metadata: Metadata = {
    title: 'Sign in',
    description: 'Sign in or create your BlinkyBot account and get your first AI coworker running in minutes.',
}

export default function AuthFlowLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-dvh w-full">
            <AuthShell title="Welcome" subtitle="Sign in or create your account to get started.">
                {children}
            </AuthShell>
        </div>
    )
}
