import { sep } from 'node:path'
import { agentsDir } from '../config/paths.js'

const GIT_POINTERS = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR'])

export function isForeignAgentValue(agentId: string, value: string): boolean {
    const root = `${agentsDir()}${sep}`
    let from = 0
    for (;;) {
        const at = value.indexOf(root, from)
        if (at === -1) return false
        const rest = value.slice(at + root.length)
        const id = rest.split(/[/\\]/)[0]
        if (id && id !== agentId) return true
        from = at + root.length
    }
}

export function omitForeignAgentEnv(agentId: string, env: NodeJS.ProcessEnv): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
        if (typeof value !== 'string') continue
        if (GIT_POINTERS.has(key)) continue
        if (isForeignAgentValue(agentId, value)) continue
        out[key] = value
    }
    return out
}

export function mergeSpawnEnv(agentId: string, inherited: NodeJS.ProcessEnv, agentEnv: Record<string, string>): Record<string, string> {
    return { ...omitForeignAgentEnv(agentId, inherited), ...omitForeignAgentEnv(agentId, agentEnv) }
}

// Providers merge their `env` over the engine process. Blanking a leaked value is what actually
// drops it; omitting the key would leave the process copy in place.
export function foreignAgentEnvOverlay(agentId: string, inherited: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const overlay: Record<string, string> = {}
    for (const [key, value] of Object.entries(inherited)) {
        if (typeof value !== 'string') continue
        if (GIT_POINTERS.has(key) || isForeignAgentValue(agentId, value)) overlay[key] = ''
    }
    return overlay
}
