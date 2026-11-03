import { notFound } from '../lib/errors.js'
import { clearAgentCache } from '../agents/registry.js'
import { isPathSegment } from '../config/paths.js'
import { connectionExists, isConnected, listConnectionIds, loadConnectionFromDisk } from './loader.js'
import { installedLocalCliConnections, localCliConnection } from './local-cli.js'
import type { LoadedConnection } from './types.js'

// One instance per connection, shared by every agent pointing at it. Deliberate: a token refresh
// mutates this single object, so the whole box sees the fresh credential at once instead of each
// agent carrying its own copy and racing to rotate it.
const cache = new Map<string, LoadedConnection>()

export async function getConnection(id: string): Promise<LoadedConnection> {
    const cached = cache.get(id)
    if (cached) return cached
    if (!connectionExists(id)) throw notFound('connection')
    const connection = await loadConnectionFromDisk(id)
    cache.set(id, connection)
    return connection
}

export async function findConnection(id: string | null | undefined): Promise<LoadedConnection | null> {
    if (!id || !isPathSegment(id)) return null
    const local = localCliConnection(id)
    if (local) return local
    if (!connectionExists(id)) return null
    return getConnection(id)
}

export async function listConnections(): Promise<LoadedConnection[]> {
    const ids = await listConnectionIds()
    const disk = await Promise.all(ids.map(id => getConnection(id)))
    const covered = new Set(disk.filter(connection => isConnected(connection)).map(connection => connection.config.provider))
    const local = installedLocalCliConnections().filter(connection => !covered.has(connection.config.provider) && !disk.some(row => row.id === connection.id))
    return [...disk, ...local]
}

// Agents hold a reference to the shared instance, so dropping a connection from the cache has to
// drop them too — otherwise a reloaded connection would leave every agent on the stale object.
export function unloadConnection(id: string): void {
    cache.delete(id)
    clearAgentCache()
}

export async function reloadConnection(id: string): Promise<LoadedConnection> {
    unloadConnection(id)
    return getConnection(id)
}
