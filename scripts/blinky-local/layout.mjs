import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const UI_HOST = '127.0.0.1'
export const DEFAULT_UI_PORT = 3000
export const DEFAULT_ENGINE_PORT = 3001
export const READY_TIMEOUT_MS = 30_000
export const STOP_GRACE_MS = 5_000

export const ENGINE_COMMAND = ['node', 'dist/cli/bin.js', 'run']

export function uiCommand(port = DEFAULT_UI_PORT) {
    return ['node', 'node_modules/next/dist/bin/next', 'start', '-H', UI_HOST, '-p', String(port)]
}

export const STRIPPED_CHILD_ENV = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RERUN_PAIR_TOKEN',
    'RERUN_HUB_URL',
    'OPENROUTER_API_KEY',
]

export function repoRootFrom(moduleDir) {
    return join(moduleDir, '..', '..')
}

export function supportDir({ env = process.env, home = homedir(), platform = process.platform } = {}) {
    const explicit = String(env.BLINKY_SUPPORT_DIR || env.BLINKY_HOME || '').trim()
    if (explicit) return explicit
    if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'BlinkyBot')
    return join(home, '.blinkybot')
}

export function parsePort(raw, fallback, name) {
    if (raw == null || String(raw).trim() === '') return fallback
    const port = Number(String(raw).trim())
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} is not a port: ${raw}`)
    }
    return port
}

export function resolvePorts(env = process.env) {
    const uiPort = parsePort(env.BLINKY_UI_PORT, DEFAULT_UI_PORT, 'BLINKY_UI_PORT')
    const enginePort = parsePort(env.BLINKY_ENGINE_PORT, DEFAULT_ENGINE_PORT, 'BLINKY_ENGINE_PORT')
    if (uiPort === enginePort) throw new Error(`BLINKY_UI_PORT and BLINKY_ENGINE_PORT are both ${uiPort}`)
    return { uiPort, enginePort }
}

export function layoutPaths(home) {
    return {
        home,
        engineData: join(home, 'engine'),
        authDb: join(home, 'local-auth.sqlite'),
        apiKey: join(home, 'engine-api-key'),
        runDir: join(home, 'run'),
        logDir: join(home, 'logs'),
        enginePid: join(home, 'run', 'engine.pid'),
        uiPid: join(home, 'run', 'ui.pid'),
        engineLog: join(home, 'logs', 'engine.log'),
        uiLog: join(home, 'logs', 'ui.log'),
    }
}

export function readOrCreateApiKey(file) {
    mkdirSync(dirname(file), { recursive: true })
    if (existsSync(file)) {
        const existing = readFileSync(file, 'utf8').trim()
        if (existing) return { key: existing, created: false }
    }
    const key = randomBytes(32).toString('hex')
    writeFileSync(file, `${key}\n`, { mode: 0o600 })
    chmodSync(file, 0o600)
    return { key, created: true }
}

export function readApiKey(file) {
    if (!existsSync(file)) return ''
    return readFileSync(file, 'utf8').trim()
}

export function missingBinaries(repoRoot) {
    const missing = []
    if (!existsSync(join(repoRoot, 'apps/engine/dist/cli/bin.js'))) missing.push('apps/engine/dist/cli/bin.js')
    if (!existsSync(join(repoRoot, 'apps/ui/.next'))) missing.push('apps/ui/.next')
    if (!existsSync(join(repoRoot, 'apps/ui/node_modules/next/dist/bin/next'))) missing.push('apps/ui/node_modules/next/dist/bin/next')
    return missing
}

export function buildPlan({ repoRoot, home, apiKey = '', uiPort = DEFAULT_UI_PORT, enginePort = DEFAULT_ENGINE_PORT }) {
    const paths = layoutPaths(home)
    const engineUrl = `http://${UI_HOST}:${enginePort}`
    const uiUrl = `http://${UI_HOST}:${uiPort}`
    const sharedKey = apiKey
    return {
        home,
        paths,
        uiPort,
        enginePort,
        engine: {
            cwd: join(repoRoot, 'apps/engine'),
            command: ENGINE_COMMAND,
            url: engineUrl,
            healthUrl: `${engineUrl}/health`,
            port: enginePort,
            env: {
                RERUN_DATA_DIR: paths.engineData,
                RERUN_HOST: UI_HOST,
                RERUN_PORT: String(enginePort),
                RERUN_API_KEY: sharedKey,
                RERUN_HUB_BASE_URL: uiUrl,
                RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude',
                RERUN_DESKTOP: 'off',
                RERUN_LOG_LEVEL: 'info',
            },
        },
        ui: {
            cwd: join(repoRoot, 'apps/ui'),
            command: uiCommand(uiPort),
            url: uiUrl,
            healthUrl: `${uiUrl}/api/version`,
            port: uiPort,
            env: {
                NODE_ENV: 'production',
                HOSTNAME: UI_HOST,
                PORT: String(uiPort),
                NEXT_PUBLIC_APP_URL: uiUrl,
                RERUN_ENGINE_URL: engineUrl,
                RERUN_ENGINE_BROWSER_URL: engineUrl,
                RERUN_ENGINE_API_KEY: sharedKey,
                BLINKY_LOCAL_AUTH: '1',
                BLINKY_LOCAL_AUTH_DB: paths.authDb,
            },
        },
    }
}

export function redactPlan(plan) {
    const hide = (value) => (value ? '(set)' : '(missing)')
    return {
        ...plan,
        engine: { ...plan.engine, env: { ...plan.engine.env, RERUN_API_KEY: hide(plan.engine.env.RERUN_API_KEY) } },
        ui: { ...plan.ui, env: { ...plan.ui.env, RERUN_ENGINE_API_KEY: hide(plan.ui.env.RERUN_ENGINE_API_KEY) } },
    }
}

export function spawnEnv(overlay, base = process.env) {
    const env = { ...base }
    for (const key of STRIPPED_CHILD_ENV) delete env[key]
    return { ...env, ...overlay }
}

export function decideStart({ pidAlive, healthy, portFree }) {
    if (pidAlive && healthy) return 'adopt'
    if (pidAlive) return 'wait'
    if (!portFree) return 'blocked'
    return 'spawn'
}

export function readPid(file) {
    if (!existsSync(file)) return null
    const pid = Number(readFileSync(file, 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
}

export function pidAlive(pid) {
    if (!pid) return false
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export async function isReady(url, kind) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
        if (!response.ok) return false
        const body = await response.json()
        if (kind === 'engine') return body?.status === 'ok'
        return body != null && Object.prototype.hasOwnProperty.call(body, 'buildSha')
    } catch {
        return false
    }
}
