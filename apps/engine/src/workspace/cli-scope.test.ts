import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'rerun-cli-scope-'))
process.env.RERUN_DATA_DIR = join(root, 'data')

const { describe, expect, it } = await import('vitest')
const { workspaceDir } = await import('../config/paths.js')
const { runLocalCli } = await import('../agents/cli-adapters/index.js')
const { listCliProcesses } = await import('./runs.js')

const standIn = join(root, 'stand-in.mjs')
writeFileSync(standIn, `process.stdout.write(JSON.stringify({ cwd: process.cwd(), leak: process.env.OTHER_COWORKER ?? null, workspace: process.env.RERUN_WORKSPACE ?? null }))\n`)

describe('CLI spawn scoping', () => {
    it('keeps codex, claude, kimi, and grok inside the agent workspace and out of another agent path', async () => {
        const workspace = workspaceDir('scoped-agent')
        mkdirSync(workspace, { recursive: true })
        const foreign = workspaceDir('other-agent')
        for (const id of ['codex', 'kimi', 'grok', 'claude'] as const) {
            const pathEnv = { codex: 'RERUN_CODEX_PATH', kimi: 'RERUN_KIMI_PATH', grok: 'RERUN_GROK_PATH', claude: 'RERUN_CLAUDE_PATH' }[id]
            const result = await runLocalCli(
                id,
                { prompt: 'hello', cwd: '/tmp', env: { OTHER_COWORKER: foreign } },
                { agentId: 'scoped-agent', processEnv: { PATH: process.env.PATH, RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude', [pathEnv]: standIn, OTHER_COWORKER: foreign } },
            )
            expect(result.exitCode).toBe(0)
            const parsed = JSON.parse(result.stdout) as { cwd: string; leak: string | null; workspace: string | null }
            expect(parsed.cwd).toBe(workspace)
            expect(parsed.leak).toBeNull()
            expect(parsed.workspace).toBe(workspace)
        }
        expect(listCliProcesses('scoped-agent')).toEqual([])
    })

    it('rewrites a cwd outside the workspace back to that agent', async () => {
        const result = await runLocalCli('kimi', { prompt: 'hello', cwd: '/tmp' }, { agentId: 'missing-workspace', processEnv: { RERUN_CLI_ADAPTERS: 'kimi', RERUN_KIMI_PATH: standIn, PATH: process.env.PATH } })
        const parsed = JSON.parse(result.stdout) as { cwd: string }
        expect(parsed.cwd).toBe(workspaceDir('missing-workspace'))
    })
})
