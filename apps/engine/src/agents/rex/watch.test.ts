// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertRexLaunch, rexGate } from '../../../../../e2e/rex-hook.mjs'
import { runLocalCli } from '../cli-adapters/index.js'
import { providerRex } from './launch.js'
import { assertLocalRexArgs, firstJsonValue, osc7501, parseRexWatch, rexClientEnv, rexMirrorArgs, rexSessionLabel, sessionIdFromList, sessionIdFromNew, specEnv, windowIdFromRun } from './protocol.js'
import { agentWorkspace } from './workspace.js'

const root = mkdtempSync(join(tmpdir(), 'rex-watch-'))

const stubSource = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn as spawnChild } from 'node:child_process'
import { dirname, join } from 'node:path'
const dir = dirname(process.argv[1])
const args = process.argv.slice(2)
appendFileSync(join(dir, 'calls.log'), JSON.stringify({ args, server: process.env.REX_SERVER ?? null, secret: process.env.CODEX_API_KEY ?? null }) + '\\n')
if (args[0] === 'version') process.exit(existsSync(join(dir, 'fail')) ? 1 : 0)
if (args[0] === 'session' && args[1] === 'ls') {
    const sessionPath = join(dir, 'session.json')
    const session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf8')) : null
    process.stdout.write(JSON.stringify({ sessions: session ? [session] : [] }))
    process.exit(0)
}
if (args[0] === 'session' && args[1] === 'new') {
    const session = { session_id: 'session:blinky', label: args[2] }
    writeFileSync(join(dir, 'session.json'), JSON.stringify(session))
    process.stdout.write(JSON.stringify(session))
    process.exit(0)
}
if (args[0] === 'run') {
    process.stdout.write(JSON.stringify({ block_ids: ['block:test'], window_id: 'window:test' }) + '\\n')
    process.exit(0)
}
process.exit(2)
`

const agentSource = `#!/usr/bin/env node
const env = {}
for (const key of ['CODEX_API_KEY', 'REX_SERVER']) if (process.env[key] !== undefined) env[key] = process.env[key]
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), env }))
process.stderr.write('stderr-note')
`

function writeStub(dir: string, fail = false): string {
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'rex')
    writeFileSync(path, stubSource)
    chmodSync(path, 0o755)
    if (fail) writeFileSync(join(dir, 'fail'), '1')
    return path
}

function calls(dir: string): Array<{ args: string[]; server: string | null; secret: string | null }> {
    try {
        return readFileSync(join(dir, 'calls.log'), 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line) as { args: string[]; server: string | null; secret: string | null })
    } catch {
        return []
    }
}

describe('rex watch parsing', () => {
    it('stays off unless the state file names a local binary', () => {
        expect(parseRexWatch('{"enabled":false,"bin":"/usr/bin/rex"}')).toBeNull()
        expect(parseRexWatch('{"enabled":true,"bin":"rex"}')).toBeNull()
        expect(parseRexWatch('{"enabled":true,"bin":"/usr/bin/rex","listen":"0.0.0.0:7681"}')).toEqual({ bin: '/usr/bin/rex' })
        expect(parseRexWatch('not json')).toBeNull()
    })

    it('reads session and window ids from the documented JSON', () => {
        const listed = firstJsonValue('{\n  "sessions": [\n    { "session_id": "session:abc", "label": "BlinkyBot" }\n  ]\n}\nhello')
        expect(sessionIdFromList(listed, 'blinkybot')).toBe('session:abc')
        expect(sessionIdFromNew({ session_id: 'session:new' })).toBe('session:new')
        expect(windowIdFromRun({ block_ids: ['block:1'], window_id: 'window:2' })).toBe('window:2')
        expect(windowIdFromRun({ window_id: 'nope' })).toBeNull()
    })

    it('refuses flags that would publish the Rex server', () => {
        expect(() => assertLocalRexArgs(['run', '--listen', '0.0.0.0:1'])).toThrow(/Refusing to expose Rex: --listen/)
        expect(() => assertLocalRexArgs(['run', '--tailscale'])).toThrow(/--tailscale/)
        const args = rexMirrorArgs({ session: 'session:abc', label: 'Scout\ntask', cwd: '/work/dir', file: '/tmp/activity.log' })
        expect(args).toContain('--shell=none')
        expect(args).toContain('--focus=false')
        expect(args).toContain('--keep-open')
        expect(args).not.toContain('--wait')
        expect(args).toContain('Scout task')
        expect(args).toContain('-c')
        expect(args).toContain('/work/dir')
        const flags = args.slice(0, args.indexOf('--'))
        expect(flags).not.toContain('--listen')
        expect(flags).not.toContain('--extra-listen')
        expect(flags).not.toContain('--server')
        expect(flags).not.toContain('-S')
        expect(flags).not.toContain('--tailscale')
        expect(rexSessionLabel('Scout')).toBe('blinky-Scout')
        expect(osc7501('working', 'Scout')).toContain('state=working')
        expect(agentWorkspace('scout')).toMatch(/agents\/scout\/workspace$/)
    })

    it('keeps the Rex client off the agent environment and off REX_SERVER', () => {
        const client = rexClientEnv({ PATH: '/bin', REX_SERVER: 'tcp://public.example:7681', CODEX_API_KEY: 'secret', HOME: '/Users/ada' })
        expect(client).toEqual({ PATH: '/bin', HOME: '/Users/ada' })
        expect(specEnv({ PATH: '/bin', REX_SERVER: 'tcp://public.example:7681', CODEX_API_KEY: 'secret' })).toEqual({ PATH: '/bin', CODEX_API_KEY: 'secret' })
    })
})

describe('runLocalCli with a stub rex', () => {
    const agent = join(root, 'agent.mjs')
    writeFileSync(agent, agentSource)
    chmodSync(agent, 0o755)

    function envFor(dir: string, bin: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
        const state = join(dir, 'rex-watch.json')
        const warning = join(dir, 'rex-watch.log')
        return {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            RERUN_CLI_ADAPTERS: 'codex',
            RERUN_CODEX_PATH: agent,
            BLINKY_REX_STATE: state,
            BLINKY_REX_WARNING_FILE: warning,
            REX_SERVER: 'tcp://public.example:7681',
            ...extra,
        }
    }

    it('does not call rex when the toggle is off', async () => {
        const dir = join(root, 'off')
        const bin = writeStub(dir)
        writeFileSync(join(dir, 'rex-watch.json'), JSON.stringify({ enabled: false, bin }))
        const result = await runLocalCli('codex', { prompt: 'hello', cwd: root, label: 'Scout' }, { processEnv: envFor(dir, bin) })
        expect(result.exitCode).toBe(0)
        expect(result.stderr).toBe('stderr-note')
        expect(calls(dir)).toEqual([])
    })

    it('runs the agent inside rex and still returns its output', async () => {
        const dir = join(root, 'on')
        const bin = writeStub(dir)
        writeFileSync(join(dir, 'rex-watch.json'), JSON.stringify({ enabled: true, bin, listen: '0.0.0.0:7681' }))
        const request = { prompt: 'hello', cwd: root, label: 'Scout task', handle: 'scout', agentId: 'scout', env: { CODEX_API_KEY: 'codex-secret' } }
        const first = await runLocalCli('codex', request, { processEnv: envFor(dir, bin) })
        const second = await runLocalCli('codex', request, { processEnv: envFor(dir, bin) })
        for (const result of [first, second]) {
            expect(result.exitCode).toBe(0)
            expect(result.stderr).toBe('stderr-note')
            const parsed = JSON.parse(result.stdout) as { argv: string[]; env: Record<string, string> }
            expect(parsed.argv).toContain('hello')
            expect(parsed.env.CODEX_API_KEY).toBe('codex-secret')
        }
        const log = calls(dir)
        expect(log.every(call => call.secret === null && call.server === null)).toBe(true)
        const runs = log.filter(call => call.args[0] === 'run')
        expect(runs).toHaveLength(2)
        for (const run of runs) {
            expect(run.args).toContain('--shell=none')
            expect(run.args).toContain('--focus=false')
            expect(run.args).toContain('--keep-open')
            expect(run.args).not.toContain('--wait')
            expect(run.args).toContain('Scout task')
            expect(run.args).toContain('session:blinky')
            expect(run.args).toContain(agentWorkspace('scout'))
            expect(run.args).not.toContain('--listen')
            expect(run.args).not.toContain('--extra-listen')
            expect(run.args).not.toContain('--tailscale')
            expect(run.args).not.toContain('--server')
            expect(run.args).not.toContain('-S')
            expect(run.args.join(' ')).not.toContain('codex-secret')
        }
        expect(log.filter(call => call.args[0] === 'version')).toHaveLength(2)
        expect(log.filter(call => call.args[0] === 'session' && call.args[1] === 'new')).toEqual([
            expect.objectContaining({ args: ['session', 'new', 'blinky-scout', '--json'] }),
        ])
        const mirror = readFileSync(runs[0]!.args.at(-1)!, 'utf8')
        expect(mirror).toContain('state=working')
        expect(mirror).toContain('state=done')
        expect(mirror).toContain('hello')
    })

    it('turns watching off when rex version fails and still runs the agent', async () => {
        const dir = join(root, 'fail')
        const bin = writeStub(dir, true)
        const state = join(dir, 'rex-watch.json')
        writeFileSync(state, JSON.stringify({ enabled: true, bin }))
        const result = await runLocalCli('codex', { prompt: 'hello', cwd: root, label: 'Scout', handle: 'scout', env: { CODEX_API_KEY: 'codex-secret' } }, { processEnv: envFor(dir, bin) })
        expect(result.exitCode).toBe(0)
        expect(result.stderr).toBe('stderr-note')
        expect(JSON.parse(result.stdout).argv).toContain('hello')
        expect(JSON.parse(readFileSync(state, 'utf8'))).toEqual({ enabled: false })
        expect(readFileSync(join(dir, 'rex-watch.log'), 'utf8')).toContain('rex-not-installed')
        expect(calls(dir).some(call => call.args[0] === 'run')).toBe(false)
        expect(calls(dir).every(call => call.secret === null && call.server === null)).toBe(true)
    })

    it('turns watching off when the rex binary is missing', async () => {
        const dir = join(root, 'missing')
        mkdirSync(dir, { recursive: true })
        const state = join(dir, 'rex-watch.json')
        writeFileSync(state, JSON.stringify({ enabled: true, bin: '/no/such/rex' }))
        const result = await runLocalCli('codex', { prompt: 'hello', cwd: root, handle: 'scout' }, { processEnv: envFor(dir, '/no/such/rex') })
        expect(result.exitCode).toBe(0)
        expect(JSON.parse(result.stdout).argv).toContain('hello')
        expect(JSON.parse(readFileSync(state, 'utf8'))).toEqual({ enabled: false })
        expect(calls(dir)).toEqual([])
    })
})

describe('providerRex', () => {
    it('points Claude and Codex at a local wrapper only while the toggle is on', () => {
        const dir = join(root, 'wrapper')
        mkdirSync(dir, { recursive: true })
        const state = join(dir, 'rex-watch.json')
        const nodePath = '/usr/bin/node'
        const outerPath = '/opt/blinky/outer.js'
        writeFileSync(join(dir, 'rex-watch.json'), JSON.stringify({ enabled: false }))
        expect(providerRex({ BLINKY_REX_STATE: state }, { configured: '/opt/codex', fallback: 'codex', label: 'Scout', nodePath, outerPath }).executable).toBe('/opt/codex')
        writeFileSync(state, JSON.stringify({ enabled: true, bin: '/Applications/Rex.app/Contents/Helpers/Rex Server.rex/Contents/MacOS/rex' }))
        const planned = providerRex({ BLINKY_REX_STATE: state, BLINKY_REX_WARNING_FILE: join(dir, 'warn.log') }, { configured: undefined, fallback: 'claude', label: 'Scout\none', handle: 'scout', agentId: 'scout', nodePath, outerPath })
        expect(planned.executable).toBe(join(dir, 'rex-wrapper.sh'))
        const script = readFileSync(planned.executable!, 'utf8')
        expect(script).toContain(nodePath)
        expect(script).toContain(outerPath)
        expect(script).not.toContain('--listen')
        expect(planned.extraEnv.BLINKY_REX_REAL).toBe('claude')
        expect(planned.extraEnv.BLINKY_REX_LABEL).toBe('Scout one')
        expect(planned.extraEnv.BLINKY_REX_HANDLE).toBe('scout')
        expect(planned.extraEnv.BLINKY_REX_AGENT_ID).toBe('scout')
        expect(planned.extraEnv.BLINKY_REX_STATE).toBe(state)
    })
})

describe('e2e rex hook', () => {
    it('skips until the marker is on the tree and rejects a published server', () => {
        const skipped = rexGate([{ path: 'apps/mac-shell/Sources/BlinkyBot/ContentView.swift', text: 'Compose' }])
        expect(skipped.enabled).toBe(false)
        expect(skipped.reason.startsWith('Skipped:')).toBe(true)
        const enabled = rexGate([{ path: 'RexDetection.swift', text: 'blinky-rex-watch' }])
        expect(enabled.enabled).toBe(true)
        expect(assertRexLaunch('rex run --json --keep-open --shell=none -s session:blinky')).toMatch(/local server/)
        expect(() => assertRexLaunch('rex run --extra-listen tcp://0.0.0.0:7681 --keep-open --shell=none')).toThrow(/publish/)
    })
})

describe('rex outer entry', () => {
    it('skips rex for a version probe and proxies a real run through the stub', async () => {
        const dir = join(root, 'outer')
        const bin = writeStub(dir)
        const state = join(dir, 'rex-watch.json')
        writeFileSync(state, JSON.stringify({ enabled: true, bin }))
        const real = join(dir, 'real.mjs')
        writeFileSync(
            real,
            `#!/usr/bin/env node
