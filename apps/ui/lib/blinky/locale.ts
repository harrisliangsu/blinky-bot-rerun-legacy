export type BotLocale = 'en' | 'zh'

export const BOT_LOCALE_KEY = 'blinky.locale'

type StorageLike = {
    length: number
    key(index: number): string | null
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

function replacement(match: string): string {
    return match[0] === 'C' ? 'Bot' : 'bot'
}

export function migrateCoworkerStorage(storage: StorageLike): string[] {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key) keys.push(key)
    }
    const moved: string[] = []
    for (const key of keys) {
        if (!key.toLowerCase().includes('coworker')) continue
        const next = key.replace(/coworker/gi, replacement)
        if (next === key || storage.getItem(next) != null) continue
        const value = storage.getItem(key)
        if (value == null) continue
        storage.setItem(next, value)
        moved.push(key)
    }
    if (storage.getItem(BOT_LOCALE_KEY) == null) {
        const legacy = storage.getItem('blinky.bot.locale') ?? storage.getItem('blinky.coworker.locale')
        if (legacy === 'en' || legacy === 'zh') storage.setItem(BOT_LOCALE_KEY, legacy)
    }
    return moved
}

export function localeFromPreferences(stored: string | null | undefined, language: string | null | undefined): BotLocale {
    if (stored === 'zh' || stored === 'en') return stored
    return (language ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
