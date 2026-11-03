import { spawn } from 'node:child_process'
import type { LanguageModel, ToolSet } from 'ai'

import { trackCliProcess } from '../workspace/runs.js'
import { cliInvocation } from './cli-adapters/index.js'
import { augmentedCliPath, cliInstallHint, cliLoginHint, cliReady, locateCliBinary, type LocalChatCli } from './cli-search.js'
import { cliEventsFromLine, type CliStreamEvent } from './cli-stream.js'
import { attachProjectMcp, startRerunToolBridge } from './cli-tool-bridge.js'

type Usage = {
    inputTokens: { total: number | undefined; noCache: undefined; cacheRead: undefined; cacheWrite: undefined }
    outputTokens: { total: number | undefined; text: number | undefined; reasoning: number | undefined }
}

type StreamPart =
    | { type: 'stream-start'; warnings: [] }
    | { type: 'text-start'; id: string }
    | { type: 'text-delta'; id: string; delta: string }
    | { type: 'text-end'; id: string }
    | { type: 'reasoning-start'; id: string }
    | { type: 'reasoning-delta'; id: string; delta: string }
    | { type: 'reasoning-end'; id: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: string; providerExecuted: true; dynamic: true }
    | { type: 'tool-result'; toolCallId: string; toolName: string; result: string; dynamic: true }
    | { type: 'error'; error: Error }
    | { type: 'finish'; usage: Usage; finishReason: { unified: 'stop' | 'error' | 'other'; raw: string | undefined } }

type Prompt = { role: string; content: string | { text?: string }[] }[]

const EMPTY_USAGE: Usage = {
    inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
}

export type CliChatModel = {
    model: LanguageModel
    close: () => Promise<void>
}

export function openCliChatModel(input: { runtime: LocalChatCli; modelId: string; cwd: string; system?: string; tools?: ToolSet; env?: Record<string, string>; processEnv?: NodeJS.ProcessEnv; agentId?: string }): CliChatModel {
    let stop: (() => void) | null = null
    const model = {
        specificationVersion: 'v3' as const,
        provider: input.runtime,
        modelId: input.modelId,
        supportedUrls: {},
        async doGenerate(options: { prompt: Prompt }) {
            const { stream } = await model.doStream(options)
            const reader = stream.getReader()
            let text = ''
            const content: { type: 'text'; text: string }[] = []
            let finish: Extract<StreamPart, { type: 'finish' }> = { type: 'finish', usage: EMPTY_USAGE, finishReason: { unified: 'stop', raw: undefined } }
            for (;;) {
                const step = await reader.read()
                if (step.done) break
                const part = step.value
                if (part.type === 'text-delta') text += part.delta
                if (part.type === 'finish') finish = part
            }
            if (text) content.push({ type: 'text', text })
            return { content, finishReason: finish.finishReason, usage: finish.usage, warnings: [] }
        },
        async doStream(options: { prompt: Prompt; abortSignal?: AbortSignal }) {
            return { stream: await streamCli(input, options, killer => { stop = killer }) }
        },
    }
    return {
        model: model as LanguageModel,
        close: async () => {
            stop?.()
        },
    }
}

