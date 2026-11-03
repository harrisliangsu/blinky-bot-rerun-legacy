import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { driveEgoBrowser, egoBrowserSystem, egoTaskSpace, egoTimeoutSec, EGO_NODE_SCRIPT, locateEgoBrowser, parseEgoPayload, screenshotBytes, withEgoOnPath } from './ego-browser.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

describe('locateEgoBrowser', () => {
    it('finds the command on PATH, then ~/.local/bin, and nowhere else', () => {
        const files = new Set(['/opt/bin/ego-browser', '/Users/ada/.local/bin/ego-browser'])
        const isExecutable = (path: string) => files.has(path)
        expect(locateEgoBrowser({ PATH: '/opt/bin:/usr/bin' }, '/Users/ada', isExecutable)).toBe('/opt/bin/ego-browser')
        expect(locateEgoBrowser({ PATH: '/usr/bin' }, '/Users/ada', isExecutable)).toBe('/Users/ada/.local/bin/ego-browser')
        expect(locateEgoBrowser({ PATH: '/usr/bin', EGO_BROWSER_PATH: '/custom/ego-browser' }, '/Users/ada', () => true)).toBe('/custom/ego-browser')
        expect(locateEgoBrowser({ PATH: '/usr/bin' }, '/Users/ada', () => false)).toBeNull()
    })
})

describe('withEgoOnPath', () => {
    it('prepends ~/.local/bin and leaves a path that already has it', () => {
        expect(withEgoOnPath({ PATH: '/usr/bin', HOME: '/Users/ada' }).PATH).toBe('/Users/ada/.local/bin:/usr/bin')
        expect(withEgoOnPath({ PATH: '/Users/ada/.local/bin:/usr/bin', HOME: '/Users/ada' }).PATH).toBe('/Users/ada/.local/bin:/usr/bin')
    })
})

describe('ego node script', () => {
    it('uses the documented helpers and keeps one task space per agent', () => {
        expect(EGO_NODE_SCRIPT).toContain('useOrCreateTaskSpace')
        expect(EGO_NODE_SCRIPT).toContain('openOrReuseTab')
        expect(EGO_NODE_SCRIPT).toContain('snapshotText')
        expect(EGO_NODE_SCRIPT).toContain('captureScreenshot')
        expect(EGO_NODE_SCRIPT).not.toContain('playwright')
        expect(EGO_NODE_SCRIPT).not.toContain('completeTaskSpace')
        expect(egoTaskSpace('browsing-agent')).toBe('blinky-browsing-agent')
        expect(egoTimeoutSec(30_000)).toBe(30)
        expect(egoTimeoutSec(1)).toBe(1)
        expect(egoBrowserSystem('Be brief')).toContain('Be brief')
        expect(egoBrowserSystem(undefined)).toContain('ego-browser skill')
    })
})

describe('parseEgoPayload', () => {
    it('reads the last marked JSON line and ignores earlier logs', () => {
        const payload = { text: 'Hello', status: 200, html: '<p>', links: [{ href: 'https://example.com/a', text: 'A' }, { nope: true }], finalUrl: 'https://example.com/a', screenshot: null, taskId: 7 }
        const stdout = `booting\nBLINKY_EGO_JSON ${JSON.stringify({ text: 'old' })}\nBLINKY_EGO_JSON ${JSON.stringify(payload)}\n`
        expect(parseEgoPayload(stdout)).toMatchObject({ text: 'Hello', status: 200, taskId: '7', links: [{ href: 'https://example.com/a', text: 'A' }] })
        expect(parseEgoPayload('no marker')).toBeNull()
    })
})

describe('screenshotBytes', () => {
    it('accepts a png path, a data url, and rejects other values', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ego-shot-'))
        const path = join(dir, 'shot.png')
        writeFileSync(path, PNG)
        expect(screenshotBytes(path)?.subarray(0, 4)).toEqual(PNG.subarray(0, 4))
        expect(screenshotBytes(`data:image/png;base64,${PNG.toString('base64')}`)).toEqual(PNG)
        expect(screenshotBytes({ path })).toEqual(PNG)
        expect(screenshotBytes({ note: 'missing' })).toBeNull()
        expect(screenshotBytes('/no/such/shot.png')).toBeNull()
    })
})

describe('driveEgoBrowser', () => {
    const executable = () => true

    it('does not spawn when ego-browser is missing', async () => {
        let spawned = 0
        const driven = await driveEgoBrowser(
            { agentId: 'a', url: 'https://example.com/', timeoutMs: 1000, links: false, screenshot: false },
            { env: { PATH: '/usr/bin', HOME: '/Users/ada' }, home: '/Users/ada', isExecutable: () => false, spawn: async () => {
                spawned += 1
                return { code: 0, stdout: '', stderr: '' }
            } },
        )
        expect(driven).toEqual({ ok: false, missing: true })
        expect(spawned).toBe(0)
    })

    it('passes the url and the task space to the command and parses its payload', async () => {
        const seen: { command?: string; env?: NodeJS.ProcessEnv } = {}
        const driven = await driveEgoBrowser(
            { agentId: 'a', url: 'https://example.com/x', timeoutMs: 5_000, links: true, screenshot: false },
            {
                env: { PATH: '/opt/bin', HOME: '/Users/ada' },
                home: '/Users/ada',
                isExecutable: executable,
                spawn: async (command, _script, env) => {
                    seen.command = command
                    seen.env = env
                    const payload = { text: 'Hi', status: 204, html: '', links: [], finalUrl: 'https://example.com/x', screenshot: null, taskId: '4' }
                    return { code: 0, stdout: `BLINKY_EGO_JSON ${JSON.stringify(payload)}\n`, stderr: '' }
                },
            },
        )
        expect(seen.command).toBe('/opt/bin/ego-browser')
        expect(seen.env?.BLINKY_EGO_SPACE).toBe('blinky-a')
        expect(seen.env?.BLINKY_EGO_URL).toBe('https://example.com/x')
        expect(seen.env?.BLINKY_EGO_TIMEOUT_SEC).toBe('5')
        expect(seen.env?.BLINKY_EGO_LINKS).toBe('1')
        expect(seen.env?.PATH?.startsWith('/Users/ada/.local/bin:')).toBe(true)
        expect(driven).toMatchObject({ ok: true, page: { text: 'Hi', status: 204 } })
    })

    it('returns the command error when the payload is missing', async () => {
        const driven = await driveEgoBrowser(
            { agentId: 'a', url: 'https://example.com/', timeoutMs: 1000, links: false, screenshot: false },
            {
                env: { PATH: '/opt/bin' },
                home: '/Users/ada',
                isExecutable: executable,
                spawn: async () => ({ code: 1, stdout: '', stderr: 'user is controlling' }),
            },
        )
        expect(driven).toEqual({ ok: false, missing: false, message: 'ego-browser exited 1: user is controlling' })
    })
})
