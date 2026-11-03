import { HttpError } from '../lib/errors.js'

export type GitFailureKind = 'permission' | 'unreachable' | 'not_found' | 'invalid' | 'timeout' | 'failed'

const PERMISSION = 'No permission to read this repository. BlinkyBot does not store git passwords or SSH keys. Sign in with gh auth login, add a key with ssh-add, or use the system git credential helper (macOS Keychain).'

export class GitAccessError extends HttpError {
    kind: GitFailureKind

    constructor(kind: GitFailureKind, message: string) {
        const status = kind === 'permission' ? 403 : kind === 'invalid' ? 400 : 422
        super(status, message)
        this.kind = kind
        this.name = 'GitAccessError'
    }
}

export function classifyGitFailure(text: string, timedOut: boolean): GitAccessError {
    if (timedOut) return new GitAccessError('timeout', 'Timed out talking to the git host. Check the network and try again.')
    const blob = text.toLowerCase()
    if (/permission denied|authentication failed|could not read from remote|terminal prompts disabled|access rights|invalid credentials|authorization failed|publickey/.test(blob)) {
        return new GitAccessError('permission', PERMISSION)
    }
    if (/could not resolve host|network is unreachable|connection refused|connection timed out|unable to connect|name or service not known|no route to host|operation timed out|temporary failure in name resolution/.test(blob)) {
        return new GitAccessError('unreachable', 'The git host is unreachable.')
    }
    if (/repository not found|not found/.test(blob)) {
        return new GitAccessError('not_found', 'Cannot access this repository. It may be missing, private, or your git credentials do not allow it. Sign in with gh auth login, ssh-add, or the system git credential helper. BlinkyBot does not store a password.')
    }
    const detail = text.trim().replace(/\s+/g, ' ').slice(0, 400)
    return new GitAccessError('failed', detail || 'Git failed.')
}
