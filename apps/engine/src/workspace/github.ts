import { spawn } from 'node:child_process'
import type { GithubRepo } from '@rerun/contracts'
import { badRequest } from '../lib/errors.js'
import { gitEnv } from './git.js'
import { parseGitRemote, type ParsedGitRemote } from './git-url.js'

type CommandResult = { code: number | null; stdout: string; stderr: string }

function run(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
    return new Promise(resolve => {
        const child = spawn(command, args, { env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
        child.stdout?.setEncoding('utf8')
        child.stderr?.setEncoding('utf8')
        child.stdout?.on('data', (chunk: string) => {
            stdout += chunk
        })
        child.stderr?.on('data', (chunk: string) => {
            stderr += chunk
        })
        child.once('error', error => {
            clearTimeout(timer)
            const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
            resolve({ code: null, stdout: '', stderr: missing ? 'missing' : error.message })
        })
        child.once('close', code => {
            clearTimeout(timer)
            resolve({ code, stdout, stderr })
        })
    })
}

function githubUnavailable(result: CommandResult): string | null {
    if (result.stderr === 'missing' || result.code === null && /not found|ENOENT/i.test(result.stderr)) {
        return 'The GitHub CLI (gh) is not installed. Paste a git URL instead.'
    }
    const blob = `${result.stderr}\n${result.stdout}`.toLowerCase()
    if (result.code !== 0 && /not logged|auth login|authentication|no oauth token|has not authenticated/.test(blob)) {
        return 'GitHub CLI is not signed in. Run gh auth login in a terminal, or paste a git URL. BlinkyBot does not store a token.'
    }
    return null
}

async function assertGhAuth(): Promise<void> {
    const result = await run('gh', ['auth', 'status'], 15_000)
    const unavailable = githubUnavailable(result)
    if (unavailable) throw badRequest(unavailable)
    if (result.code !== 0) throw badRequest('GitHub CLI is not signed in. Run gh auth login in a terminal, or paste a git URL. BlinkyBot does not store a token.')
}

async function gitProtocol(): Promise<'https' | 'ssh'> {
    const result = await run('gh', ['config', 'get', 'git_protocol'], 10_000)
    return result.code === 0 && result.stdout.trim() === 'ssh' ? 'ssh' : 'https'
}

type GhRepoJson = {
    nameWithOwner?: string
    description?: string | null
    isPrivate?: boolean
    url?: string
    sshUrl?: string
    defaultBranchRef?: { name?: string } | null
}

function asRepo(row: GhRepoJson, protocol: 'https' | 'ssh'): GithubRepo | null {
    if (!row.nameWithOwner || !row.url) return null
    const url = protocol === 'ssh' && row.sshUrl ? row.sshUrl : row.url
    return {
        nameWithOwner: row.nameWithOwner,
        description: row.description ?? '',
        private: row.isPrivate === true,
        url,
        defaultBranch: row.defaultBranchRef?.name || 'main',
    }
}

export async function listGithubRepos(): Promise<GithubRepo[]> {
    await assertGhAuth()
    const protocol = await gitProtocol()
    const result = await run('gh', ['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,description,isPrivate,url,sshUrl,defaultBranchRef'], 30_000)
    const unavailable = githubUnavailable(result)
    if (unavailable) throw badRequest(unavailable)
    if (result.code !== 0) throw badRequest(result.stderr.trim() || 'Could not list GitHub repositories.')
    let rows: GhRepoJson[]
    try {
        rows = JSON.parse(result.stdout) as GhRepoJson[]
    } catch {
        throw badRequest('GitHub CLI returned an unreadable repository list.')
    }
    return rows.flatMap(row => {
        const repo = asRepo(row, protocol)
        return repo ? [repo] : []
    })
}

export async function resolveGithubRemote(nameWithOwner: string, options: { allowFile?: boolean; agentId?: string } = {}): Promise<{ parsed: ParsedGitRemote; github: { nameWithOwner: string; private: boolean }; defaultBranch: string }> {
    await assertGhAuth()
    const protocol = await gitProtocol()
    const result = await run('gh', ['repo', 'view', nameWithOwner, '--json', 'nameWithOwner,url,sshUrl,isPrivate,defaultBranchRef'], 20_000)
    const unavailable = githubUnavailable(result)
    if (unavailable) throw badRequest(unavailable)
    if (result.code !== 0) {
        const blob = `${result.stderr}\n${result.stdout}`
        if (/not found|could not resolve/i.test(blob)) {
            throw badRequest(`Cannot access ${nameWithOwner}. It may be private or missing. gh auth login uses your own GitHub login; BlinkyBot does not store a token.`)
        }
        throw badRequest(result.stderr.trim() || `Could not read ${nameWithOwner}.`)
    }
    const row = JSON.parse(result.stdout) as GhRepoJson
    const repo = asRepo(row, protocol)
    if (!repo) throw badRequest(`Could not read a clone URL for ${nameWithOwner}.`)
    const parsed = parseGitRemote(repo.url, options)
    return { parsed, github: { nameWithOwner: repo.nameWithOwner, private: repo.private }, defaultBranch: repo.defaultBranch }
}
