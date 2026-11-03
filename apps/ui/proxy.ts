import { safeNextPath } from '@/lib/local-auth/cookie'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'
import { SESSION_COOKIE } from '@/lib/local-auth/constants'
import { extractPublishedSlug, PUBLISHED_SITE_ROUTE } from '@/lib/published/host'
import { STAGING_GATE_CHALLENGE, stagingGateVerdict } from '@/lib/staging-gate'
import {
    APP_GATED_PATHS,
    BRAND_GATE_COOKIE,
    BRAND_GATE_MAX_AGE,
    BRAND_GATE_PARAM,
    brandGateVerdict,
    isGatedPath,
} from '@rerun/contracts'
import { NextResponse, type NextRequest } from 'next/server'

// The UI kit is the product's whole interface laid out for copying, so it answers 404 unless the
// request carries the shared design system token, as `?key=` or in the cookie that grants it. Same
// token and same cookie as the landing, set on `.rerun.build`: unlocking once opens both hosts.
// No Supabase session is read here, so a capture of these pages still provisions nothing, which is
// what excluding `render/` from the matcher below exists for.
function brandGate(request: NextRequest): NextResponse {
    const secret = process.env.BRAND_GATE_TOKEN
    const verdict = brandGateVerdict({
        secret,
        param: request.nextUrl.searchParams.get(BRAND_GATE_PARAM),
        cookie: request.cookies.get(BRAND_GATE_COOKIE)?.value,
        production: process.env.NODE_ENV === 'production',
    })

    if (verdict === 'deny') return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

    const response = NextResponse.next()
    if (verdict === 'grant' && secret) {
        const host = (request.headers.get('host') ?? request.nextUrl.hostname).split(':')[0]
        const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
        response.cookies.set(BRAND_GATE_COOKIE, secret, {
            path: '/',
            maxAge: BRAND_GATE_MAX_AGE,
            sameSite: 'lax',
            domain: host.endsWith('rerun.build') ? '.rerun.build' : undefined,
            secure: (forwarded ?? request.nextUrl.protocol.replace(':', '')) === 'https',
        })
    }
    return response
}

export async function proxy(request: NextRequest) {
    // A published page answers before anything reads or writes a session: rerun.site must never
    // hold a cookie, nor provision an anonymous user for every visitor of a shared link.
    const publishedSlug = extractPublishedSlug(request.headers.get('host'))
    if (publishedSlug) {
        const url = request.nextUrl.clone()
        url.pathname = `${PUBLISHED_SITE_ROUTE}/${publishedSlug}${request.nextUrl.pathname}`
        return NextResponse.rewrite(url)
    }

    if (isGatedPath(request.nextUrl.pathname, APP_GATED_PATHS)) return brandGate(request)

    const stagingGate = stagingGateVerdict({
        password: process.env.STAGING_PASSWORD,
        authorization: request.headers.get('authorization'),
        pathname: request.nextUrl.pathname,
    })
    if (stagingGate === 'deny') {
        return new NextResponse('Authentication required', {
            status: 401,
            headers: { 'WWW-Authenticate': STAGING_GATE_CHALLENGE, 'Cache-Control': 'no-store' },
        })
    }

    if (isBlinkyLocalAuth()) return localAuthResponse(request)
    const { updateSession } = await import('@/supabase/middleware')
    return updateSession(request)
}

function localAuthResponse(request: NextRequest): NextResponse {
    if (request.nextUrl.pathname.startsWith('/api/local-auth/')) return NextResponse.next()
    const token = request.cookies.get(SESSION_COOKIE)?.value
    if (!token) {
        const url = request.nextUrl.clone()
        const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
        url.pathname = '/api/local-auth/enter'
        url.search = ''
        url.searchParams.set('next', safeNextPath(next))
        return NextResponse.redirect(url)
    }
    if (request.nextUrl.pathname.startsWith('/auth') && request.nextUrl.pathname !== '/auth/callback') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        return NextResponse.redirect(url)
    }
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - og/ and render/ (OG images and the pages the screenshot service captures: a headless
         *   navigation sends `sec-fetch-dest: document`, which would provision an anonymous user
         *   and a workspace on every capture)
         * - api/t/ (public webhook triggers, for the same reason: a GET trigger opened in a browser
         *   or unfurled by Slack would provision a user and a workspace on every link preview)
         * - api/files (uploads: Next tees the request body to hand it to the middleware, and truncates
         *   it at 10MB doing so, which silently corrupted every upload past that. The tee also buffers
         *   the whole body in memory, so streaming a file through is only possible from outside the
         *   matcher. These routes authenticate themselves through requireWorkspaceId().)
         * - api/llm (the boxes' model proxy, for the same 10MB truncation: an image a box hands its
         *   model travels inline in base64, and a cut body reached the route as "Invalid JSON". The
         *   caller is an engine with its key, never a browser with a session to refresh.)
         * - api/v1 (the mobile API: callers send a bearer token, never a cookie, so there is no
         *   session to refresh, and each route authenticates itself through apiRoute())
         * - email/ (artwork fetched by mail clients and image proxies, same reason again)
         * - r/ (the affiliate pixel and its API proxy: a tracking beacon has no session to
         *   refresh, and it fires on every page)
         * - api/host-metrics (the Incus hosts push their samples with a bearer token, once a minute
         *   each: there is no session to refresh)
         * - api/public/ (what the landing page asks of the app from another origin, without a cookie:
         *   there is no session to refresh)
         * - p/ (published file links: opened by whoever the link was shared with, who has no session
         *   to refresh, and would otherwise each get an anonymous user and a workspace)
         * - desktop-view (the screen of a coworker in the iOS app's web view: the ticket in its
         *   fragment is the only key, there is no session to refresh nor one to provision)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|api/version|api/t/|api/files|api/llm/|api/v1/|api/host-metrics|api/public/|og/|render/|email/|r/|p/|desktop-view|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        // The two trees under /render put back in, for the gate alone: proxy() returns before it
        // ever reaches updateSession(). The OG renders next to them, /render/brand and
        // /render/templates, stay out: the screenshot service captures those on every card.
        '/render/kit',
        '/render/kit/:path*',
        '/render/lab',
        '/render/lab/:path*',
        // Every path of a published site, images and favicon.ico included, which the exclusions
        // above would otherwise hand to the app's own files instead of the site's.
        { source: '/:path*', has: [{ type: 'host', value: '.+\\.rerun\\.site' }] },
        { source: '/:path*', has: [{ type: 'host', value: '.+\\.localhost' }] },
    ],
}
