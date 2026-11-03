import { mkdir, open, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withKeyedLock } from '../lib/lock.js'

const STALE_MS = 10 * 60 * 1000
const WAIT_MS = 120_000

async function sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
}

// On-disk lock beside the in-process queue: two sessions of one agent share a checkout, and a
// second engine started against the same data dir must not clone into it at the same time.
export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(lockPath), { recursive: true })
    const started = Date.now()
    for (;;) {
        try {
            const handle = await open(lockPath, 'wx')
            await handle.writeFile(String(process.pid))
            try {
                return await fn()
            } finally {
                await handle.close()
                await rm(lockPath, { force: true })
            }
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code !== 'EEXIST') throw error
            try {
                const info = await stat(lockPath)
                if (Date.now() - info.mtimeMs > STALE_MS) await rm(lockPath, { force: true })
            } catch {
                // The holder removed it between the failed create and the stat.
            }
            if (Date.now() - started > WAIT_MS) throw new Error('Timed out waiting for the repository lock.')
            await sleep(40)
        }
    }
}

export function withRepoLock<T>(key: string, lockPath: string, fn: () => Promise<T>): Promise<T> {
    return withKeyedLock(`repo:${key}`, () => withFileLock(lockPath, fn))
}
