import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { runLocalCli, type CliRuntimeId } from './index.js'

const enabled = process.env.BLINKY_REAL_CLI === '1'

const cases: { id: CliRuntimeId; secretEnv: string[]; requestEnv: string }[] = [
    { id: 'codex', secretEnv: ['CODEX_API_KEY'], requestEnv: 'CODEX_API_KEY' },
    { id: 'kimi', secretEnv: ['KIMI_API_KEY'], requestEnv: 'KIMI_API_KEY' },
    { id: 'grok', secretEnv: ['XAI_API_KEY'], requestEnv: 'XAI_API_KEY' },
    { id: 'claude', secretEnv: ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'], requestEnv: 'CLAUDE_CODE_OAUTH_TOKEN' },
]

describe.skipIf(!enabled)('real CLI smoke', () => {
    it('runs each CLI whose secret is configured', async () => {
        const ran: string[] = []
        const skipped: string[] = []
        for (const entry of cases) {
            const secretName = entry.secretEnv.find(name => process.env[name])
            if (!secretName) {
                skipped.push(`${entry.id}: no secret`)
                continue
            }
            if (!(await executable(entry.id))) {
                throw new Error(`${entry.id} secret is set but \`${entry.id}\` is not executable on PATH`)
            }
            const secret = process.env[secretName] ?? ''
            const envKey = entry.id === 'claude' && secretName === 'ANTHROPIC_API_KEY' ? 'ANTHROPIC_API_KEY' : entry.requestEnv
            const result = await runLocalCli(
                entry.id,
                { prompt: 'Reply with the single word pong.', cwd: process.cwd(), env: { [envKey]: secret } },
                { processEnv: { ...process.env, RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude' }, timeoutMs: 90_000 },
            )
            expect(result.exitCode, `${entry.id} stderr: ${result.stderr.slice(0, 500)}`).toBe(0)
            expect(result.stdout.length).toBeGreaterThan(0)
            ran.push(entry.id)
        }
        expect(ran.length + skipped.length).toBe(cases.length)
        if (ran.length === 0) throw new Error(`BLINKY_REAL_CLI=1 but no CLI secret was set (${skipped.join(', ')})`)
    }, 360_000)
})

async function executable(command: string): Promise<boolean> {
    const directories = (process.env.PATH ?? '').split(':').filter(Boolean)
    for (const directory of directories) {
        try {
            await access(`${directory}/${command}`, constants.X_OK)
            return true
        } catch {
            continue
        }
    }
    return false
}
