#!/usr/bin/env node
// Deterministic stand-in for codex, kimi, grok, and claude.
// Exec/print mode prints the CLI's documented JSON. `app-server` speaks the
// Codex JSON-RPC subset the engine's chat provider drives.

import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { basename } from 'node:path'

const name = process.env.BLINKY_STUB_ID || basename(process.argv[1]).replace(/\.mjs$/, '')
const args = process.argv.slice(2)
const sessions = {
    codex: 'stub-codex-session',
    kimi: 'stub-kimi-session',
    grok: 'stub-grok-session',
    claude: 'stub-claude-session',
}

if (args[0] === '--version' || args[0] === 'version' || args[0] === '-v') {
    process.stdout.write(`${name} version 0.160.0\n`)
    process.exit(0)
}

record({ mode: args.includes('app-server') ? 'app-server' : 'exec', argv: args })

if (args.includes('app-server')) {
    await appServer()
} else {
    emit(promptFromArgs(args))
}

function promptFromArgs(argv) {
    const divider = argv.indexOf('--')
    if (divider !== -1 && argv[divider + 1]) return argv[divider + 1]
    const print = argv.indexOf('-p')
    if (print !== -1 && argv[print + 1] && !argv[print + 1].startsWith('-')) return argv[print + 1]
    const positional = argv.filter(arg => !arg.startsWith('-'))
    return positional.at(-1) ?? ''
}

function emit(prompt) {
    const text = `stub-ok:${name}:${prompt}`
    const sessionId = sessions[name] ?? `stub-${name}-session`
    if (name === 'kimi') {
        write({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
        write({ type: 'result', session_id: sessionId, result: text })
        return
    }
    if (name === 'grok') {
        write({ type: 'result', response: text, session_id: sessionId })
        return
    }
    if (name === 'claude') {
        write({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: sessionId })
        return
    }
    write({ type: 'thread.started', thread_id: sessionId })
    write({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text } })
    write({ type: 'turn.completed' })
}

function write(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function appServer() {
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
    let threadId = 'thr-stub'
    const delay = Number(process.env.BLINKY_STUB_DELAY_MS || '0')
    for await (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let message
        try {
            message = JSON.parse(trimmed)
        } catch {
            continue
        }
        if (message.id === undefined) continue
        if (message.method === 'initialize') {
            write({ id: message.id, result: { userAgent: 'codex/0.160.0', capabilities: { experimentalApi: true } } })
            continue
        }
        if (message.method === 'thread/start' || message.method === 'thread/resume') {
            threadId = message.method === 'thread/resume' && message.params?.threadId ? String(message.params.threadId) : 'thr-stub'
            write({ id: message.id, result: { thread: { id: threadId, path: null, ephemeral: false } } })
            continue
        }
        if (message.method === 'turn/start') {
            const turnId = `turn-${message.id}`
            const prompt = turnPrompt(message.params)
            record({ mode: 'turn', argv: args, prompt })
            write({
                id: message.id,
                result: { turn: { id: turnId, items: [], status: 'inProgress', error: null } },
            })
            const text = 'BLINKY_E2E_REPLY'
            setTimeout(() => {
                write({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'item-1', delta: text } })
                write({
                    method: 'turn/completed',
                    params: {
                        threadId,
                        turn: {
                            id: turnId,
                            items: [{ type: 'agentMessage', id: 'item-1', text, phase: null }],
                            status: 'completed',
                            error: null,
                        },
                    },
                })
            }, Number.isFinite(delay) ? delay : 0)
            continue
        }
        if (message.method === 'turn/interrupt') {
            write({ id: message.id, result: {} })
            continue
        }
        write({ id: message.id, result: {} })
    }
}

function turnPrompt(params) {
    const input = params?.input
    if (!Array.isArray(input)) return ''
    return input
        .map(block => (block && typeof block.text === 'string' ? block.text : ''))
        .filter(Boolean)
        .join('\n')
}

function record(extra) {
    const file = process.env.BLINKY_STUB_LOG
    if (!file) return
    const env = {}
    for (const key of ['CODEX_HOME', 'KIMI_CODE_HOME', 'GROK_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_API_KEY', 'KIMI_API_KEY', 'XAI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'RERUN_CODEX_PATH', 'RERUN_KIMI_PATH', 'RERUN_GROK_PATH', 'RERUN_CLAUDE_PATH']) {
        const value = process.env[key]
        if (value === undefined) continue
        env[key] = /KEY|TOKEN|SECRET/i.test(key) ? (value ? '[set]' : '') : value
    }
    appendFileSync(file, `${JSON.stringify({ bin: name, ...extra, env })}\n`)
}
