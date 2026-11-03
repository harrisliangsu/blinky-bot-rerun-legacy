import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-process-env-'))

const { describe, expect, it } = await import('vitest')
const { agentConfigSchema } = await import('@rerun/contracts')
const { agentProcessEnv } = await import('./process-env.js')
const { agentDataDbPath, sharedDbPath, workspaceDir } = await import('../config/paths.js')

function agent(tools: Record<string, boolean>, env: Record<string, string> = {}) {
    return { id: 'env-agent', env, config: agentConfigSchema.parse({ name: 'Env test', tools }) }
}

describe('agentProcessEnv', () => {
    it('names the workspace and the private database, and creates them', () => {
        const { cwd, env } = agentProcessEnv(agent({ sharedDb: false }))
        expect(cwd).toBe(workspaceDir('env-agent'))
        expect(env.RERUN_WORKSPACE).toBe(cwd)
        expect(env.RERUN_AGENT_DB).toBe(agentDataDbPath('env-agent'))
        expect(existsSync(cwd)).toBe(true)
    })

    it('names the shared database only when the agent can reach it', () => {
        expect(agentProcessEnv(agent({ sharedDb: false })).env.RERUN_SHARED_DB).toBeUndefined()
        expect(agentProcessEnv(agent({ sharedDb: true })).env.RERUN_SHARED_DB).toBe(sharedDbPath())
    })

    it('carries the agent .env underneath the Rerun paths, which it cannot override', () => {
        const { env } = agentProcessEnv(agent({ sharedDb: false }, { API_TOKEN: 'x', RERUN_WORKSPACE: '/elsewhere' }))
        expect(env.API_TOKEN).toBe('x')
        expect(env.RERUN_WORKSPACE).toBe(workspaceDir('env-agent'))
    })

    it('leaves process.env out, so each caller decides what the process inherits', () => {
        expect(agentProcessEnv(agent({ sharedDb: false })).env.PATH).toBeUndefined()
    })

    it('starts in the active checkout and drops another coworker path from the agent env', async () => {
        const { mkdirSync } = await import('node:fs')
        const { writeRegistry } = await import('../workspace/registry.js')
        const { repoCheckoutDir, workspaceDir } = await import('../config/paths.js')
        const checkout = repoCheckoutDir('repo-agent', 'demo')
        mkdirSync(checkout, { recursive: true })
        const foreign = workspaceDir('someone-else')
        writeRegistry('repo-agent', {
            version: 1,
            activeRepoId: 'r1',
            quotaBytes: 10,
            repos: [
                {
                    id: 'r1',
                    slug: 'demo',
                    remote: 'https://example.com/demo.git',
                    remoteKey: 'example.com/demo',
                    source: 'url',
                    defaultBranch: 'main',
                    branch: 'blinky/env/workspace',
                    status: 'ready',
                    error: null,
                    warning: null,
                    github: null,
                    bytes: 1,
                    lastUsedAt: null,
                    createdAt: '2020-01-01T00:00:00.000Z',
                    updatedAt: '2020-01-01T00:00:00.000Z',
                    checkouts: [{ dirname: 'demo', branch: 'blinky/env/workspace', kind: 'primary', lastUsedAt: null }],
                },
            ],
        })
        const { cwd, env } = agentProcessEnv({ ...agent({ sharedDb: false }, { LEAK: foreign, API_TOKEN: 'x' }), id: 'repo-agent' })
        expect(cwd).toBe(checkout)
        expect(env.RERUN_WORKSPACE).toBe(workspaceDir('repo-agent'))
        expect(env.RERUN_REPO).toBe(checkout)
        expect(env.LEAK).toBeUndefined()
        expect(env.API_TOKEN).toBe('x')
    })
})
