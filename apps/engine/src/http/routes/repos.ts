import type { Hono } from 'hono'
import { attachRepoSchema, gcReposSchema, setActiveRepoSchema, taskWorktreeSchema, testRepoAccessSchema } from '@rerun/contracts'
import { agentExists } from '../../agents/loader.js'
import { notFound } from '../../lib/errors.js'
import { describeAgentWorkspace } from '../../workspace/runs.js'
import { attachRepo, clearRepoCache, ensureTaskWorktree, fetchAgentRepo, gcAgentRepos, listAgentRepos, listGithubRepos, removeAgentRepo, setActiveRepo, testRepoAccess } from '../../workspace/index.js'

function agentId(c: { req: { param: (name: string) => string } }): string {
    const id = c.req.param('id')
    if (!agentExists(id)) throw notFound('agent')
    return id
}

export function mountRepoRoutes(app: Hono): void {
    app.get('/:id/workspace', c => {
        return c.json(describeAgentWorkspace(agentId(c)))
    })

    app.get('/:id/repos', async c => {
        return c.json(await listAgentRepos(agentId(c)))
    })

    app.get('/:id/repos/github', async c => {
        agentId(c)
        return c.json({ repos: await listGithubRepos() })
    })

    app.post('/:id/repos/test', async c => {
        const id = agentId(c)
        const body = testRepoAccessSchema.parse(await c.req.json())
        return c.json(await testRepoAccess(id, body.url))
    })

    app.post('/:id/repos/gc', async c => {
        const id = agentId(c)
        const body = gcReposSchema.parse(await c.req.json().catch(() => ({})))
        const olderThanMs = body.olderThanDays === undefined ? undefined : body.olderThanDays * 24 * 60 * 60 * 1000
        return c.json(await gcAgentRepos(id, { olderThanMs }))
    })

    app.post('/:id/repos/clear', async c => {
        return c.json(await clearRepoCache(agentId(c)))
    })

    app.post('/:id/repos/active', async c => {
        const id = agentId(c)
        const body = setActiveRepoSchema.parse(await c.req.json())
        return c.json(await setActiveRepo(id, body.repoId))
    })

    app.post('/:id/repos', async c => {
        const id = agentId(c)
        const body = attachRepoSchema.parse(await c.req.json())
        return c.json(await attachRepo(id, body), 201)
    })

    app.post('/:id/repos/:repoId/fetch', async c => {
        return c.json(await fetchAgentRepo(agentId(c), c.req.param('repoId')))
    })

    app.post('/:id/repos/:repoId/worktrees', async c => {
        const id = agentId(c)
        const body = taskWorktreeSchema.parse(await c.req.json())
        return c.json(await ensureTaskWorktree(id, c.req.param('repoId'), body.taskSlug), 201)
    })

    app.delete('/:id/repos/:repoId', async c => {
        await removeAgentRepo(agentId(c), c.req.param('repoId'))
        return c.json({ ok: true })
    })
}
