'use client'

import { Button } from '@/components/ui/button'
import { Bell, CreditCard, MailIcon, Package, Play, Volume2, type LucideIcon } from '@/lib/icons'
import { playNotificationSound } from '@/lib/notifications/browser'
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_DESCRIPTIONS, EMAIL_CATEGORY_LABELS, type EmailCategory, type NotificationPrefs } from '@/lib/notifications/prefs'

import { SETTINGS_CARD, SettingsSection, SwitchRow } from './SettingsSection'

type Channel = 'toast' | 'sound' | 'email'

export type ChannelPrefs = Pick<NotificationPrefs, 'scope' | Channel>

export function NotificationChannels({ prefs, onChange }: { prefs: ChannelPrefs; onChange: (patch: Partial<Pick<NotificationPrefs, Channel>>) => void }) {
    const silent = prefs.scope === 'nothing'
    return (
        <SettingsSection title="How">
            <div className={SETTINGS_CARD}>
                <SwitchRow icon={Bell} label="Toast in the app" description="Pops up above your inbox while Rerun is open." checked={prefs.toast} disabled={silent} onChange={toast => onChange({ toast })} />
                <SwitchRow
                    icon={Volume2}
                    label="Sound"
                    description="Only when a Bot needs you or something breaks."
                    checked={prefs.sound}
                    disabled={silent}
                    onChange={sound => onChange({ sound })}
                    extra={
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Play notification sound" disabled={silent} onClick={() => playNotificationSound()} className="text-muted-foreground hover:text-foreground">
                            <Play />
                        </Button>
                    }
                />
                <SwitchRow icon={MailIcon} label="Email" description="When it needs you while you are away. One email per incident, never one per run." checked={prefs.email} disabled={silent} onChange={email => onChange({ email })} />
            </div>
        </SettingsSection>
    )
}

const CATEGORY_ICONS: Record<EmailCategory, LucideIcon> = {
    billing: CreditCard,
    product: Package,
}

export function AccountEmails({ categories, onChange }: { categories: NotificationPrefs['categories']; onChange: (category: EmailCategory, value: boolean) => void }) {
    return (
        <SettingsSection title="Account emails">
            <div className={SETTINGS_CARD}>
                {EMAIL_CATEGORIES.map(category => (
                    <SwitchRow key={category} icon={CATEGORY_ICONS[category]} label={EMAIL_CATEGORY_LABELS[category]} description={EMAIL_CATEGORY_DESCRIPTIONS[category]} checked={categories[category]} onChange={value => onChange(category, value)} />
                ))}
            </div>
        </SettingsSection>
    )
}
