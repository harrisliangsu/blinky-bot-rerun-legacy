// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const REX_FEATURE_MARKER = 'blinky-rex-watch'

export const REX_WARNING_LAUNCH_FAILED = 'rex-launch-failed'
export const REX_WARNING_CLOSED_EARLY = 'rex-closed-early'
export const REX_WARNING_NOT_INSTALLED = 'rex-not-installed'

const REMOTE_REX_FLAGS = ['--listen', '--extra-listen', '--allow-anonymous', '--tailscale', '--tailscale-hostname', '--tailscale-auth-key-file', '--websocket-origin-pattern', '--server', '-S']

export type RexWatch = { bin: string }

export function parseRexWatch(text: string): RexWatch | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as { enabled?: unknown; bin?: unknown }
    if (record.enabled !== true) return null
    if (typeof record.bin !== 'string' || !record.bin.startsWith('/') || record.bin.includes('\0') || record.bin.includes('\n')) return null
    return { bin: record.bin }
}

export function readRexWatch(env: NodeJS.ProcessEnv, read: (path: string) => string | null = readWatchFile): RexWatch | null {
    const path = env.BLINKY_REX_STATE
    if (!path) return null
    const text = read(path)
    if (text === null) return null
    return parseRexWatch(text)
}

function readWatchFile(path: string): string | null {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return null
    }
}

export function recordRexWarning(file: string | undefined, code: string): void {
    if (!file) return
    try {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, `${code}\n`)
    } catch {
        return
    }
}

export function rexLabel(raw: string | undefined): string {
    const cleaned = (raw ?? '').replace(/[\r\n\0]/g, ' ').replace(/\s+/g, ' ').trim()
    const text = cleaned.slice(0, 80)
    return text.length > 0 ? text : 'BlinkyBot'
}

export function rexSessionLabel(handle: string | undefined): string {
    const cleaned = (handle ?? '').replace(/[\r\n\0/\\]/g, ' ').replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 48)
    return `blinky-${cleaned || 'agent'}`
}

export function osc7501(state: 'working' | 'done' | 'error', message: string): string {
    const msg = Buffer.from(message, 'utf8').toString('base64')
    return `\u001b]7501;state=${state}:app=blinky:msg=${msg}\u001b\\`
}

export function disableRexWatch(statePath: string | undefined): void {
    if (!statePath) return
    try {
        mkdirSync(dirname(statePath), { recursive: true })
        writeFileSync(statePath, `${JSON.stringify({ enabled: false })}\n`, { mode: 0o600 })
    } catch {
        return
    }
}

export function rexMirrorArgs(input: { session: string; label: string; cwd: string; file: string }): string[] {
    const args = ['run', '--json', '--keep-open', '--shell=none', '--focus=false', '--label', rexLabel(input.label), '-s', input.session, '-c', input.cwd, '--', '/usr/bin/tail', '-n', '+1', '-f', input.file]
    assertLocalRexArgs(args)
    return args
}

export function assertLocalRexArgs(args: string[]): void {
    const stop = args.indexOf('--')
    const flags = stop === -1 ? args : args.slice(0, stop)
    for (const arg of flags) {
        for (const flag of REMOTE_REX_FLAGS) {
            if (arg === flag || arg.startsWith(`${flag}=`)) throw new Error(`Refusing to expose Rex: ${flag}`)
        }
    }
}

export function sessionIdFromList(value: unknown, label: string): string | null {
    if (!value || typeof value !== 'object') return null
    const sessions = (value as { sessions?: unknown }).sessions
    if (!Array.isArray(sessions)) return null
    const wanted = label.toLowerCase()
    for (const session of sessions) {
        if (!session || typeof session !== 'object') continue
        const record = session as { session_id?: unknown; label?: unknown }
        if (typeof record.label === 'string' && record.label.toLowerCase() === wanted && typeof record.session_id === 'string' && record.session_id.startsWith('session:')) {
            return record.session_id
        }
    }
    return null
}

export function sessionIdFromNew(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const record = value as { session_id?: unknown; session?: { session_id?: unknown } }
    if (typeof record.session_id === 'string' && record.session_id.startsWith('session:')) return record.session_id
    if (typeof record.session?.session_id === 'string' && record.session.session_id.startsWith('session:')) return record.session.session_id
    return null
}

export function windowIdFromRun(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const id = (value as { window_id?: unknown }).window_id
    return typeof id === 'string' && id.startsWith('window:') ? id : null
}

export function firstJsonValue(text: string): unknown | null {
    const start = text.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let index = start; index < text.length; index += 1) {
        const char = text[index]
        if (inString) {
            if (escape) escape = false
            else if (char === '\\') escape = true
            else if (char === '"') inString = false
            continue
        }
        if (char === '"') inString = true
        else if (char === '{') depth += 1
        else if (char === '}') {
            depth -= 1
            if (depth === 0) {
                try {
                    return JSON.parse(text.slice(start, index + 1))
                } catch {
                    return null
                }
            }
        }
    }
    return null
}

export function rexClientEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'USER', 'LOGNAME', 'SHELL']) {
        if (typeof source[key] === 'string') env[key] = source[key]
    }
    return env
}

export function specEnv(source: NodeJS.ProcessEnv): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(source)) {
        if (typeof value !== 'string' || key === 'REX_SERVER') continue
        env[key] = value
    }
    return env
}

export function shQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}

export function wrapperScript(nodePath: string, outerPath: string): string {
    return `#!/bin/sh\nexec ${shQuote(nodePath)} ${shQuote(outerPath)} "$@"\n`
}

export function isDirectCliProbe(args: string[]): boolean {
    const head = args[0]
    return head === '--version' || head === '-v' || head === '-V' || head === 'version' || head === '--help' || head === 'help'
}
