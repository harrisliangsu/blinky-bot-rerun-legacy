// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../../lib/logger.js'
import { trackCliProcess } from '../../workspace/runs.js'
import { agentWorkspace } from './workspace.js'
import {
    REX_WARNING_LAUNCH_FAILED,
    REX_WARNING_NOT_INSTALLED,
    assertLocalRexArgs,
    disableRexWatch,
    firstJsonValue,
    isDirectCliProbe,
    osc7501,
    readRexWatch,
    recordRexWarning,
    rexClientEnv,
    rexLabel,
    rexMirrorArgs,
    rexSessionLabel,
    sessionIdFromList,
    sessionIdFromNew,
    wrapperScript,
    type RexWatch,
} from './protocol.js'

export class AgentProcessError extends Error {
    constructor(
        readonly kind: 'abort' | 'timeout' | 'start',
        message: string,
    ) {
        super(message)
        this.name = 'AgentProcessError'
    }
}

export type AgentStdio = 'buffer' | 'proxy'

export type AgentProcessOptions = {
    command: string
    args: string[]
    cwd: string
    env: NodeJS.ProcessEnv
    label?: string
    handle?: string
    agentId?: string
    signal?: AbortSignal
    timeoutMs?: number
    rex: RexWatch | null
    warningFile?: string
    statePath?: string
    stdio: AgentStdio
}

export type AgentProcessResult = { exitCode: number | null; stdout: string; stderr: string }

type Live = { child: ChildProcess | null }

type Mirror = {
    write: (chunk: Buffer) => void
    finish: (state: 'done' | 'error', message: string) => void
}

const VERSION_BUDGET_MS = 5000

export async function runAgentProcess(options: AgentProcessOptions): Promise<AgentProcessResult> {
    if (options.signal?.aborted) throw new AgentProcessError('abort', 'aborted')
    const live: Live = { child: null }
    let timer: NodeJS.Timeout | undefined
    let removeAbort = () => {}
    const abort = new Promise<never>((_, reject) => {
        if (!options.signal) return
        const onAbort = () => {
            live.child?.kill('SIGTERM')
            reject(new AgentProcessError('abort', 'aborted'))
        }
        options.signal.addEventListener('abort', onAbort)
        removeAbort = () => options.signal?.removeEventListener('abort', onAbort)
    })
    const timeout =
        options.timeoutMs !== undefined
            ? new Promise<never>((_, reject) => {
                  timer = setTimeout(() => {
                      live.child?.kill('SIGTERM')
                      reject(new AgentProcessError('timeout', 'timed out'))
                  }, options.timeoutMs)
              })
            : null
    const mirror = options.rex && !isDirectCliProbe(options.args) ? await openMirror(options) : null
    try {
        const task = launchDirect(options, live, mirror)
        return await Promise.race(timeout ? [task, abort, timeout] : [task, abort])
    } finally {
        if (timer) clearTimeout(timer)
        removeAbort()
        mirror?.finish('error', 'cancelled')
    }
}

function launchDirect(options: AgentProcessOptions, live: Live, mirror: Mirror | null): Promise<AgentProcessResult> {
    return new Promise((resolve, reject) => {
        const proxy = options.stdio === 'proxy'
        const stdinBuffer: Buffer[] = []
        let stdinEnded = false
        if (proxy && process.stdin) {
            process.stdin.on('data', (chunk: Buffer) => {
                if (live.child?.stdin) live.child.stdin.write(chunk)
                else stdinBuffer.push(chunk)
            })
            process.stdin.on('end', () => {
                stdinEnded = true
                live.child?.stdin?.end()
            })
        }
        const child = spawn(options.command, options.args, {
            cwd: options.cwd,
            env: options.env,
            stdio: proxy ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        })
        live.child = child
        const tracked = options.agentId ? trackCliProcess(options.agentId, options.label ?? options.command, options.command, child.pid ?? null) : null
        if (proxy && child.stdin) {
            for (const chunk of stdinBuffer) child.stdin.write(chunk)
            if (stdinEnded) child.stdin.end()
        }
        let stdout = ''
        let stderr = ''
        let settled = false
        const finish = (fn: () => void) => {
            if (settled) return
            settled = true
            tracked?.end()
            fn()
        }
        const take = (chunk: Buffer, into: 'stdout' | 'stderr') => {
            const text = chunk.toString('utf8')
            if (into === 'stdout') stdout += text
            else stderr += text
            if (proxy) {
                if (into === 'stdout') process.stdout.write(chunk)
                else process.stderr.write(chunk)
            }
            mirror?.write(chunk)
        }
        child.once('error', error => finish(() => reject(new AgentProcessError('start', error.message))))
        child.stdout?.on('data', (chunk: Buffer) => take(chunk, 'stdout'))
        child.stderr?.on('data', (chunk: Buffer) => take(chunk, 'stderr'))
        child.once('close', code => {
            const state = code === 0 ? 'done' : 'error'
            mirror?.finish(state, state === 'done' ? 'done' : 'failed')
            finish(() => resolve({ exitCode: code, stdout, stderr }))
        })
    })
}

