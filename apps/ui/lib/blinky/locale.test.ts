import { describe, expect, it } from 'vitest'

import { botCopy, placementProgress, whatShouldBotDo } from './bot-copy'
import { localeFromPreferences, migrateCoworkerStorage } from './locale'
import { botConfigPatch, botDraftSchema } from './bot-draft'

function memoryStorage(seed: Record<string, string> = {}) {
    const data = new Map(Object.entries(seed))
    return {
        get length() {
            return data.size
        },
        key(index: number) {
            return [...data.keys()][index] ?? null
        },
        getItem(key: string) {
            return data.get(key) ?? null
        },
        setItem(key: string, value: string) {
            data.set(key, value)
        },
        data,
    }
}

describe('migrateCoworkerStorage', () => {
    it('copies a coworker key forward and leaves the original', () => {
        const storage = memoryStorage({ 'blinky.coworker.locale': 'zh', 'keep.me': '1' })
        const moved = migrateCoworkerStorage(storage)
        expect(moved).toEqual(['blinky.coworker.locale'])
        expect(storage.getItem('blinky.coworker.locale')).toBe('zh')
        expect(storage.getItem('blinky.bot.locale')).toBe('zh')
        expect(storage.getItem('blinky.locale')).toBe('zh')
    })

    it('does not overwrite a key that already moved', () => {
        const storage = memoryStorage({ 'blinky.coworker.locale': 'en', 'blinky.bot.locale': 'zh', 'blinky.locale': 'zh' })
        expect(migrateCoworkerStorage(storage)).toEqual([])
        expect(storage.getItem('blinky.locale')).toBe('zh')
        expect(migrateCoworkerStorage(storage)).toEqual([])
    })
})

describe('localeFromPreferences', () => {
    it('prefers a stored choice, then the system language', () => {
        expect(localeFromPreferences('zh', 'en-US')).toBe('zh')
        expect(localeFromPreferences(null, 'zh-Hans')).toBe('zh')
        expect(localeFromPreferences(null, 'en-US')).toBe('en')
    })
})

describe('bot copy', () => {
    it('names the product Bot in both languages', () => {
        expect(botCopy('en').newBot).toBe('New Bot')
        expect(botCopy('zh').newBot).toBe('新建 Bot')
        expect(botCopy('en').persona).toBe('Persona')
        expect(botCopy('zh').persona).toBe('人设')
        expect(whatShouldBotDo('en', '')).toBe('What should your new Bot do?')
        expect(whatShouldBotDo('zh', '灯塔')).toBe('灯塔 要做什么？')
        expect(placementProgress('zh', 2, 3)).toBe('Bot 2 / 3')
    })
})

describe('botDraftSchema', () => {
    it('keeps a persona, a model, and an emoji avatar', () => {
        const draft = botDraftSchema.parse({
            name: '  Lighthouse  ',
            persona: 'You answer like a lighthouse keeper.',
            model: 'grok-4.7',
            provider: 'grok',
            connectionId: 'grok-local',
            avatar: { emoji: '🏮' },
        })
        expect(draft.name).toBe('Lighthouse')
        expect(draft.persona).toContain('lighthouse keeper')
        expect(botConfigPatch(draft)).toMatchObject({ model: 'grok-4.7', provider: 'grok', connectionId: 'grok-local', avatar: { emoji: '🏮', image: '' } })
    })

    it('clears the model pin when the Bot follows the default', () => {
        const draft = botDraftSchema.parse({ name: 'Scout', model: null, avatar: null })
        expect(botConfigPatch(draft)).toMatchObject({ model: null, provider: null, connectionId: null, avatar: { emoji: '', image: '' } })
    })

    it('rejects an avatar that is not an image data URL', () => {
        expect(botDraftSchema.safeParse({ name: 'Scout', avatar: { image: 'https://example.com/a.png' } }).success).toBe(false)
    })
})
