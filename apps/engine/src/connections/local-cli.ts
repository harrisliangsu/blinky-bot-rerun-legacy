import { DEFAULT_CONNECTION_MODELS, PROVIDER_LABELS, type Provider } from '@rerun/contracts'

import { cliReady, type LocalChatCli } from '../agents/cli-search.js'
import type { LoadedConnection } from './types.js'

export const LOCAL_KIMI_CONNECTION_ID = 'local-kimi'
export const LOCAL_GROK_CONNECTION_ID = 'local-grok'

const LOCAL_CLI: { id: string; provider: LocalChatCli }[] = [
    { id: LOCAL_KIMI_CONNECTION_ID, provider: 'kimi' },
    { id: LOCAL_GROK_CONNECTION_ID, provider: 'grok' },
]

export function isLocalCliConnection(id: string): boolean {
    return LOCAL_CLI.some(row => row.id === id)
}

export function localCliProvider(id: string): LocalChatCli | null {
    return LOCAL_CLI.find(row => row.id === id)?.provider ?? null
}

// Present even when the binary is gone, so a chat that already picked it fails with the
// install message instead of silently running on another provider.
export function localCliConnection(id: string): LoadedConnection | null {
    const provider = localCliProvider(id)
    if (!provider) return null
    return connectionFor(id, provider)
}

export function installedLocalCliConnections(env: NodeJS.ProcessEnv = process.env): LoadedConnection[] {
    return LOCAL_CLI.filter(row => cliReady(row.provider, env) !== 'missing').map(row => connectionFor(row.id, row.provider))
}

function connectionFor(id: string, provider: Provider): LoadedConnection {
    return {
        id,
        config: {
            name: PROVIDER_LABELS[provider],
            provider,
            models: DEFAULT_CONNECTION_MODELS[provider],
            extraModels: [],
            createdAt: '1970-01-01T00:00:00.000Z',
        },
        env: {},
    }
}
