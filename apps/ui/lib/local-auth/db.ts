import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { LOCAL_ENGINE_HOST, LOCAL_USER_DISPLAY_NAME, LOCAL_WORKSPACE_ID, LOCAL_WORKSPACE_NAME, SESSION_MAX_AGE_SECONDS, localAuthDbPath } from './constants'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_user (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_workspace (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    engine_host TEXT NOT NULL,
    engine_api_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_session (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
`

export type LocalUserRow = { id: string; display_name: string; created_at: string }
export type LocalWorkspaceRow = { id: number; name: string; engine_host: string; engine_api_key: string }
export type LocalSessionRow = { token: string; user_id: string; expires_at: string }

type OpenDb = { path: string; db: DatabaseSync }

let open: OpenDb | null = null

export function closeLocalAuthDb(): void {
    open?.db.close()
    open = null
}

function database(): DatabaseSync {
    const path = localAuthDbPath()
    if (open && open.path === path) return open.db
    closeLocalAuthDb()
    mkdirSync(dirname(path), { recursive: true })
    const db = new DatabaseSync(path)
    db.exec(SCHEMA)
    open = { path, db }
    return db
}

function expiresAt(from = Date.now()): string {
    return new Date(from + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
}

export function readLocalUser(): LocalUserRow | null {
    return (database().prepare('SELECT id, display_name, created_at FROM local_user LIMIT 1').get() as LocalUserRow | undefined) ?? null
}

export function readLocalWorkspace(): LocalWorkspaceRow | null {
    return (database().prepare('SELECT id, name, engine_host, engine_api_key FROM local_workspace WHERE id = ?').get(LOCAL_WORKSPACE_ID) as LocalWorkspaceRow | undefined) ?? null
}

export function ensureLocalIdentity(): { user: LocalUserRow; workspace: LocalWorkspaceRow } {
    const db = database()
    let user = readLocalUser()
    if (!user) {
        const created_at = new Date().toISOString()
        const row: LocalUserRow = { id: randomUUID(), display_name: LOCAL_USER_DISPLAY_NAME, created_at }
        db.prepare('INSERT INTO local_user (id, display_name, created_at) VALUES (?, ?, ?)').run(row.id, row.display_name, row.created_at)
        user = row
    }
    let workspace = readLocalWorkspace()
    if (!workspace) {
        const engine_host = process.env.RERUN_ENGINE_URL?.trim() || LOCAL_ENGINE_HOST
        const engine_api_key = process.env.RERUN_ENGINE_API_KEY?.trim() ?? ''
        db.prepare('INSERT INTO local_workspace (id, name, engine_host, engine_api_key) VALUES (?, ?, ?, ?)').run(LOCAL_WORKSPACE_ID, LOCAL_WORKSPACE_NAME, engine_host, engine_api_key)
        workspace = { id: LOCAL_WORKSPACE_ID, name: LOCAL_WORKSPACE_NAME, engine_host, engine_api_key }
    }
    return { user, workspace }
}

export function createLocalSession(userId = ensureLocalIdentity().user.id): LocalSessionRow {
    const row: LocalSessionRow = { token: randomBytes(32).toString('hex'), user_id: userId, expires_at: expiresAt() }
    database().prepare('INSERT INTO local_session (token, user_id, expires_at) VALUES (?, ?, ?)').run(row.token, row.user_id, row.expires_at)
    return row
}

export function readLocalSession(token: string): (LocalSessionRow & { user: LocalUserRow; workspace: LocalWorkspaceRow }) | null {
    if (!token) return null
    const db = database()
    const session = db.prepare('SELECT token, user_id, expires_at FROM local_session WHERE token = ?').get(token) as LocalSessionRow | undefined
    if (!session) return null
    if (Date.parse(session.expires_at) <= Date.now()) {
        db.prepare('DELETE FROM local_session WHERE token = ?').run(token)
        return null
    }
    const nextExpires = expiresAt()
    db.prepare('UPDATE local_session SET expires_at = ? WHERE token = ?').run(nextExpires, token)
    const user = db.prepare('SELECT id, display_name, created_at FROM local_user WHERE id = ?').get(session.user_id) as LocalUserRow | undefined
    const workspace = readLocalWorkspace()
    if (!user || !workspace) return null
    return { ...session, expires_at: nextExpires, user, workspace }
}

export function deleteLocalSession(token: string): void {
    if (!token) return
    database().prepare('DELETE FROM local_session WHERE token = ?').run(token)
}

export function countLocalRows(): { users: number; workspaces: number; sessions: number } {
    const db = database()
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
    return { users: count('local_user'), workspaces: count('local_workspace'), sessions: count('local_session') }
}
