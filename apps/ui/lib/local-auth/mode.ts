const ENABLED = new Set(['1', 'true', 'yes', 'on'])

export function isBlinkyLocalAuth(env: NodeJS.ProcessEnv = process.env): boolean {
    return ENABLED.has((env.BLINKY_LOCAL_AUTH ?? '').trim().toLowerCase())
}
