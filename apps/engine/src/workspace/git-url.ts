import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { agentsDir, workspaceDir } from '../config/paths.js'
import { GitAccessError } from './git-error.js'

export type ParsedGitRemote = {
    remote: string
    remoteKey: string
    scheme: 'https' | 'http' | 'ssh' | 'file'
    host: string
    repoPath: string
}

const SCP = /^([\w.+-]+)@([\w.-]+):([^\s]+)$/

export function fileGitAllowed(explicit?: boolean): boolean {
    if (explicit !== undefined) return explicit
    return process.env.RERUN_GIT_ALLOW_FILE === '1'
}

export function parseGitRemote(input: string, options: { allowFile?: boolean; agentId?: string } = {}): ParsedGitRemote {
    const raw = input.trim()
    if (!raw || /[\r\n\0]/.test(raw)) throw new GitAccessError('invalid', 'Enter an https:// or git@host:path URL.')
    if (raw.startsWith('-') || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('\\')) {
        throw new GitAccessError('invalid', 'Enter an https:// or git@host:path URL. Relative paths are not accepted.')
    }
    const scp = SCP.exec(raw)
    if (scp && !raw.includes('://')) return fromScp(scp[1], scp[2], scp[3])
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new GitAccessError('invalid', 'Enter an https:// or git@host:path URL.')
    }
    if (url.username.includes(':') || url.password) {
        throw new GitAccessError('invalid', 'Remove the password from the URL. BlinkyBot does not store git passwords. Use gh auth login, ssh-add, or the system credential helper.')
    }
    if (url.protocol === 'file:') return fromFile(url, options)
    if (url.protocol === 'https:' || url.protocol === 'http:') return fromHttp(url)
    if (url.protocol === 'ssh:') return fromSsh(url)
    throw new GitAccessError('invalid', 'Only https, http, and ssh git URLs are accepted.')
}

function fromScp(user: string, host: string, path: string): ParsedGitRemote {
    const repoPath = cleanRepoPath(path)
    const remote = `${user}@${host}:${repoPath}`
    return { remote, remoteKey: keyFor(host, repoPath), scheme: 'ssh', host: host.toLowerCase(), repoPath }
}

function fromHttp(url: URL): ParsedGitRemote {
    const repoPath = cleanRepoPath(decodeURIComponent(url.pathname))
    const host = url.hostname.toLowerCase()
    const remote = `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}/${repoPath}`
    const keyHost = url.port ? `${host}:${url.port}` : host
    return { remote, remoteKey: keyFor(keyHost, repoPath), scheme: url.protocol === 'http:' ? 'http' : 'https', host, repoPath }
}

function fromSsh(url: URL): ParsedGitRemote {
    const repoPath = cleanRepoPath(decodeURIComponent(url.pathname))
    const host = url.hostname.toLowerCase()
    const user = url.username || 'git'
    const remote = `ssh://${user}@${host}${url.port ? `:${url.port}` : ''}/${repoPath}`
    const keyHost = url.port ? `${host}:${url.port}` : host
    return { remote, remoteKey: keyFor(keyHost, repoPath), scheme: 'ssh', host, repoPath }
}

function fromFile(url: URL, options: { allowFile?: boolean; agentId?: string }): ParsedGitRemote {
    if (!fileGitAllowed(options.allowFile)) {
        throw new GitAccessError('invalid', 'file:// URLs are not allowed. Paste an https or ssh URL. BlinkyBot uses your git credentials and does not store them.')
    }
    const pathname = decodeURIComponent(url.pathname)
    if (!isAbsolute(pathname)) throw new GitAccessError('invalid', 'A file URL needs an absolute path.')
    if (options.agentId) assertFilePathIsolated(options.agentId, pathname)
    const repoPath = cleanRepoPath(pathname, { absolute: true })
    const remote = `file://${repoPath}`
    return { remote, remoteKey: `file:${repoPath}`, scheme: 'file', host: '', repoPath }
}

function cleanRepoPath(path: string, options: { absolute?: boolean } = {}): string {
    const stripped = path.replace(/\/+$/, '').replace(/^\/+/, '')
    if (!stripped || stripped.includes('\0')) throw new GitAccessError('invalid', 'That git URL has no repository path.')
    const segments = stripped.split('/').filter(Boolean)
    if (segments.some(segment => segment === '.' || segment === '..')) {
        throw new GitAccessError('invalid', 'That git URL points outside the repository path.')
    }
    if (options.absolute) return `/${stripped}`
    return stripped.endsWith('.git') ? stripped : `${stripped}.git`
}

function keyFor(host: string, repoPath: string): string {
    return `${host.toLowerCase()}/${repoPath.replace(/\.git$/, '').replace(/^\/+/, '')}`
}

export function assertFilePathIsolated(agentId: string, filePath: string): void {
    const abs = resolve(filePath)
    let real = abs
    try {
        real = realpathSync(abs)
    } catch {
        real = abs
    }
    const agents = agentsDir()
    if (real === agents || real.startsWith(agents + sep)) {
        const owner = relative(agents, real).split(sep)[0]
        if (owner && owner !== agentId) {
            throw new GitAccessError('invalid', "That path points at another coworker's files.")
        }
        throw new GitAccessError('invalid', 'Refusing to clone a path inside the agent data directory.')
    }
    const workspace = workspaceDir(agentId)
    if (real === workspace || real.startsWith(workspace + sep)) {
        throw new GitAccessError('invalid', "Refusing to clone a path inside this coworker's workspace.")
    }
}

export function repoSlug(repoPath: string, taken: Set<string>): string {
    const segments = repoPath.split('/').filter(Boolean)
    const leaf = segments.at(-1)?.replace(/\.git$/, '') || 'repo'
    const owner = segments.length > 1 ? segments.at(-2) : ''
    const base = sanitizeSlug(owner ? `${owner}--${leaf}` : leaf) || 'repo'
    let slug = base
    let n = 2
    while (taken.has(slug)) {
        slug = `${base}-${n}`
        n += 1
    }
    return slug
}

export function sanitizeSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/\.git$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
}

export function agentBranch(handle: string, task = 'workspace'): string {
    const taskSlug = sanitizeSlug(task) || 'workspace'
    const who = sanitizeSlug(handle) || 'agent'
    return `blinky/${who}/${taskSlug}`
}

export function checkoutDirname(slug: string, task?: string): string {
    if (!task || task === 'workspace') return slug
    const encoded = sanitizeSlug(task) || 'task'
    return `${slug}@${encoded}`
}
