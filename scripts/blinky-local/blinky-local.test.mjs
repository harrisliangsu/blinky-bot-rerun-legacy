import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
    ENGINE_COMMAND,
    buildPlan,
    decideStart,
    isReady,
    layoutPaths,
    readOrCreateApiKey,
    redactPlan,
    resolvePorts,
    spawnEnv,
    supportDir,
    uiCommand,
} from './layout.mjs'

const repoRoot = join(import.meta.dirname, '..', '..')
const cli = join(import.meta.dirname, 'blinky-local.mjs')

describe('support directory', () => {
    it('uses Application Support on macOS and ~/.blinkybot elsewhere', () => {
        assert.equal(supportDir({ env: {}, home: '/Users/ada', platform: 'darwin' }), '/Users/ada/Library/Application Support/BlinkyBot')
        assert.equal(supportDir({ env: {}, home: '/home/ada', platform: 'linux' }), '/home/ada/.blinkybot')
        assert.equal(supportDir({ env: { BLINKY_SUPPORT_DIR: '/tmp/blinky' }, home: '/home/ada', platform: 'linux' }), '/tmp/blinky')
        assert.equal(supportDir({ env: { BLINKY_HOME: '/tmp/legacy' }, home: '/home/ada', platform: 'linux' }), '/tmp/legacy')
    })

    it('keeps engine data, the auth db, pids, and logs beside each other', () => {
        const paths = layoutPaths('/tmp/blinky')
        assert.equal(paths.engineData, '/tmp/blinky/engine')
        assert.equal(paths.authDb, '/tmp/blinky/local-auth.sqlite')
        assert.equal(paths.apiKey, '/tmp/blinky/engine-api-key')
        assert.equal(paths.enginePid, '/tmp/blinky/run/engine.pid')
        assert.equal(paths.uiPid, '/tmp/blinky/run/ui.pid')
        assert.equal(paths.engineLog, '/tmp/blinky/logs/engine.log')
        assert.equal(paths.uiLog, '/tmp/blinky/logs/ui.log')
    })
})

describe('process plan', () => {
    const plan = buildPlan({ repoRoot, home: '/tmp/blinky', apiKey: 'secret-key' })

    it('starts the built engine and next start on the Mac shell ports', () => {
        assert.deepEqual(plan.engine.command, ENGINE_COMMAND)
        assert.deepEqual(plan.engine.command, ['node', 'dist/cli/bin.js', 'run'])
        assert.equal(plan.engine.cwd, join(repoRoot, 'apps/engine'))
        assert.equal(plan.engine.url, 'http://127.0.0.1:3001')
        assert.equal(plan.engine.healthUrl, 'http://127.0.0.1:3001/health')
        assert.deepEqual(plan.ui.command, uiCommand())
        assert.deepEqual(plan.ui.command, ['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000'])
        assert.equal(plan.ui.cwd, join(repoRoot, 'apps/ui'))
        assert.equal(plan.ui.url, 'http://127.0.0.1:3000')
        assert.equal(plan.ui.healthUrl, 'http://127.0.0.1:3000/api/version')
    })

    it('sets the contract environment and leaves Supabase unset', () => {
        assert.equal(plan.engine.env.RERUN_DATA_DIR, '/tmp/blinky/engine')
        assert.equal(plan.engine.env.RERUN_HOST, '127.0.0.1')
        assert.equal(plan.engine.env.RERUN_PORT, '3001')
        assert.equal(plan.engine.env.RERUN_API_KEY, 'secret-key')
        assert.equal(plan.engine.env.RERUN_HUB_BASE_URL, 'http://127.0.0.1:3000')
        assert.equal(plan.engine.env.RERUN_CLI_ADAPTERS, 'codex,kimi,grok,claude')
        assert.equal(plan.engine.env.RERUN_DESKTOP, 'off')
        assert.equal(plan.engine.env.RERUN_LOG_LEVEL, 'info')
        assert.equal(plan.ui.env.NODE_ENV, 'production')
        assert.equal(plan.ui.env.HOSTNAME, '127.0.0.1')
        assert.equal(plan.ui.env.PORT, '3000')
        assert.equal(plan.ui.env.NEXT_PUBLIC_APP_URL, 'http://127.0.0.1:3000')
        assert.equal(plan.ui.env.RERUN_ENGINE_URL, 'http://127.0.0.1:3001')
        assert.equal(plan.ui.env.RERUN_ENGINE_BROWSER_URL, 'http://127.0.0.1:3001')
        assert.equal(plan.ui.env.RERUN_ENGINE_API_KEY, 'secret-key')
        assert.equal(plan.ui.env.BLINKY_LOCAL_AUTH, '1')
        assert.equal(plan.ui.env.BLINKY_LOCAL_AUTH_DB, '/tmp/blinky/local-auth.sqlite')
        assert.equal(plan.ui.env.NEXT_PUBLIC_SUPABASE_URL, undefined)
        assert.equal(plan.ui.env.SUPABASE_SECRET_KEY, undefined)
        assert.equal(plan.ui.env.OPENROUTER_API_KEY, undefined)
    })

    it('redacts the api key and drops inherited Supabase and pairing variables at spawn', () => {
        assert.equal(redactPlan(plan).engine.env.RERUN_API_KEY, '(set)')
        assert.equal(redactPlan(plan).ui.env.RERUN_ENGINE_API_KEY, '(set)')
        const env = spawnEnv(plan.engine.env, {
            PATH: '/usr/bin',
            NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54421',
            SUPABASE_URL: 'http://localhost:54421',
            SUPABASE_ANON_KEY: 'anon',
            RERUN_PAIR_TOKEN: 'pair',
            RERUN_HUB_URL: 'http://hub',
            OPENROUTER_API_KEY: 'sk',
        })
        assert.equal(env.PATH, '/usr/bin')
        assert.equal(env.RERUN_API_KEY, 'secret-key')
        assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, undefined)
        assert.equal(env.SUPABASE_URL, undefined)
        assert.equal(env.SUPABASE_ANON_KEY, undefined)
        assert.equal(env.RERUN_PAIR_TOKEN, undefined)
        assert.equal(env.RERUN_HUB_URL, undefined)
        assert.equal(env.OPENROUTER_API_KEY, undefined)
        assert.equal(env.RERUN_DESKTOP, 'off')
        assert.equal(env.BLINKY_LOCAL_AUTH, undefined)
    })

    it('uses the same port overrides as the Mac shell', () => {
        assert.deepEqual(resolvePorts({}), { uiPort: 3000, enginePort: 3001 })
        assert.deepEqual(resolvePorts({ BLINKY_UI_PORT: '3050', BLINKY_ENGINE_PORT: '3001' }), { uiPort: 3050, enginePort: 3001 })
        const moved = buildPlan({ repoRoot, home: '/tmp/blinky', uiPort: 3050, enginePort: 3011 })
        assert.equal(moved.ui.url, 'http://127.0.0.1:3050')
        assert.equal(moved.engine.url, 'http://127.0.0.1:3011')
        assert.equal(moved.ui.env.BLINKY_LOCAL_AUTH, '1')
        assert.equal(moved.ui.env.RERUN_ENGINE_URL, 'http://127.0.0.1:3011')
        assert.equal(moved.engine.env.RERUN_HUB_BASE_URL, 'http://127.0.0.1:3050')
        assert.equal(moved.ui.command.at(-1), '3050')
        assert.throws(() => resolvePorts({ BLINKY_UI_PORT: '3000', BLINKY_ENGINE_PORT: '3000' }), /both 3000/)
        assert.throws(() => resolvePorts({ BLINKY_UI_PORT: 'nope' }), /BLINKY_UI_PORT/)
    })
})