// The CLI stays a child of BlinkyBot so abort still reaches it. Rex only shows a copy.
async function openMirror(options: AgentProcessOptions): Promise<Mirror | null> {
    const watch = options.rex
    if (!watch) return null
    const installed = await rexOk(watch.bin, options.env)
    if (!installed) {
        disableRexWatch(options.statePath)
        recordRexWarning(options.warningFile, REX_WARNING_NOT_INSTALLED)
        logger.warn('rex version failed; watching was turned off')
        return null
    }
    const workspace = options.agentId ? agentWorkspace(options.agentId) : options.cwd
    mkdirSync(workspace, { recursive: true })
    try {
        const session = await ensureSession(watch.bin, rexSessionLabel(options.handle ?? options.label), options.env)
        const dir = mkdtempSync(join(tmpdir(), 'blinky-rex-'))
        const file = join(dir, 'activity.log')
        const append = (text: string) => {
            try {
                appendFileSync(file, text)
            } catch {
                return
            }
        }
        append(osc7501('working', rexLabel(options.label)) + '\n')
        const args = rexMirrorArgs({ session, label: rexLabel(options.label), cwd: workspace, file })
        const opened = await startMirrorCommand(watch.bin, args, options.env)
        if (!opened) {
            rmSync(dir, { recursive: true, force: true })
            recordRexWarning(options.warningFile, REX_WARNING_LAUNCH_FAILED)
            return null
        }
        let finished = false
        return {
            write: chunk => {
                if (!finished) append(chunk.toString('utf8'))
            },
            finish: (state, message) => {
                if (finished) return
                finished = true
                append(osc7501(state, message) + '\n')
            },
        }
    } catch (error) {
        logger.warn({ err: error }, 'rex mirror was not opened')
        recordRexWarning(options.warningFile, REX_WARNING_LAUNCH_FAILED)
        return null
    }
}

async function rexOk(bin: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    const child = spawn(bin, ['version'], { stdio: 'ignore', env: rexClientEnv(env) })
    const code = await Promise.race([onceClose(child), delay(VERSION_BUDGET_MS).then(() => {
        child.kill('SIGTERM')
        return null
    })])
    return code === 0
}

async function ensureSession(bin: string, label: string, env: NodeJS.ProcessEnv): Promise<string> {
    const listed = await rexJson(bin, ['session', 'ls', '--json'], env)
    if (listed.code !== 0) throw new Error('rex session ls failed')
    const existing = sessionIdFromList(listed.json, label)
    if (existing) return existing
    const created = await rexJson(bin, ['session', 'new', label, '--json'], env)
    const id = sessionIdFromNew(created.json)
    if (created.code !== 0 || !id) throw new Error('rex session new failed')
    return id
}

async function rexJson(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; json: unknown }> {
    assertLocalRexArgs(args)
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: rexClientEnv(env) })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
        stdout += chunk
    })
    const code = await onceClose(child)
    return { code, json: firstJsonValue(stdout) }
}

async function startMirrorCommand(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: rexClientEnv(env) })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
        stdout += chunk
    })
    const code = await onceClose(child)
    return code === 0 && firstJsonValue(stdout) !== null
}

function onceClose(child: ChildProcess): Promise<number | null> {
    return new Promise(resolve => {
        child.once('error', () => resolve(null))
        child.once('close', code => resolve(code))
    })
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function outerModulePath(): string {
    return fileURLToPath(new URL('./outer.js', import.meta.url))
}

export function providerRex(
    env: NodeJS.ProcessEnv,
    input: { configured?: string; fallback: string; label: string; handle: string; agentId: string; nodePath?: string; outerPath?: string },
): { executable?: string; extraEnv: Record<string, string> } {
    const watch = readRexWatch(env)
    if (!watch) return { executable: input.configured, extraEnv: {} }
    const state = env.BLINKY_REX_STATE
    if (!state) return { executable: input.configured, extraEnv: {} }
    const nodePath = input.nodePath ?? process.execPath
    const outerPath = input.outerPath ?? outerModulePath()
    const wrapperPath = join(dirname(state), 'rex-wrapper.sh')
    try {
        mkdirSync(dirname(wrapperPath), { recursive: true })
        writeFileSync(wrapperPath, wrapperScript(nodePath, outerPath), { mode: 0o755 })
        chmodSync(wrapperPath, 0o755)
    } catch (error) {
        logger.warn({ err: error }, 'rex wrapper was not written')
        return { executable: input.configured, extraEnv: {} }
    }
    const real = input.configured && input.configured !== '' ? input.configured : input.fallback
    const extraEnv: Record<string, string> = {
        BLINKY_REX_REAL: real,
        BLINKY_REX_LABEL: rexLabel(input.label),
        BLINKY_REX_HANDLE: input.handle,
        BLINKY_REX_AGENT_ID: input.agentId,
        BLINKY_REX_STATE: state,
    }
    if (env.BLINKY_REX_WARNING_FILE) extraEnv.BLINKY_REX_WARNING_FILE = env.BLINKY_REX_WARNING_FILE
    return { executable: wrapperPath, extraEnv }
}
