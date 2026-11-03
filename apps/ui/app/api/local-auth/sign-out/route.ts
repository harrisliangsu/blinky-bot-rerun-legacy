import { NextResponse } from 'next/server'

import { sessionTokenFromRequest } from '@/lib/local-auth/cookie'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/local-auth/constants'
import { deleteLocalSession } from '@/lib/local-auth/db'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'

export async function POST(request: Request) {
    if (!isBlinkyLocalAuth()) return new NextResponse('Not found', { status: 404 })
    const token = sessionTokenFromRequest(request)
    if (token) deleteLocalSession(token)
    const response = new NextResponse(null, { status: 204 })
    response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
    return response
}
