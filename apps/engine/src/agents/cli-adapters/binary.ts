import { withEgoOnPath } from '../../browser/ego-browser.js'

// Same shape as `codexCommand` in connections/codex-plan-limits.ts: an explicit path, Node when
// that path is a script, otherwise the binary name on PATH. Foreman's bundled CLI lookup stays
// in the provider (`codexPath`, `pathToClaudeCodeExecutable`); this layer does not import it.

const JS_ENTRY = /\.[cm]?js$/i

export function resolveCommand(pathEnv: string, binaryName: string, processEnv: NodeJS.ProcessEnv): { command: string; args: string[] } {
    const configured = processEnv[pathEnv]
    if (typeof configured === 'string' && configured !== '') {
        return JS_ENTRY.test(configured) ? { command: 'node', args: [configured] } : { command: configured, args: [] }
    }
    return { command: binaryName, args: [] }
}

export function childEnv(processEnv: NodeJS.ProcessEnv, homeEnv: string, home: string | undefined, extra: Record<string, string> | undefined): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(processEnv)) {
        if (typeof value === 'string') env[key] = value
    }
    if (home) env[homeEnv] = home
    if (extra) Object.assign(env, extra)
    return withEgoOnPath(env)
}
