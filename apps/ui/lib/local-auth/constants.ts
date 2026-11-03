import { homedir } from 'node:os'
import { join } from 'node:path'

export const SESSION_COOKIE = 'blinky_session'
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const LOCAL_USER_DISPLAY_NAME = 'You'
export const LOCAL_WORKSPACE_ID = 1
export const LOCAL_WORKSPACE_NAME = 'BlinkyBot'
export const LOCAL_ENGINE_HOST = 'http://127.0.0.1:3001'
export const LOCAL_SPACE_ID = 'local-home'

export function localAuthDbPath(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env.BLINKY_LOCAL_AUTH_DB?.trim()
    if (configured) return configured
    return join(homedir(), 'Library', 'Application Support', 'BlinkyBot', 'local-auth.sqlite')
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false,
        maxAge,
    }
}