describe('api key file', () => {
    it('writes 32 bytes of hex mode 0600 and reuses the file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'blinky-key-'))
        try {
            const file = join(dir, 'engine-api-key')
            const first = readOrCreateApiKey(file)
            const second = readOrCreateApiKey(file)
            assert.equal(first.created, true)
            assert.equal(second.created, false)
            assert.equal(second.key, first.key)
            assert.match(first.key, /^[0-9a-f]{64}$/)
            assert.equal(statSync(file).mode & 0o777, 0o600)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})

describe('start decision', () => {
    it('adopts a healthy child, waits on our own process, and refuses a foreign port', () => {
        assert.equal(decideStart({ pidAlive: true, healthy: true, portFree: false }), 'adopt')
        assert.equal(decideStart({ pidAlive: true, healthy: false, portFree: false }), 'wait')
        assert.equal(decideStart({ pidAlive: false, healthy: false, portFree: false }), 'blocked')
        assert.equal(decideStart({ pidAlive: false, healthy: false, portFree: true }), 'spawn')
    })
})

describe('ready checks', () => {
    it('accepts the engine health body and the UI version body', async () => {
        const server = createServer((request, response) => {
            response.setHeader('content-type', 'application/json')
            if (request.url === '/health') {
                response.end(JSON.stringify({ status: 'ok' }))
                return
            }
            if (request.url === '/api/version') {
                response.end(JSON.stringify({ buildSha: 'dev' }))
                return
            }
            response.statusCode = 500
            response.end('no')
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const { port } = server.address()
        try {
            assert.equal(await isReady(`http://127.0.0.1:${port}/health`, 'engine'), true)
            assert.equal(await isReady(`http://127.0.0.1:${port}/api/version`, 'ui'), true)
            assert.equal(await isReady(`http://127.0.0.1:${port}/health`, 'ui'), false)
            assert.equal(await isReady(`http://127.0.0.1:${port}/missing`, 'engine'), false)
        } finally {
            await new Promise((resolve) => server.close(resolve))
        }
    })
})

describe('dry-run cli', () => {
    it('prints the contract commands without creating a home or leaking the key', () => {
        const dir = mkdtempSync(join(tmpdir(), 'blinky-dry-'))
        const home = join(dir, 'home')
        try {
            const result = spawnSync(process.execPath, [cli, 'dry-run', '--json'], {
                cwd: repoRoot,
                encoding: 'utf8',
                env: { ...process.env, BLINKY_HOME: home, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54421' },
            })
            assert.equal(result.status, 0, result.stderr)
            assert.equal(statExists(home), false)
            const plan = JSON.parse(result.stdout)
            assert.deepEqual(plan.engine.command, ['node', 'dist/cli/bin.js', 'run'])
            assert.deepEqual(plan.ui.command, ['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000'])
            assert.equal(plan.ui.env.BLINKY_LOCAL_AUTH, '1')
            assert.equal(plan.ui.env.NEXT_PUBLIC_SUPABASE_URL, undefined)
            assert.equal(plan.engine.env.RERUN_DESKTOP, 'off')
            assert.equal(plan.engine.env.RERUN_API_KEY, '(missing)')
            assert.doesNotMatch(result.stdout, /54421/)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})

function statExists(path) {
    try {
        statSync(path)
        return true
    } catch {
        return false
    }
}
