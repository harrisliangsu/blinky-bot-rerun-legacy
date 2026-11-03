import type { CliParsedOutput, CliRuntimeId } from './types.js'

export function parseCliStdout(id: CliRuntimeId, stdout: string): CliParsedOutput {
    const trimmed = stdout.trim()
    if (!trimmed) return { text: '' }
    try {
        if (id === 'claude' || id === 'grok') return parseDocument(trimmed)
        return parseLines(trimmed)
    } catch {
        return { text: '' }
    }
}

function parseLines(stdout: string): CliParsedOutput {
    const texts: string[] = []
    let sessionId: string | undefined
    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let event: Record<string, unknown>
        try {
            event = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
            continue
        }
        if (typeof event.thread_id === 'string') sessionId = event.thread_id
        if (typeof event.session_id === 'string') sessionId = event.session_id
        const type = typeof event.type === 'string' ? event.type : ''
        const item = record(event.item)
        if (item && (item.type === 'agent_message' || item.type === 'agentMessage') && typeof item.text === 'string') texts.push(item.text)
        if (type === 'assistant') {
            const content = record(event.message)?.content
            if (Array.isArray(content)) {
                for (const block of content) {
                    const row = record(block)
                    if (row && row.type === 'text' && typeof row.text === 'string') texts.push(row.text)
                }
            }
        }
        if (type === 'text' && typeof event.text === 'string') texts.push(event.text)
        if (type === 'result' && typeof event.result === 'string' && texts.length === 0) texts.push(event.result)
    }
    return { text: texts.join(''), sessionId }
}

function parseDocument(stdout: string): CliParsedOutput {
    const doc = record(JSON.parse(stdout))
    if (!doc) return { text: '' }
    const sessionId = typeof doc.session_id === 'string' ? doc.session_id : typeof doc.sessionId === 'string' ? doc.sessionId : undefined
    for (const key of ['result', 'response', 'text', 'message']) {
        if (typeof doc[key] === 'string') return { text: doc[key], sessionId }
    }
    return { text: '', sessionId }
}

function record(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}
