import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CliRuntimeId } from './cli-adapters/types.js'

const CREDENTIAL_FIELDS = new Set(['access_token', 'refresh_token', 'token', 'api_key', 'apiKey', 'OPENAI_API_KEY', 'personal_access_token', 'id_token'])

export type LocalChatCli = Extract<CliRuntimeId, 'kimi' | 'grok'>

export function isExecutableFile(path: string): boolean {
    try {
        if (!statSync(path).isFile()) return false
        accessSync(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

// Same directories the Mac onboarding searches. A GUI app does not inherit a login-shell PATH,
// so Homebrew, npm globals, and ~/.local/bin would otherwise hide a CLI the user just installed.
export function cliSearchDirectories(home: string, path: string | undefined, entries: (dir: string) => string[] = safeEntries): string[] {
    const dirs: string[] = []
    if (path) dirs.push(...path.split(':').filter(part => part.length > 0))
    dirs.push(
        '/opt/homebrew/bin',
        '/usr/local/bin',
        join(home, '.local/bin'),
        join(home, '.npm-global/bin'),
        join(home, '.local/share/npm/bin'),
        join(home, 'Library/pnpm'),
        join(home, 'Library/pnpm/bin'),
        join(home, '.local/share/pnpm'),
        join(home, '.volta/bin'),
        join(home, '.bun/bin'),
        join(home, '.asdf/shims'),
        join(home, 'Library/Application Support/fnm/aliases/default/bin'),
        join(home, '.fnm/aliases/default/bin'),
        join(home, '.local/share/fnm/aliases/default/bin'),
    )
    const nvmRoot = join(home, '.nvm/versions/node')
    for (const name of entries(nvmRoot).filter(name => !name.startsWith('.'))) dirs.push(join(nvmRoot, name, 'bin'))
    const seen = new Set<string>()
    return dirs.filter(dir => dir.length > 0 && !seen.has(dir) && seen.add(dir))
}

export function augmentedCliPath(home: string, path: string | undefined): string {
    return cliSearchDirectories(home, path).join(':')
}

export function locateCliBinary(runtime: LocalChatCli, env: NodeJS.ProcessEnv, isExecutable: (path: string) => boolean = isExecutableFile): string | null {
    const pathEnv = runtime === 'kimi' ? 'RERUN_KIMI_PATH' : 'RERUN_GROK_PATH'
    const override = env[pathEnv]
    if (typeof override === 'string' && override !== '') return isExecutable(override) ? override : null
    const home = env.HOME || homedir()
    for (const dir of cliSearchDirectories(home, env.PATH)) {
        const candidate = join(dir, runtime)
        if (isExecutable(candidate)) return candidate
    }
    return null
}

export function cliInstallHint(runtime: LocalChatCli): string {
    if (runtime === 'kimi') return 'Kimi CLI is not installed. Install @moonshot-ai/kimi-code (`npm install -g @moonshot-ai/kimi-code`) and run `kimi login`.'
    return 'Grok CLI is not installed. Install @xai-official/grok (`npm install -g @xai-official/grok`) and run `grok login`.'
}

export function cliLoginHint(runtime: LocalChatCli): string {
    if (runtime === 'kimi') return 'Kimi CLI is not logged in. Run `kimi login`, then try again.'
    return 'Grok CLI is not logged in. Run `grok login`, or set XAI_API_KEY, then try again.'
}

export function cliReady(runtime: LocalChatCli, env: NodeJS.ProcessEnv): 'ready' | 'missing' | 'signed-out' {
    if (!locateCliBinary(runtime, env)) return 'missing'
    if (runtime === 'kimi') return kimiSignedIn(env) ? 'ready' : 'signed-out'
    return grokSignedIn(env) ? 'ready' : 'signed-out'
}

function kimiSignedIn(env: NodeJS.ProcessEnv): boolean {
    if (isCredential(env.KIMI_API_KEY)) return true
    const root = env.KIMI_CODE_HOME?.trim() || join(env.HOME || homedir(), '.kimi-code')
    const config = readText(join(root, 'config.toml'))
    if (config) {
        const inline = [...tomlValues('api_key', config), ...tomlValues('KIMI_API_KEY', config)]
        if (inline.some(isCredential)) return true
        for (const name of tomlValues('api_key_env', config)) if (isCredential(env[name])) return true
    }
    const explicit = env.KIMI_CODE_CREDENTIALS?.trim() || env.KIMI_CREDENTIALS?.trim()
    if (explicit && jsonHasCredential(readJson(explicit))) return true
    const credentials = join(root, 'credentials')
    if (jsonHasCredential(readJson(join(credentials, 'kimi-code.json')))) return true
    return safeEntries(credentials).some(name => name.endsWith('.json') && jsonHasCredential(readJson(join(credentials, name))))
}

function grokSignedIn(env: NodeJS.ProcessEnv): boolean {
    if (isCredential(env.XAI_API_KEY)) return true
    const root = env.GROK_HOME?.trim() || join(env.HOME || homedir(), '.grok')
    return grokHasLiveKey(readJson(join(root, 'auth.json')), Date.now())
}

function isCredential(value: string | undefined): boolean {
    const text = value?.trim() ?? ''
    if (text.length < 8) return false
    return !['null', 'none', 'nil', 'undefined', 'changeme', 'your-api-key', 'todo', 'example'].includes(text.toLowerCase())
}

function jsonHasCredential(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(jsonHasCredential)
    for (const [key, item] of Object.entries(value)) {
        if (CREDENTIAL_FIELDS.has(key) && typeof item === 'string' && isCredential(item)) return true
        if (jsonHasCredential(item)) return true
    }
    return false
}

function grokHasLiveKey(value: unknown, now: number): boolean {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(item => grokHasLiveKey(item, now))
    const record = value as Record<string, unknown>
    if (typeof record.key === 'string' && isCredential(record.key)) {
        const expiry = parseExpiry(record.expires_at)
        if (expiry === null || expiry > now) return true
    }
    return Object.values(record).some(item => grokHasLiveKey(item, now))
}

function parseExpiry(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return unixMillis(value)
    if (typeof value === 'string' && value.trim()) {
        const numeric = Number(value)
        if (Number.isFinite(numeric) && value.trim() !== '') return unixMillis(numeric)
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function unixMillis(value: number): number | null {
    if (value > 1_000_000_000_000) return value
    if (value > 1_000_000_000) return value * 1000
    return null
}

function tomlValues(key: string, text: string): string[] {
    const found: string[] = []
    for (const raw of text.split('\n')) {
        const line = stripTomlComment(raw).trim()
        const eq = line.indexOf('=')
        if (eq < 0) continue
        if (line.slice(0, eq).trim() !== key) continue
        found.push(unquote(line.slice(eq + 1).trim()))
    }
    return found
}

function stripTomlComment(line: string): string {
    let single = false
    let double = false
    let result = ''
    for (const character of line) {
        if (character === "'" && !double) single = !single
        else if (character === '"' && !single) double = !double
        else if (character === '#' && !single && !double) break
        result += character
    }
    return result
}

function unquote(raw: string): string {
    if (raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) return raw.slice(1, -1)
    return raw
}

function readText(path: string): string | null {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return null
    }
}

function readJson(path: string): unknown {
    const text = readText(path)
    if (!text) return null
    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

function safeEntries(dir: string): string[] {
    if (!existsSync(dir)) return []
    try {
        return readdirSync(dir)
    } catch {
        return []
    }
}
