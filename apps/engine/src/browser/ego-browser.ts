import { spawn } from 'node:child_process'
import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Helpers below are the ones ego-browser preloads into `ego-browser nodejs`.
// Names come from the ego-browser skill (useOrCreateTaskSpace, openOrReuseTab,
// snapshotText, pageInfo, js, cdp, captureScreenshot, cliLog). Timeout values
// that are not named *Ms are seconds.

export const EGO_BROWSER_AGENT_NOTE =
    'Browser tasks use ego(lite) only. Call browser_navigate when you have it. Otherwise run `ego-browser skill` and follow it; the ego-browser command is on PATH (usually ~/.local/bin). Do not launch Chromium, Playwright, or any other browser.'

export const EGO_BROWSER_SETUP =
    'ego(lite) is not ready, so this browser task did not run. Install ego(lite), open it, and finish onboarding so the ego-browser command is registered (usually ~/.local/bin). BlinkyBot shows the status and the installer under Settings → ego(lite). This task does not fall back to another browser.\n\nego(lite) 尚未就绪，这次浏览器任务没有执行。请安装 ego(lite)，打开它并完成首次引导，让 ego-browser 出现在 PATH 上（通常是 ~/.local/bin）。在 BlinkyBot 的「设置 → ego(lite)」查看状态和安装。此任务不会改用其他浏览器。'

const PAYLOAD_MARK = 'BLINKY_EGO_JSON '
const HTML_CAP = 1_500_000
const TEXT_CAP = 200_000

const NAV_JS = String.raw`(() => { const e = performance.getEntriesByType('navigation')[0]; return e && typeof e.responseStatus === 'number' ? e.responseStatus : 0 })()`
const HTML_JS = 'document.documentElement ? document.documentElement.outerHTML : ""'
const LINKS_JS = String.raw`(() => [...document.querySelectorAll('a[href]')].slice(0, 300).map(a => ({ href: a.href, text: String(a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) })))()`

export const EGO_NODE_SCRIPT = `
const space = process.env.BLINKY_EGO_SPACE
const url = process.env.BLINKY_EGO_URL
const timeout = Number(process.env.BLINKY_EGO_TIMEOUT_SEC || '30')
const wantLinks = process.env.BLINKY_EGO_LINKS === '1'
const wantShot = process.env.BLINKY_EGO_SHOT === '1'
const task = await useOrCreateTaskSpace(space)
await openOrReuseTab(url, { wait: true, timeout })
let info = null
try { info = await pageInfo() } catch (e) { info = { error: String(e && e.message || e) } }
if (info && info.dialog) {
  await cdp('Page.handleJavaScriptDialog', { accept: true })
}
const snapshot = await snapshotText()
let text = ''
if (typeof snapshot === 'string') text = snapshot
else if (snapshot && typeof snapshot.content === 'string') text = snapshot.content
else text = JSON.stringify(snapshot) ?? ''
if (text.length > ${TEXT_CAP}) text = text.slice(0, ${TEXT_CAP})
let status = 0
try {
  const nav = await js(${JSON.stringify(NAV_JS)})
  if (typeof nav === 'number' && Number.isFinite(nav)) status = nav
} catch {}
let html = ''
try {
  const doc = await js(${JSON.stringify(HTML_JS)})
  if (typeof doc === 'string') html = doc.length > ${HTML_CAP} ? doc.slice(0, ${HTML_CAP}) : doc
} catch {}
let links = []
if (wantLinks) {
  try {
    const found = await js(${JSON.stringify(LINKS_JS)})
    if (Array.isArray(found)) links = found
  } catch {}
}
let screenshot = null
if (wantShot) {
  try { screenshot = await captureScreenshot() } catch (e) { screenshot = { error: String(e && e.message || e) } }
}
const finalUrl = info && typeof info.url === 'string' ? info.url : url
const taskId = task && task.id != null ? String(task.id) : null
cliLog(${JSON.stringify(PAYLOAD_MARK)} + JSON.stringify({ text, status, html, links, screenshot, finalUrl, taskId }))
`

export function egoBrowserSystem(system: string | undefined): string {
    const body = system?.trim()
    return body ? `${body}\n\n${EGO_BROWSER_AGENT_NOTE}` : EGO_BROWSER_AGENT_NOTE
}

