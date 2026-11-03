import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { openCliChatModel } from './cli-language-model.js'
import { startRerunToolBridge } from './cli-tool-bridge.js'

function script(body: string): { home: string; path: string } {
    const home = mkdtempSync(join(tmpdir(), 'blinky-stub-'))
    const path = join(home, 'cli')
    writeFileSync(path, `#!/bin/sh\n${body}\n`)
    chmodSync(path, 0o755)
    return { home, path }
}

async function parts(stream: ReadableStream<Part>): Promise<Part[]> {
    const reader = stream.getReader()
    const out: Part[] = []
    for (;;) {
        const step = await reader.read()
        if (step.done) break
        out.push(step.value)
    }
    return out
}

type Part = { type: string; delta?: string; toolName?: string; providerExecuted?: boolean; toolCallId?: string; result?: unknown; finishReason?: { unified?: string } }

const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Say hi' }] }]

describe('openCliChatModel', () => {
    it('streams kimi text into AI SDK text deltas', async () => {
        const stub = script('printf \'%s\\n\' \'{"role":"assistant","content":"Hello"}\' \'{"role":"assistant","content":" there"}\'')
        const creds = join(stub.home, 'credentials')
        mkdirSync(creds)
        writeFileSync(join(creds, 'kimi-code.json'), JSON.stringify({ access_token: 'kimi-access-token' }))
        const opened = openCliChatModel({
            runtime: 'kimi',
            modelId: 'kimi-for-coding',
            cwd: stub.home,
            processEnv: { HOME: stub.home, PATH: '', RERUN_KIMI_PATH: stub.path, KIMI_CODE_HOME: stub.home },
        })
        const streamed = await parts((await opened.model.doStream({ prompt })).stream)
        const text = streamed.filter(part => part.type === 'text-delta').map(part => (part.type === 'text-delta' ? part.delta : '')).join('')
        expect(text).toBe('Hello there')
        expect(streamed.at(-1)).toMatchObject({ type: 'finish', finishReason: { unified: 'stop' } })
        await opened.close()
    })

    it('streams grok tool calls as provider-executed parts', async () => {
        const stub = script(
            [
                `printf '%s\\n' '{"type":"text","data":"Hi"}'`,
                `printf '%s\\n' '{"type":"tool_call","toolCallId":"call_1","toolName":"read_file","rawInput":{"path":"a"}}'`,
                `printf '%s\\n' '{"type":"tool_call_update","toolCallId":"call_1","toolName":"read_file","status":"completed","rawOutput":{"ok":true}}'`,
            ].join('\n'),
        )
        const opened = openCliChatModel({
            runtime: 'grok',
            modelId: 'grok-4.7',
            cwd: stub.home,
            tools: { fs_read: { description: 'read', inputSchema: z.object({ path: z.string() }), execute: async () => 'ok' } },
            processEnv: { HOME: stub.home, PATH: '', RERUN_GROK_PATH: stub.path, XAI_API_KEY: 'xai-api-key' },
        })
        const streamed = await parts((await opened.model.doStream({ prompt })).stream)
        expect(streamed.find(part => part.type === 'tool-call')).toMatchObject({ toolName: 'read_file', providerExecuted: true })
        expect(streamed.find(part => part.type === 'tool-result')).toMatchObject({ toolCallId: 'call_1', result: '{"ok":true}' })
        await opened.close()
    })

    it('fails clearly when the CLI is missing or not logged in', async () => {
        const home = mkdtempSync(join(tmpdir(), 'blinky-missing-'))
        const missing = openCliChatModel({ runtime: 'kimi', modelId: 'kimi-for-coding', cwd: home, processEnv: { HOME: home, PATH: '', RERUN_KIMI_PATH: join(home, 'nope') } })
        await expect(missing.model.doStream({ prompt })).rejects.toThrow(/not installed/)
        const stub = script('exit 0')
        const signedOut = openCliChatModel({
            runtime: 'grok',
            modelId: 'grok-4.7',
            cwd: stub.home,
            processEnv: { HOME: stub.home, PATH: '', RERUN_GROK_PATH: stub.path, GROK_HOME: join(stub.home, 'empty') },
        })
        await expect(signedOut.model.doStream({ prompt })).rejects.toThrow(/not logged in/)
    })
})

describe('startRerunToolBridge', () => {
    it('lists a tool and runs it', async () => {
        const bridge = await startRerunToolBridge({
            fs_read: { description: 'read a file', inputSchema: z.object({ path: z.string() }), execute: async (input: { path: string }) => `read ${input.path}` },
        })
        const post = (body: unknown) => fetch(bridge.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const listed = (await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()) as { result: { tools: { name: string }[] } }
        expect(listed.result.tools.map(tool => tool.name)).toEqual(['fs_read'])
        const called = (await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'fs_read', arguments: { path: 'a.ts' } } })).json()) as { result: { content: { text: string }[] } }
        expect(called.result.content[0]?.text).toBe('read a.ts')
        await bridge.close()
    })
})
