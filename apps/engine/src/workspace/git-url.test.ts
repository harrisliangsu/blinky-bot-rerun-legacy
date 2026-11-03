import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'rerun-git-url-'))
process.env.RERUN_DATA_DIR = root

const { describe, expect, it } = await import('vitest')
const { GitAccessError } = await import('./git-error.js')
const { agentBranch, checkoutDirname, parseGitRemote, repoSlug } = await import('./git-url.js')
const { workspaceDir } = await import('../config/paths.js')

describe('parseGitRemote', () => {
    it('normalizes https and ssh forms onto one remote key', () => {
        const https = parseGitRemote('https://GitHub.com/Harris/Blinky.git')
        const ssh = parseGitRemote('git@github.com:Harris/Blinky.git')
        const url = parseGitRemote('ssh://git@github.com/Harris/Blinky')
        expect(https.remote).toBe('https://github.com/Harris/Blinky.git')
        expect(https.remoteKey).toBe(ssh.remoteKey)
        expect(url.remoteKey).toBe(ssh.remoteKey)
        expect(ssh.scheme).toBe('ssh')
    })

    it('keeps http for a self-hosted host', () => {
        const parsed = parseGitRemote('http://git.local:3000/team/app')
        expect(parsed.remote).toBe('http://git.local:3000/team/app.git')
        expect(parsed.scheme).toBe('http')
    })

    it('rejects passwords, relative paths, and file URLs unless a test asks for them', () => {
        expect(() => parseGitRemote('https://user:s3cret@github.com/a/b.git')).toThrow(GitAccessError)
        expect(() => parseGitRemote('https://user:s3cret@github.com/a/b.git')).toThrow(/does not store git passwords/)
        expect(() => parseGitRemote('../other.git')).toThrow(/Relative paths/)
        expect(() => parseGitRemote('file:///tmp/repo.git')).toThrow(/file:\/\/ URLs are not allowed/)
        const allowed = parseGitRemote('file:///tmp/repo.git', { allowFile: true })
        expect(allowed.remote).toBe('file:///tmp/repo.git')
        expect(allowed.scheme).toBe('file')
    })

    it('refuses a file URL that points at another coworker', () => {
        const foreign = join(workspaceDir('other-coworker'), 'nested.git')
        mkdirSync(foreign, { recursive: true })
        expect(() => parseGitRemote(`file://${foreign}`, { allowFile: true, agentId: 'this-coworker' })).toThrow(/another coworker/)
    })
})

describe('repo names', () => {
    it('builds a per-agent branch and a single-segment worktree directory', () => {
        expect(agentBranch('Ada Lovelace', 'Fix login')).toBe('blinky/ada-lovelace/fix-login')
        expect(checkoutDirname('harris--blinky', 'fix-login')).toBe('harris--blinky@fix-login')
        expect(repoSlug('Harris/Blinky.git', new Set())).toBe('harris-blinky')
        expect(repoSlug('Harris/Blinky.git', new Set(['harris-blinky']))).toBe('harris-blinky-2')
    })
})
