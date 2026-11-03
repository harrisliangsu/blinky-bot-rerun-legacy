export type CliStreamEvent =
    | { type: 'text'; delta: string }
    | { type: 'reasoning'; delta: string }
    | { type: 'tool'; id: string; name: string; input: string }
    | { type: 'tool-result'; id: string; name: string; result: string }
    | { type: 'usage'; inputTokens?: number; outputTokens?: number; reasoningTokens?: number }

// Kimi `stream-json` is one message per line. Grok `streaming-json` is one typed event per line.
// A line that is not JSON is ignored so a banner on stdout cannot abort the turn.
export function cliEventsFromLine(line: string, runtime: 'kimi' | 'grok'): CliStreamEvent[] {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) return []
    let value: unknown
    try {
        value = JSON.parse(trimmed) as unknown
    } catch {
        return []
    }
    if (!value || typeof value !== 'object') return []
    return runtime === 'kimi' ? kimiEvents(value as Record<string, unknown>) : grokEvents(value as Record<string, unknown>)
}

function kimiEvents(row: Record<string, unknown>): CliStreamEvent[] {
    const role = row.role
    if (role === 'tool') {
        const id = stringOf(row.tool_call_id) ?? stringOf(row.id) ?? 'tool'
        return [{ type: 'tool-result', id, name: stringOf(row.name) ?? '', result: textOf(row.content) }]
    }
    if (role !== 'assistant' && row.type !== 'assistant') return []
    const events: CliStreamEvent[] = []
    const text = textOf(row.content ?? row.message)
    if (text) events.push({ type: 'text', delta: text })
    const calls = Array.isArray(row.tool_calls) ? row.tool_calls : toolCallsOf(row.message)
    for (const call of calls) {
        const record = call as Record<string, unknown>
        const fn = record.function && typeof record.function === 'object' ? (record.function as Record<string, unknown>) : record
        const id = stringOf(record.id) ?? stringOf(record.tool_call_id) ?? `tool-${events.length}`
        const name = stringOf(fn.name) ?? stringOf(record.name) ?? 'tool'
        const input = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? record.arguments ?? {})
        events.push({ type: 'tool', id, name, input })
    }
    return events
}

function toolCallsOf(message: unknown): unknown[] {
    if (!message || typeof message !== 'object') return []
    const calls = (message as Record<string, unknown>).tool_calls
    return Array.isArray(calls) ? calls : []
}

function grokEvents(row: Record<string, unknown>): CliStreamEvent[] {
    const type = stringOf(row.type)
    if (type === 'text' || type === 'content') {
        const delta = stringOf(row.data) ?? stringOf(row.text) ?? textOf(row.content)
        return delta ? [{ type: 'text', delta }] : []
    }
    if (type === 'thought' || type === 'reasoning') {
        const delta = stringOf(row.data) ?? stringOf(row.text) ?? ''
        return delta ? [{ type: 'reasoning', delta }] : []
    }
    if (type === 'tool_call') {
        const id = stringOf(row.toolCallId) ?? stringOf(row.id) ?? 'tool'
        const name = stringOf(row.toolName) ?? stringOf(row.name) ?? stringOf(row.title) ?? 'tool'
        const raw = row.rawInput ?? row.input ?? {}
        return [{ type: 'tool', id, name, input: typeof raw === 'string' ? raw : JSON.stringify(raw) }]
    }
    if (type === 'tool_call_update' || type === 'tool_result') {
        const id = stringOf(row.toolCallId) ?? stringOf(row.id) ?? 'tool'
        const name = stringOf(row.toolName) ?? stringOf(row.name) ?? ''
        const raw = row.rawOutput ?? row.output ?? row.result ?? row.content ?? ''
        return [{ type: 'tool-result', id, name, result: typeof raw === 'string' ? raw : JSON.stringify(raw) }]
    }
    if (type === 'usage') return [usageOf(row.usage && typeof row.usage === 'object' ? (row.usage as Record<string, unknown>) : row)]
    return []
}

function usageOf(row: Record<string, unknown>): CliStreamEvent {
    return {
        type: 'usage',
        inputTokens: numberOf(row.input_tokens ?? row.inputTokens),
        outputTokens: numberOf(row.output_tokens ?? row.outputTokens),
        reasoningTokens: numberOf(row.reasoning_tokens ?? row.reasoningTokens),
    }
}

function textOf(value: unknown): string {
    if (typeof value === 'string') return value
    if (!Array.isArray(value)) {
        if (value && typeof value === 'object' && 'content' in value) return textOf((value as { content?: unknown }).content)
        return ''
    }
    return value.map(part => (typeof part === 'string' ? part : part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '')).join('')
}

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberOf(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
