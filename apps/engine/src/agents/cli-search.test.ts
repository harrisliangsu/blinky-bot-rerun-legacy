import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { cliLoginHint, cliReady, locateCliBinary } from './cli-search.js'

describe('locateCliBinary', () => {
    it('finds a CLI on the expanded path, including ~/.local/bin', () => {
        const home = mkdtempSync(join(tmpdir(), 'blinky-cli-'))
        const dir = join(home, '.local', 'bin')
        mkdirSync(dir, { recursive: true })
        const binary = join(dir, 'kimi')
        writeFileSync(binary, '#!/bin/sh\nexit 0\n')
        chmodSync(binary, 0o755)
        expect(locateCliBinary('kimi', { HOME: home, PATH: '/usr/bin' })).toBe(binary)
    })

    it('uses an explicit path and ignores a missing override', () => {
        const home = mkdtempSync(join(tmpdir(), 'blinky-cli-'))
        const binary = join(home, 'grok')
        writeFileSync(binary, '#!/bin/sh\nexit 0\n')
        chmodSync(binary, 0o755)
        expect(locateCliBinary('grok', { HOME: home, PATH: '', RERUN_GROK_PATH: binary })).toBe(binary)
        expect(locateCliBinary('grok', { HOME: home, PATH: '', RERUN_GROK_PATH: join(home, 'missing') })).toBeNull()
    })
})

describe('cliReady', () => {
    it('reports a signed-in kimi credential file and a missing binary', () => {
        const home = mkdtempSync(join(tmpdir(), 'blinky-kimi-'))
        const binary = join(home, 'kimi')
        writeFileSync(binary, '#!/bin/sh\nexit 0\n')
        chmodSync(binary, 0o755)
        const creds = join(home, 'credentials')
        mkdirSync(creds)
        writeFileSync(join(creds, 'kimi-code.json'), JSON.stringify({ access_token: 'kimi-access-token' }))
        const env = { HOME: home, PATH: '', RERUN_KIMI_PATH: binary, KIMI_CODE_HOME: home }
        expect(cliReady('kimi', env)).toBe('ready')
        expect(cliReady('kimi', { ...env, RERUN_KIMI_PATH: join(home, 'nope'), KIMI_CODE_HOME: join(home, 'empty') })).toBe('missing')
        expect(cliLoginHint('kimi')).toMatch(/not logged in/)
    })

    it('accepts a grok auth.json key and an XAI_API_KEY', () => {
        const home = mkdtempSync(join(tmpdir(), 'blinky-grok-'))
        const binary = join(home, 'grok')
        writeFileSync(binary, '#!/bin/sh\nexit 0\n')
        chmodSync(binary, 0o755)
        writeFileSync(join(home, 'auth.json'), JSON.stringify({ key: 'xai-live-key' }))
        const env = { HOME: home, PATH: '', RERUN_GROK_PATH: binary, GROK_HOME: home }
        expect(cliReady('grok', env)).toBe('ready')
        expect(cliReady('grok', { HOME: home, PATH: '', RERUN_GROK_PATH: binary, GROK_HOME: join(home, 'empty'), XAI_API_KEY: 'xai-api-key' })).toBe('ready')
        expect(cliReady('grok', { HOME: home, PATH: '', RERUN_GROK_PATH: binary, GROK_HOME: join(home, 'empty') })).toBe('signed-out')
    })
})
