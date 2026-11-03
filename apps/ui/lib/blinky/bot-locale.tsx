'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { botCopy, type BotCopy } from './bot-copy'
import { BOT_LOCALE_KEY, localeFromPreferences, migrateCoworkerStorage, type BotLocale } from './locale'

const listeners = new Set<() => void>()
let locale: BotLocale = 'en'

function emit() {
    for (const listener of listeners) listener()
}

export function botLocale(): BotLocale {
    return locale
}

export function subscribeBotLocale(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function setBotLocale(next: BotLocale) {
    locale = next
    try {
        localStorage.setItem(BOT_LOCALE_KEY, next)
    } catch {}
    emit()
}

export function bootBotLocale() {
    if (typeof window === 'undefined') return
    try {
        migrateCoworkerStorage(window.localStorage)
        const next = localeFromPreferences(window.localStorage.getItem(BOT_LOCALE_KEY), navigator.language)
        if (next === locale) return
        locale = next
        emit()
    } catch {}
}

export function useBotLocale(): BotLocale {
    return useSyncExternalStore(subscribeBotLocale, botLocale, () => 'en')
}

export function useBotCopy(): BotCopy {
    return botCopy(useBotLocale())
}

export function BotLocaleBoot() {
    useEffect(() => {
        bootBotLocale()
    }, [])
    return null
}