export function egoLocalBin(home: string): string {
    return join(home, '.local', 'bin')
}

export function withEgoOnPath<T extends { PATH?: string; HOME?: string }>(env: T, home = env.HOME || homedir()): T {
    const dir = egoLocalBin(home)
    const parts = (env.PATH ?? '').split(':').filter(part => part.length > 0)
    if (parts.includes(dir)) return env
    return { ...env, PATH: [dir, ...parts].join(':') }
}

export function isExecutableFile(path: string): boolean {
    try {
        const info = statSync(path)
        if (!info.isFile()) return false
        accessSync(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

export function locateEgoBrowser(env: NodeJS.ProcessEnv = process.env, home = env.HOME || homedir(), isExecutable: (path: string) => boolean = isExecutableFile): string | null {
    const explicit = env.EGO_BROWSER_PATH
    if (explicit && isExecutable(explicit)) return explicit
    const dirs = [...(env.PATH ?? '').split(':'), egoLocalBin(home)]
    const seen = new Set<string>()
    for (const dir of dirs) {
        if (!dir || seen.has(dir)) continue
        seen.add(dir)
        const candidate = join(dir, 'ego-browser')
        if (isExecutable(candidate)) return candidate
    }
    return null
}

export type EgoDriveInput = {
    agentId: string
    url: string
    timeoutMs: number
    links: boolean
    screenshot: boolean
}

export type EgoPage = {
    text: string
    status: number
    html: string
    links: Array<{ href: string; text: string }>
    finalUrl: string
    screenshot: unknown
    taskId: string | null
}

export type EgoDrive = { ok: true; page: EgoPage } | { ok: false; missing: true } | { ok: false; missing: false; message: string }

export type EgoSpawn = (command: string, script: string, env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<{ code: number | null; stdout: string; stderr: string }>

export function egoTaskSpace(agentId: string): string {
    return `blinky-${agentId}`
}

export function egoTimeoutSec(timeoutMs: number): number {
    return Math.min(120, Math.max(1, Math.ceil(timeoutMs / 1000)))
}

function asLink(value: unknown): { href: string; text: string } | null {
    if (!value || typeof value !== 'object') return null
    const href = (value as { href?: unknown }).href
    const text = (value as { text?: unknown }).text
    if (typeof href !== 'string') return null
    return { href, text: typeof text === 'string' ? text : '' }
}

export function parseEgoPayload(stdout: string): EgoPage | null {
    const at = stdout.lastIndexOf(PAYLOAD_MARK)
    if (at < 0) return null
    const line = stdout.slice(at + PAYLOAD_MARK.length).split('\n', 1)[0] ?? ''
    let parsed: unknown
    try {
        parsed = JSON.parse(line)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const row = parsed as Partial<EgoPage>
    const links = Array.isArray(row.links) ? row.links.map(asLink).filter((link): link is { href: string; text: string } => link !== null) : []
    return {
        text: typeof row.text === 'string' ? row.text : '',
        status: typeof row.status === 'number' && Number.isFinite(row.status) ? row.status : 0,
        html: typeof row.html === 'string' ? row.html : '',
        links,
        finalUrl: typeof row.finalUrl === 'string' && row.finalUrl ? row.finalUrl : '',
        screenshot: row.screenshot,
        taskId: row.taskId == null ? null : String(row.taskId),
    }
}

const PNG = [0x89, 0x50, 0x4e, 0x47]
const JPEG = [0xff, 0xd8, 0xff]

function looksLikeImage(bytes: Buffer): boolean {
    if (bytes.length < 8) return false
    if (PNG.every((byte, index) => bytes[index] === byte)) return true
    return JPEG.every((byte, index) => bytes[index] === byte)
}

function bytesFromString(value: string): Buffer | null {
    const trimmed = value.trim()
    const dataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(trimmed)
    if (dataUrl) {
        const decoded = Buffer.from(dataUrl[1]!.replace(/\s/g, ''), 'base64')
        return looksLikeImage(decoded) ? decoded : null
    }
    if (trimmed.startsWith('/') || trimmed.startsWith('~')) return null
    if (trimmed.length < 64 || !/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return null
    const decoded = Buffer.from(trimmed.replace(/\s/g, ''), 'base64')
    return looksLikeImage(decoded) ? decoded : null
}

function pathFromUnknown(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.startsWith('/') || trimmed.startsWith('~') ? trimmed : null
    }
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    for (const key of ['path', 'filePath', 'file', 'screenshotPath', 'savedPath']) {
        const found = row[key]
        if (typeof found === 'string' && (found.startsWith('/') || found.startsWith('~'))) return found
    }
    return null
}

function bytesFromUnknown(value: unknown): Buffer | null {
    if (typeof value === 'string') return bytesFromString(value)
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    for (const key of ['data', 'base64', 'png', 'image', 'bytes']) {
        const found = row[key]
        if (typeof found === 'string') {
            const decoded = bytesFromString(found)
            if (decoded) return decoded
        }
        if (Array.isArray(found) && found.every(item => typeof item === 'number')) {
            const decoded = Buffer.from(found)
            if (looksLikeImage(decoded)) return decoded
        }
    }
    return null
}

export function screenshotBytes(value: unknown, readFile: (path: string) => Buffer = readFileSync): Buffer | null {
    const inline = bytesFromUnknown(value)
    if (inline) return inline
    const path = pathFromUnknown(value)
    if (!path || path.startsWith('~')) return null
    try {
        const bytes = readFile(path)
        return looksLikeImage(bytes) ? bytes : null
    } catch {
        return null
    }
}

export function spawnEgoBrowser(command: string, script: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, ['nodejs'], { env, stdio: ['pipe', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        let settled = false
        const finish = (fn: () => void): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            fn()
        }
        const timer = setTimeout(() => {
            child.kill('SIGTERM')
            finish(() => resolve({ code: null, stdout, stderr: `${stderr}\nego-browser timed out` }))
        }, timeoutMs)
        child.stdout!.setEncoding('utf8')
        child.stderr!.setEncoding('utf8')
        child.stdout!.on('data', (chunk: string) => {
            stdout += chunk
        })
        child.stderr!.on('data', (chunk: string) => {
            stderr += chunk
        })
        child.once('error', error => finish(() => reject(error)))
        child.once('close', code => finish(() => resolve({ code, stdout, stderr })))
        child.stdin!.end(script)
    })
}

function childEnvFor(parent: NodeJS.ProcessEnv, home: string, input: EgoDriveInput): NodeJS.ProcessEnv {
    const env = withEgoOnPath({ ...parent }, home)
    env.BLINKY_EGO_SPACE = egoTaskSpace(input.agentId)
    env.BLINKY_EGO_URL = input.url
    env.BLINKY_EGO_TIMEOUT_SEC = String(egoTimeoutSec(input.timeoutMs))
    env.BLINKY_EGO_LINKS = input.links ? '1' : '0'
    env.BLINKY_EGO_SHOT = input.screenshot ? '1' : '0'
    return env
}

export async function driveEgoBrowser(
    input: EgoDriveInput,
    options: { env?: NodeJS.ProcessEnv; home?: string; isExecutable?: (path: string) => boolean; spawn?: EgoSpawn } = {},
): Promise<EgoDrive> {
    const env = options.env ?? process.env
    const home = options.home ?? env.HOME ?? homedir()
    const command = locateEgoBrowser(env, home, options.isExecutable ?? isExecutableFile)
    if (!command) return { ok: false, missing: true }
    const run = options.spawn ?? spawnEgoBrowser
    let result: { code: number | null; stdout: string; stderr: string }
    try {
        result = await run(command, EGO_NODE_SCRIPT, childEnvFor(env, home, input), input.timeoutMs + 15_000)
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return { ok: false, missing: true }
        return { ok: false, missing: false, message: error instanceof Error ? error.message : String(error) }
    }
    const page = parseEgoPayload(result.stdout)
    if (page) return { ok: true, page }
    const detail = (result.stderr || result.stdout).trim().slice(0, 2_000)
    const timedOut = result.code === null
    const head = timedOut ? 'ego-browser timed out' : `ego-browser exited ${result.code ?? 'unknown'}`
    return { ok: false, missing: false, message: detail ? `${head}: ${detail}` : head }
}
