import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, sessionCookieOptions } from './constants'
import { countLocalRows, closeLocalAuthDb, createLocalSession, deleteLocalSession, ensureLocalIdentity, readLocalSession, readLocalUser } from './db'

let dir: string

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blinky-local-auth-'))
    process.env.BLINKY_LOCAL_AUTH_DB = join(dir, 'local-auth.sqlite')
    process.env.RERUN_ENGINE_URL = 'http://127.0.0.1:3001'
    process.env.RERUN_ENGINE_API_KEY = 'engine-key'
    closeLocalAuthDb()
})

afterEach(() => {
    closeLocalAuthDb()
    delete process.env.BLINKY_LOCAL_AUTH_DB
    rmSync(dir, { recursive: true, force: true })
})

describe('local auth sqlite', () => {
    it('creates one user and one workspace on first open', () => {
        const first = ensureLocalIdentity()
        const second = ensureLocalIdentity()

        expect(first.user.display_name).toBe('You')
        expect(first.workspace).toMatchObject({ id: 1, name: 'BlinkyBot', engine_host: 'http://127.0.0.1:3001', engine_api_key: 'engine-key' })
        expect(second.user.id).toBe(first.user.id)
        expect(countLocalRows()).toMatchObject({ users: 1, workspaces: 1 })
        expect(readLocalUser()?.id).toBe(first.user.id)
    })

    it('slides the session forward when it is used, and sign-out deletes it', () => {
        const { user } = ensureLocalIdentity()
        const created = createLocalSession(user.id)
        const read = readLocalSession(created.token)

        expect(read?.user_id).toBe(user.id)
        expect(Date.parse(read!.expires_at)).toBeGreaterThanOrEqual(Date.parse(created.expires_at))
        expect(countLocalRows().sessions).toBe(1)

        deleteLocalSession(created.token)
        expect(readLocalSession(created.token)).toBeNull()
        expect(countLocalRows().sessions).toBe(0)
        expect(readLocalUser()?.id).toBe(user.id)
    })

    it('drops an expired session', () => {
        const created = createLocalSession()
        closeLocalAuthDb()
        const db = new DatabaseSync(process.env.BLINKY_LOCAL_AUTH_DB!)
        db.prepare('UPDATE local_session SET expires_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', created.token)
        db.close()

        expect(readLocalSession(created.token)).toBeNull()
        expect(countLocalRows().sessions).toBe(0)
    })
})

describe('session cookie', () => {
    it('is HttpOnly and SameSite=Lax on the host, without Secure or a Domain', () => {
        const options = sessionCookieOptions()
        expect(SESSION_COOKIE).toBe('blinky_session')
        expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false })
        expect(options).not.toHaveProperty('domain')
    })
})
