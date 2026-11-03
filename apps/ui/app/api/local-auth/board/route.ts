import { NextResponse } from 'next/server'

import { sessionTokenFromRequest } from '@/lib/local-auth/cookie'
import { readLocalSession } from '@/lib/local-auth/db'
import { localBoard } from '@/lib/local-auth/engine-board'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'

export async function GET(request: Request) {
    if (!isBlinkyLocalAuth()) return new NextResponse('Not found', { status: 404 })
    const token = sessionTokenFromRequest(request)
    const session = token ? readLocalSession(token) : null
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await localBoard(session.workspace))
}
