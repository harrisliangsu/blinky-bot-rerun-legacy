import { afterEach, describe, expect, it, vi } from 'vitest'

const createBrowserClient = vi.hoisted(() => vi.fn(() => ({ kind: 'browser' })))

vi.mock('@supabase/ssr', () => ({ createBrowserClient }))

const { createClient } = await import('./client')

const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

afterEach(() => {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previous.key
    createBrowserClient.mockClear()
})

describe('createClient', () => {
    it('does not construct a Supabase client when the project URL and key are unset', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

        const client = createClient()

        expect(createBrowserClient).not.toHaveBeenCalled()
        await expect(client.from('agents').select('*')).resolves.toMatchObject({ data: [], error: null })
    })

    it('constructs a browser client when the project URL and key are set', () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable'

        expect(createClient()).toEqual({ kind: 'browser' })
        expect(createBrowserClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'publishable')
    })
})
