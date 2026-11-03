import { spawn } from 'node:child_process'
import { claudeAdapter } from './claude.js'
import { codexAdapter } from './codex.js'
import { grokAdapter } from './grok.js'
import { kimiAdapter } from './kimi.js'
import { CLI_RUNTIME_IDS, CliAdapterError, type CliAdapterInfo, type CliInvocation, type CliRunRequest, type CliRunResult, type CliRuntimeId } from './types.js'

const ADAPTERS = {
    codex: codexAdapter,
    kimi: kimiAdapter,
    grok: grokAdapter,
    claude: claudeAdapter,
} as const

export function listCliAdapters(): CliAdapterInfo[] {
    return CLI_RUNTIME_IDS.map(id => {
        const adapter = ADAPTERS[id]
        return { id: adapter.id, binaryName: adapter.binaryName, pathEnv: adapter.pathEnv, homeEnv: adapter.homeEnv, maturity: adapter.maturity }
    })
}

// Building an argv does not spawn and does not read the feature flag. Callers can show the
// command while the spawn stays off.
export function cliInvocation(id: CliRuntimeId, request: CliRunRequest, processEnv: NodeJS.ProcessEnv = process.env): CliInvocation {
    assertCliRequest(request)
    return ADAPTERS[id].build(request, processEnv)
}

export function enabledCliRuntimes(processEnv: NodeJS.ProcessEnv = process.env): Set<CliRuntimeId> {
    const enabled = new Set<CliRuntimeId>()
    const raw = processEnv.RERUN_CLI_ADAPTERS ?? ''
    for (const part of raw.split(',')) {
        const id = part.trim()
        if ((CLI_RUNTIME_IDS as readonly string[]).includes(id)) enabled.add(id as CliRuntimeId)
    }
    return enabled
}

export type RunLocalCliOptions = {
    processEnv?: NodeJS.ProcessEnv
    signal?: AbortSignal
    timeoutMs?: number
}

// Spawns one local CLI turn and buffers stdout/stderr until the process exits. Foreman's
// streaming providers do not go through here; see docs/cli-adapters-phase1.md.
export async function runLocalCli(id: CliRuntimeId, request: CliRunRequest, options: RunLocalCliOptions = {}): Promise<CliRunResult> {
    const processEnv = options.processEnv ?? process.env
    if (!enabledCliRuntimes(processEnv).has(id)) {
        throw new CliAdapterError(`CLI adapter "${id}" is off. Add "${id}" to RERUN_CLI_ADAPTERS to spawn it.`)
    }
    const invocation = cliInvocation(id, request, processEnv)
    return spawnCli(invocation, options)
}

function assertCliRequest(request: CliRunRequest): void {
    if (request.prompt.trim() === '') throw new CliAdapterError('CLI adapter prompt is empty.')
    if (request.cwd.trim() === '') throw new CliAdapterError('CLI adapter cwd is empty.')
    if (request.session?.kind === 'resume' && request.session.id.trim() === '') throw new CliAdapterError('CLI adapter resume id is empty.')
}

function spawnCli(invocation: CliInvocation, options: RunLocalCliOptions): Promise<CliRunResult> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(new CliAdapterError(`CLI adapter "${invocation.id}" was aborted.`))
            return
        }
        const child = spawn(invocation.command, invocation.args, {
            cwd: invocation.cwd,
            env: invocation.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let settled = false
        const finish = (fn: () => void): void => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            options.signal?.removeEventListener('abort', onAbort)
            fn()
        }
        const timer =
            options.timeoutMs !== undefined
                ? setTimeout(() => {
                      child.kill('SIGTERM')
                      finish(() => reject(new CliAdapterError(`CLI adapter "${invocation.id}" timed out after ${options.timeoutMs}ms.`)))
                  }, options.timeoutMs)
                : undefined
        const onAbort = (): void => {
            child.kill('SIGTERM')
            finish(() => reject(new CliAdapterError(`CLI adapter "${invocation.id}" was aborted.`)))
        }
        options.signal?.addEventListener('abort', onAbort)
        child.stdout!.setEncoding('utf8')
        child.stderr!.setEncoding('utf8')
        child.stdout!.on('data', (chunk: string) => {
            stdout += chunk
        })
        child.stderr!.on('data', (chunk: string) => {
            stderr += chunk
        })
        child.once('error', error => {
            finish(() => reject(new CliAdapterError(`CLI adapter "${invocation.id}" failed to start ${invocation.command}: ${error.message}`)))
        })
        child.once('close', code => {
            finish(() => resolve({ invocation, exitCode: code, stdout, stderr }))
        })
    })
}
