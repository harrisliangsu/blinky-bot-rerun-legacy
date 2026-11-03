import { z } from 'zod'

export const REPO_SOURCES = ['github', 'url'] as const
export const REPO_STATUSES = ['cloning', 'ready', 'error'] as const

export const DEFAULT_REPO_QUOTA_BYTES = 8 * 1024 * 1024 * 1024
export const DEFAULT_REPO_IDLE_DAYS = 14

export const agentRepoGithubSchema = z.object({
    nameWithOwner: z.string(),
    private: z.boolean(),
})

export const agentRepoSchema = z.object({
    id: z.string(),
    slug: z.string(),
    remote: z.string(),
    source: z.enum(REPO_SOURCES),
    defaultBranch: z.string(),
    branch: z.string(),
    path: z.string(),
    status: z.enum(REPO_STATUSES),
    error: z.string().nullable(),
    warning: z.string().nullable(),
    github: agentRepoGithubSchema.nullable(),
    bytes: z.number().int().nonnegative(),
    lastUsedAt: z.string().nullable(),
    active: z.boolean(),
})
export type AgentRepo = z.infer<typeof agentRepoSchema>

export const agentRepoListSchema = z.object({
    repos: z.array(agentRepoSchema),
    disk: z.object({
        bytes: z.number().int().nonnegative(),
        quotaBytes: z.number().int().positive(),
    }),
    workspacePath: z.string(),
})
export type AgentRepoList = z.infer<typeof agentRepoListSchema>

export const attachRepoSchema = z.discriminatedUnion('source', [
    z.object({
        source: z.literal('url'),
        url: z.string().trim().min(1).max(2000),
        branch: z.string().trim().min(1).max(200).optional(),
    }),
    z.object({
        source: z.literal('github'),
        nameWithOwner: z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use owner/name'),
        branch: z.string().trim().min(1).max(200).optional(),
    }),
])
export type AttachRepoInput = z.infer<typeof attachRepoSchema>

export const testRepoAccessSchema = z.object({
    url: z.string().trim().min(1).max(2000),
})

export const taskWorktreeSchema = z.object({
    taskSlug: z.string().trim().min(1).max(60),
})

export const gcReposSchema = z.object({
    olderThanDays: z.number().int().positive().max(3650).optional(),
})

export const setActiveRepoSchema = z.object({
    repoId: z.string().nullable(),
})

export const githubRepoSchema = z.object({
    nameWithOwner: z.string(),
    description: z.string(),
    private: z.boolean(),
    url: z.string(),
    defaultBranch: z.string(),
})
export type GithubRepo = z.infer<typeof githubRepoSchema>

export const githubRepoListSchema = z.object({
    repos: z.array(githubRepoSchema),
})
export type GithubRepoList = z.infer<typeof githubRepoListSchema>

export const repoAccessResultSchema = z.object({
    ok: z.literal(true),
    remote: z.string(),
    defaultBranch: z.string(),
})

export const agentRunProcessSchema = z.object({
    id: z.string(),
    runId: z.string().nullable(),
    sessionId: z.string().nullable(),
    runtime: z.string(),
    cwd: z.string(),
    workspacePath: z.string(),
    repoPath: z.string().nullable(),
    pid: z.number().int().nullable(),
    command: z.string().nullable(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
})
export type AgentRunProcess = z.infer<typeof agentRunProcessSchema>

export const agentWorkspaceSnapshotSchema = z.object({
    agentId: z.string(),
    workspacePath: z.string(),
    reposDir: z.string(),
    activeRepo: z
        .object({
            id: z.string(),
            remote: z.string(),
            branch: z.string(),
            path: z.string(),
        })
        .nullable(),
    disk: z.object({
        bytes: z.number().int().nonnegative(),
        quotaBytes: z.number().int().positive(),
    }),
    runs: z.array(agentRunProcessSchema),
    processes: z.array(agentRunProcessSchema),
})
export type AgentWorkspaceSnapshot = z.infer<typeof agentWorkspaceSnapshotSchema>

export const repoMutationSchema = z.object({
    ok: z.literal(true),
    removed: z.number().int().nonnegative().optional(),
    skipped: z.number().int().nonnegative().optional(),
})
