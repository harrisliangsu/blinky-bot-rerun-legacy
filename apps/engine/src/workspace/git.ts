import { spawn } from 'node:child_process'
import { classifyGitFailure, GitAccessError } from './git-error.js'

const STRIPPED = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_NAMESPACE'])

export type GitRunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

export function gitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(base)) {
        if (typeof value !== 'string' || STRIPPED.has(key)) continue
        env[key] = value
    }
    env.GIT_TERMINAL_PROMPT = '0'
    env.GCM_INTERACTIVE = 'never'
    return env
}

export function runGit(args: string[], options: { cwd?: string; timeoutMs?: number; extraEnv?: NodeJS.ProcessEnv } = {}): Promise<GitRunResult> {
    const timeoutMs = options.timeoutMs ?? 120_000
    return new Promise(resolve => {
        let child: ReturnType<typeof spawn>
        try {
            child = spawn('git', args, {
                cwd: options.cwd,
                env: { ...gitEnv(), ...options.extraEnv },
                stdio: ['ignore', 'pipe', 'pipe'],
            })
        } catch (error) {
            resolve({ code: null, stdout: '', stderr: error instanceof Error ? error.message : String(error), timedOut: false })
            return
        }
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
        }, timeoutMs)
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
            resolve({ code: null, stdout, stderr: missing ? 'git is not installed' : error.message, timedOut: false })
        })
        child.once('close', code => {
            clearTimeout(timer)
            resolve({ code, stdout, stderr, timedOut })
        })
    })
}

export async function gitOk(args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<GitRunResult> {
    const result = await runGit(args, options)
    if (result.code === 0 && !result.timedOut) return result
    if (/git is not installed/.test(result.stderr)) throw new GitAccessError('failed', 'git is not installed.')
    throw classifyGitFailure(`${result.stderr}\n${result.stdout}`, result.timedOut)
}

export type RemoteHead = { defaultBranch: string; commit: string | null }

export async function lsRemote(remote: string): Promise<RemoteHead> {
    const result = await gitOk(['ls-remote', '--symref', '--', remote], { timeoutMs: 20_000 })
    return parseRemoteHead(result.stdout)
}

export function parseRemoteHead(stdout: string): RemoteHead {
    let defaultBranch = 'main'
    let commit: string | null = null
    for (const line of stdout.split('\n')) {
        const sym = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim())
        if (sym) defaultBranch = sym[1]
        const head = /^([0-9a-f]{40})\s+HEAD$/.exec(line.trim())
        if (head) commit = head[1]
    }
    return { defaultBranch, commit }
}

export async function gitLfsAvailable(): Promise<boolean> {
    const result = await runGit(['lfs', 'version'], { timeoutMs: 5_000 })
    return result.code === 0 && !result.timedOut
}
