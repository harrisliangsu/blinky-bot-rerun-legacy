import { describe, expect, it } from 'vitest'

import { cliEventsFromLine } from './cli-stream.js'

describe('cliEventsFromLine', () => {
    it('reads kimi assistant text and a following tool result', () => {
        const text = cliEventsFromLine('{"role":"assistant","content":"Hello"}', 'kimi')
        const call = cliEventsFromLine('{"role":"assistant","content":"","tool_calls":[{"id":"tc_1","type":"function","function":{"name":"Shell","arguments":"{\\"command\\":\\"ls\\"}"}}]}', 'kimi')
        const result = cliEventsFromLine('{"role":"tool","tool_call_id":"tc_1","content":"a.ts"}', 'kimi')
        expect(text).toEqual([{ type: 'text', delta: 'Hello' }])
        expect(call).toEqual([{ type: 'tool', id: 'tc_1', name: 'Shell', input: '{"command":"ls"}' }])
        expect(result).toEqual([{ type: 'tool-result', id: 'tc_1', name: '', result: 'a.ts' }])
    })

    it('reads grok streaming-json text, tools, and usage', () => {
        expect(cliEventsFromLine('{"type":"text","data":"Hi"}', 'grok')).toEqual([{ type: 'text', delta: 'Hi' }])
        expect(cliEventsFromLine('{"type":"thought","data":"Looking"}', 'grok')).toEqual([{ type: 'reasoning', delta: 'Looking' }])
        expect(cliEventsFromLine('{"type":"tool_call","toolCallId":"call_1","toolName":"read_file","rawInput":{"path":"a"}}', 'grok')).toEqual([{ type: 'tool', id: 'call_1', name: 'read_file', input: '{"path":"a"}' }])
        expect(cliEventsFromLine('{"type":"tool_call_update","toolCallId":"call_1","status":"completed","rawOutput":{"ok":true}}', 'grok')[0]).toMatchObject({ type: 'tool-result', id: 'call_1', result: '{"ok":true}' })
        expect(cliEventsFromLine('{"type":"usage","usage":{"input_tokens":3,"output_tokens":4}}', 'grok')).toEqual([{ type: 'usage', inputTokens: 3, outputTokens: 4, reasoningTokens: undefined }])
    })

    it('ignores a banner that is not json', () => {
        expect(cliEventsFromLine('resuming session', 'kimi')).toEqual([])
        expect(cliEventsFromLine('{', 'grok')).toEqual([])
    })
})