if (process.argv[2] === '--version') {
    process.stdout.write('version-ok\\n')
    process.exit(0)
}
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { buf += chunk })
process.stdin.on('end', () => {
    process.stdout.write('ran:' + buf)
    process.stderr.write('err-side')
    process.exit(3)
})
`,
        )
        chmodSync(real, 0o755)
        const outer = fileURLToPath(new URL('./outer.ts', import.meta.url))
        const version = await runOuter(outer, ['--version'], { ...baseEnv(dir, state), BLINKY_REX_REAL: real, BLINKY_REX_LABEL: 'Scout', BLINKY_REX_HANDLE: 'scout', BLINKY_REX_AGENT_ID: 'scout' })
        expect(version.status).toBe(0)
        expect(version.stdout).toBe('version-ok\n')
        expect(calls(dir).some(call => call.args[0] === 'run')).toBe(false)

        const run = await runOuter(outer, ['exec', 'hello'], { ...baseEnv(dir, state), BLINKY_REX_REAL: real, BLINKY_REX_LABEL: 'Scout', BLINKY_REX_HANDLE: 'scout', BLINKY_REX_AGENT_ID: 'scout' }, 'ping')
        expect(run.status).toBe(3)
        expect(run.stdout).toBe('ran:ping')
        expect(run.stderr).toContain('err-side')
        const launch = calls(dir).find(call => call.args[0] === 'run')
        expect(launch?.args).toContain('--shell=none')
        expect(launch?.args).toContain('--keep-open')
        expect(launch?.args).toContain(agentWorkspace('scout'))
        expect(calls(dir).some(call => call.args[0] === 'session' && call.args[1] === 'new' && call.args[2] === 'blinky-scout')).toBe(true)
        expect(launch?.secret).toBeNull()
        const mirror = readFileSync(launch!.args.at(-1)!, 'utf8')
        expect(mirror).toContain('ran:ping')
        expect(mirror).toContain('state=working')
        expect(mirror).toContain('state=error')
    })
})

function baseEnv(dir: string, state: string): NodeJS.ProcessEnv {
    return {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        BLINKY_REX_STATE: state,
        BLINKY_REX_WARNING_FILE: join(dir, 'rex-watch.log'),
        REX_SERVER: 'tcp://public.example:7681',
    }
}

function runOuter(outer: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', outer, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', chunk => {
            stdout += chunk
        })
        child.stderr.on('data', chunk => {
            stderr += chunk
        })
        child.once('error', reject)
        child.once('close', status => resolve({ status, stdout, stderr }))
        if (stdin !== undefined) {
            child.stdin.write(stdin)
            child.stdin.end()
        }
    })
}
