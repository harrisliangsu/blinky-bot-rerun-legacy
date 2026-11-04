import { AgentProcessError, runAgentProcess } from '../rex/launch.js'
import { readRexWatch } from '../rex/protocol.js'
import { agentConfigSchema } from '../types.js'
import { agentProcessEnv } from '../process-env.js'
import { resolveCliCwd } from '../../workspace/cwd.js'
import { omitForeignAgentEnv } from '../../workspace/env.js'
import { claudeAdapter } from './claude.js'
import { parseCliStdout } from './parse.js'
import { codexAdapter } from './codex.js'
import { grokAdapter } from './grok.js'
import { kimiAdapter } from './kimi.js'
import { CLI_RUNTIME_IDS, CliAdapterError, type CliAdapterInfo, type CliInvocation, type CliRunRequest, type CliRunResult, type CliRuntimeId } from './types.js'

type SpawnedCli = Omit<CliRunResult, 'parsed'>

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
    // When set, cwd must stay inside this agent's workspace and the child env drops other agents' paths.
    agentId?: string
}

// Spawns one local CLI turn and buffers stdout/stderr until the process exits. Foreman's
// streaming providers do not go through here; see docs/cli-adapters-phase1.md.
export async function runLocalCli(id: CliRuntimeId, request: CliRunRequest, options: RunLocalCliOptions = {}): Promise<CliRunResult> {
    const inherited = options.processEnv ?? process.env
    if (!enabledCliRuntimes(inherited).has(id)) {
        throw new CliAdapterError(`CLI adapter "${id}" is off. Add "${id}" to RERUN_CLI_ADAPTERS to spawn it.`)
    }
    const scoped = scopeCliRun(options.agentId ? { ...request, agentId: options.agentId } : request, inherited)
    const invocation = cliInvocation(id, scoped.request, scoped.processEnv)
    const result = await spawnCli(invocation, { ...options, processEnv: scoped.processEnv }, scoped.request)
    return { ...result, parsed: parseCliStdout(id, result.stdout) }
}

function scopeCliRun(request: CliRunRequest, processEnv: NodeJS.ProcessEnv): { request: CliRunRequest; processEnv: NodeJS.ProcessEnv } {
    const agentId = request.agentId
    if (!agentId) return { request, processEnv }
    const cwd = resolveCliCwd(agentId, request.cwd)
    const agentEnv = agentProcessEnv({
        id: agentId,
        env: request.env ?? {},
        config: agentConfigSchema.parse({ name: agentId, tools: { sharedDb: false } }),
    }).env
    return {
        request: { ...request, cwd, env: { ...omitForeignAgentEnv(agentId, request.env ?? {}), ...agentEnv } },
        processEnv: omitForeignAgentEnv(agentId, processEnv),
    }
}

function assertCliRequest(request: CliRunRequest): void {
    if (request.prompt.trim() === '') throw new CliAdapterError('CLI adapter prompt is empty.')
    if (request.cwd.trim() === '') throw new CliAdapterError('CLI adapter cwd is empty.')
    if (request.session?.kind === 'resume' && request.session.id.trim() === '') throw new CliAdapterError('CLI adapter resume id is empty.')
}

function spawnCli(invocation: CliInvocation, options: RunLocalCliOptions, request: CliRunRequest): Promise<SpawnedCli> {
    const processEnv = options.processEnv ?? process.env
    if (options.signal?.aborted) return Promise.reject(new CliAdapterError(`CLI adapter "${invocation.id}" was aborted.`))
    return runAgentProcess({
        command: invocation.command,
        args: invocation.args,
        cwd: invocation.cwd,
        env: invocation.env,
        label: request.label ?? invocation.id,
        handle: request.handle ?? request.label ?? invocation.id,
        agentId: request.agentId,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        rex: readRexWatch(processEnv),
        warningFile: processEnv.BLINKY_REX_WARNING_FILE,
        statePath: processEnv.BLINKY_REX_STATE,
        stdio: 'buffer',
    }).then(
        result => ({ invocation, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }),
        error => {
            if (error instanceof AgentProcessError) {
                if (error.kind === 'abort') throw new CliAdapterError(`CLI adapter "${invocation.id}" was aborted.`)
                if (error.kind === 'timeout') throw new CliAdapterError(`CLI adapter "${invocation.id}" timed out after ${options.timeoutMs}ms.`)
                throw new CliAdapterError(`CLI adapter "${invocation.id}" failed to start ${invocation.command}: ${error.message}`)
            }
            throw error
        },
    )
}
