import { SESSION_COOKIE } from './constants'

export function sessionTokenFromRequest(request: Request): string | null {
    const header = request.headers.get('cookie') ?? ''
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=')
        if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('=')) || null
    }
    return null
}

export function safeNextPath(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
    if (raw.startsWith('/api/local-auth')) return '/'
    return raw
}
