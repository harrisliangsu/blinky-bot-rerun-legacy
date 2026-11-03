// What /api/chat tells the composer when the engine refused the turn before a stream existed.
// The AI SDK surfaces `error` as the message, and the chat classifies that text: a budget
// failure has to say `rerun_budget_exhausted`, a spent CLI quota has to say `quota exceeded`.
export function engineChatFailure(status: number, body: string): { status: number; error: string } {
    const message = messageOf(body)
    const blob = `${status} ${message} ${body}`.toLowerCase()
    if (status === 402 || blob.includes('rerun_budget_exhausted') || blob.includes('payment required')) {
        return { status: 402, error: 'rerun_budget_exhausted' }
    }
    if (/quota exceeded|usage limit|out of credits|credit balance|insufficient quota/.test(blob)) {
        return { status: 402, error: message || 'quota exceeded' }
    }
    return { status: 502, error: `Engine error: ${status} ${body}`.trim() }
}

function messageOf(body: string): string {
    const trimmed = body.trim()
    if (!trimmed.startsWith('{')) return trimmed
    try {
        const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown }
        if (typeof parsed.error === 'string') return parsed.error
        if (parsed.error && typeof parsed.error === 'object') {
            const nested = (parsed.error as { message?: unknown }).message
            if (typeof nested === 'string') return nested
        }
        if (typeof parsed.message === 'string') return parsed.message
    } catch {
        return trimmed
    }
    return trimmed
}