async function streamCli(input: { runtime: LocalChatCli; modelId: string; cwd: string; system?: string; tools?: ToolSet; env?: Record<string, string>; processEnv?: NodeJS.ProcessEnv; agentId?: string }, options: { prompt: Prompt; abortSignal?: AbortSignal }, arm: (kill: () => void) => void): Promise<ReadableStream<StreamPart>> {
    const processEnv: NodeJS.ProcessEnv = { ...(input.processEnv ?? process.env), ...input.env }
    const home = processEnv.HOME
    processEnv.PATH = augmentedCliPath(home || '', processEnv.PATH)
    const ready = cliReady(input.runtime, processEnv)
    if (ready === 'missing') throw new Error(cliInstallHint(input.runtime))
    if (ready === 'signed-out') throw new Error(cliLoginHint(input.runtime))
    const binary = locateCliBinary(input.runtime, processEnv)
    if (!binary) throw new Error(cliInstallHint(input.runtime))
    processEnv[input.runtime === 'kimi' ? 'RERUN_KIMI_PATH' : 'RERUN_GROK_PATH'] = binary

    const prompt = transcriptOf(options.prompt)
    if (!prompt.trim()) throw new Error('Missing message text')
    const bridged = input.tools && Object.values(input.tools).some(tool => typeof tool.execute === 'function') ? await startRerunToolBridge(input.tools) : null
    const restoreMcp = bridged ? await attachProjectMcp(input.cwd, input.runtime, bridged.url).catch(() => null) : null
    let invocation: ReturnType<typeof cliInvocation>
    try {
        invocation = cliInvocation(input.runtime, { prompt, cwd: input.cwd, model: input.modelId, system: input.system, stream: true, env: input.env }, processEnv)
    } catch (error) {
        await restoreMcp?.().catch(() => {})
        await bridged?.close().catch(() => {})
        throw error
    }
    const child = spawn(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, stdio: ['ignore', 'pipe', 'pipe'] })
    const tracked = input.agentId ? trackCliProcess(input.agentId, input.runtime, invocation.command, child.pid ?? null) : null
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-8_000)
    })
    const kill = () => {
        if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
    }
    arm(kill)
    options.abortSignal?.addEventListener('abort', kill, { once: true })

    return new ReadableStream<StreamPart>({
        async start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            const names = new Map<string, string>()
            let textSerial = 0
            let textId = ''
            let reasonOpen = false
            let usage = EMPTY_USAGE
            let buffer = ''
            const endText = () => {
                if (!textId) return
                controller.enqueue({ type: 'text-end', id: textId })
                textId = ''
            }
            const take = (line: string) => {
                for (const event of cliEventsFromLine(line, input.runtime)) {
                    if (event.type === 'usage') {
                        usage = usageFrom(event)
                        continue
                    }
                    if (event.type === 'text' && event.delta) {
                        if (!textId) {
                            textSerial += 1
                            textId = `text-${textSerial}`
                            controller.enqueue({ type: 'text-start', id: textId })
                        }
                        controller.enqueue({ type: 'text-delta', id: textId, delta: event.delta })
                        continue
                    }
                    if (event.type === 'reasoning' && event.delta) {
                        if (!reasonOpen) {
                            controller.enqueue({ type: 'reasoning-start', id: 'reason-1' })
                            reasonOpen = true
                        }
                        controller.enqueue({ type: 'reasoning-delta', id: 'reason-1', delta: event.delta })
                        continue
                    }
                    if (event.type === 'tool') {
                        endText()
                        names.set(event.id, event.name)
                        controller.enqueue({ type: 'tool-call', toolCallId: event.id, toolName: event.name, input: event.input, providerExecuted: true, dynamic: true })
                        continue
                    }
                    if (event.type === 'tool-result') {
                        endText()
                        const name = event.name || names.get(event.id) || 'tool'
                        controller.enqueue({ type: 'tool-result', toolCallId: event.id, toolName: name, result: event.result, dynamic: true })
                    }
                }
            }
            child.stdout?.setEncoding('utf8')
            child.stdout?.on('data', (chunk: string) => {
                buffer += chunk
                const lines = buffer.split(/\r?\n/)
                buffer = lines.pop() ?? ''
                for (const line of lines) take(line)
            })
            const code = await new Promise<number | null>(resolve => {
                child.once('error', () => resolve(null))
                child.once('close', resolve)
            })
            tracked?.end()
            if (buffer.trim()) take(buffer)
            endText()
            if (reasonOpen) controller.enqueue({ type: 'reasoning-end', id: 'reason-1' })
            await restoreMcp?.().catch(() => {})
            await bridged?.close().catch(() => {})
            if (options.abortSignal?.aborted) {
                controller.enqueue({ type: 'finish', usage, finishReason: { unified: 'other', raw: 'cancelled' } })
                controller.close()
                return
            }
            if (code !== 0) {
                const message = loginMessage(input.runtime, stderr) ?? (stderr.trim() || `${input.runtime} CLI exited with code ${code ?? 'unknown'}`)
                controller.enqueue({ type: 'error', error: new Error(message) })
                controller.enqueue({ type: 'finish', usage, finishReason: { unified: 'error', raw: message } })
                controller.close()
                return
            }
            controller.enqueue({ type: 'finish', usage, finishReason: { unified: 'stop', raw: undefined } })
            controller.close()
        },
        cancel() {
            tracked?.end()
            kill()
        },
    })
}

function loginMessage(runtime: LocalChatCli, stderr: string): string | null {
    if (!/not logged in|please login|sign in|not signed in|unauthorized|no auth|authentication/i.test(stderr)) return null
    return cliLoginHint(runtime)
}

function usageFrom(event: Extract<CliStreamEvent, { type: 'usage' }>): Usage {
    return {
        inputTokens: { total: event.inputTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: event.outputTokens, text: event.outputTokens, reasoning: event.reasoningTokens },
    }
}

function transcriptOf(prompt: Prompt): string {
    const lines: string[] = []
    for (const message of prompt) {
        if (message.role === 'system') continue
        const parts = Array.isArray(message.content) ? message.content : []
        const text = parts.map(part => (part && typeof part.text === 'string' ? part.text : '')).filter(Boolean).join('\n')
        if (!text.trim()) continue
        const role = message.role === 'assistant' ? 'Assistant' : message.role === 'tool' ? 'Tool' : 'User'
        lines.push(`${role}:\n${text.trim()}`)
    }
    return lines.join('\n\n')
}
