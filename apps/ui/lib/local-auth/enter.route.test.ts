import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE } from './constants'
import { closeLocalAuthDb, countLocalRows, readLocalSession } from './db'
import { GET as enter } from '@/app/api/local-auth/enter/route'
import { POST as signOut } from '@/app/api/local-auth/sign-out/route'

let dir: string

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blinky-local-auth-route-'))
    process.env.BLINKY_LOCAL_AUTH = '1'
    process.env.BLINKY_LOCAL_AUTH_DB = join(dir, 'local-auth.sqlite')
    process.env.RERUN_ENGINE_URL = 'http://127.0.0.1:3001'
    process.env.RERUN_ENGINE_API_KEY = 'engine-key'
    closeLocalAuthDb()
})

afterEach(() => {
    closeLocalAuthDb()
    delete process.env.BLINKY_LOCAL_AUTH
    delete process.env.BLINKY_LOCAL_AUTH_DB
    rmSync(dir, { recursive: true, force: true })
})

describe('local auth routes', () => {
    it('sets a host-only session cookie and creates the local user', async () => {
        const response = await enter(new Request('http://127.0.0.1:3000/api/local-auth/enter?next=/'))
        const cookie = response.headers.get('set-cookie') ?? ''

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/')
        expect(cookie).toContain(`${SESSION_COOKIE}=`)
        expect(cookie.toLowerCase()).toContain('httponly')
        expect(cookie.toLowerCase()).toContain('samesite=lax')
        expect(cookie.toLowerCase()).toContain('path=/')
        expect(cookie.toLowerCase()).not.toContain('secure')
        expect(cookie.toLowerCase()).not.toContain('domain=')
        expect(countLocalRows()).toMatchObject({ users: 1, workspaces: 1, sessions: 1 })
    })

    it('sign-out deletes the session row and clears the cookie; the next enter keeps the same user', async () => {
        const first = await enter(new Request('http://127.0.0.1:3000/api/local-auth/enter?next=/'))
        const token = /blinky_session=([^;]+)/.exec(first.headers.get('set-cookie') ?? '')?.[1]
        expect(token).toBeTruthy()
        const userId = readLocalSession(decodeURIComponent(token!))?.user_id

        const signedOut = await signOut(new Request('http://127.0.0.1:3000/api/local-auth/sign-out', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}` } }))
        expect(signedOut.status).toBe(204)
        expect(signedOut.headers.get('set-cookie')?.toLowerCase()).toContain('max-age=0')
        expect(readLocalSession(decodeURIComponent(token!))).toBeNull()

        const again = await enter(new Request('http://127.0.0.1:3000/api/local-auth/enter?next=/'))
        const nextToken = /blinky_session=([^;]+)/.exec(again.headers.get('set-cookie') ?? '')?.[1]
        expect(countLocalRows()).toMatchObject({ users: 1, sessions: 1 })
        expect(readLocalSession(decodeURIComponent(nextToken!))?.user_id).toBe(userId)
    })
})
