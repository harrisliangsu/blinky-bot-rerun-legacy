import { NextResponse } from 'next/server'

import { safeNextPath, sessionTokenFromRequest } from '@/lib/local-auth/cookie'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/local-auth/constants'
import { createLocalSession, ensureLocalIdentity, readLocalSession } from '@/lib/local-auth/db'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'

export async function GET(request: Request) {
    if (!isBlinkyLocalAuth()) return new NextResponse('Not found', { status: 404 })

    const url = new URL(request.url)
    const existing = sessionTokenFromRequest(request)
    const session = (existing && readLocalSession(existing)) || createLocalSession(ensureLocalIdentity().user.id)
    const response = NextResponse.redirect(new URL(safeNextPath(url.searchParams.get('next')), url.origin))
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions())
    return response
}
