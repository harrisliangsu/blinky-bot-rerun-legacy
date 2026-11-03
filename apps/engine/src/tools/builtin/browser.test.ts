import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-browser-'))
process.env.RERUN_API_KEY = ''

const ego = vi.hoisted(() => ({
    calls: [] as Array<Record<string, unknown>>,
    result: { ok: true as const, page: { text: 'Hello', status: 200, html: '<html></html>', links: [] as Array<{ href: string; text: string }>, finalUrl: '', screenshot: null as unknown, taskId: '1' } },
    inflight: 0,
    maxInflight: 0,
    desktop: false,
}))

vi.mock('../../desktop/session.js', () => ({ desktopAvailable: () => ego.desktop }))

vi.mock('../../browser/ego-browser.js', async () => {
    const actual = await vi.importActual<typeof import('../../browser/ego-browser.js')>('../../browser/ego-browser.js')
    return {
        ...actual,
        driveEgoBrowser: async (input: Record<string, unknown>) => {
            ego.calls.push(input)
            ego.inflight += 1
            ego.maxInflight = Math.max(ego.maxInflight, ego.inflight)
            await new Promise(r => setTimeout(r, 5))
            ego.inflight -= 1
            return ego.result
        },
    }
})

const { beforeEach, describe, expect, it } = await import('vitest')
const { HostBreaker, BLOCKED_SOURCE_PREFIX } = await import('../host-breaker.js')
const { EGO_BROWSER_SETUP } = await import('../../browser/ego-browser.js')
const { workspaceDir } = await import('../../config/paths.js')
const { browserTools } = await import('./browser.js')

const agentId = 'browsing-agent'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

function ctxWith(id = agentId) {
    return { agent: { id, config: { tools: { browser: true }, ephemeral: false, kind: 'user' } }, sessionId: 's', logger: { warn() {} }, hostBreaker: new HostBreaker() } as any
}

const withoutSavedLine = (text: string): string => text.replace(/\nSaved whole: [^\n]*/, '')

async function navigate(ctx: any, args: Record<string, unknown>): Promise<string> {
    return withoutSavedLine((await (browserTools(ctx).browser_navigate as any).execute({ timeoutMs: 30_000, ...args }, { toolCallId: 'c', messages: [] })) as string)
}

function page(partial: Partial<(typeof ego.result)['page']> = {}) {
    ego.result = { ok: true, page: { text: 'Hello', status: 200, html: '<html></html>', links: [], finalUrl: '', screenshot: null, taskId: '1', ...partial } }
}

beforeEach(() => {
    ego.calls.length = 0
    ego.inflight = 0
    ego.maxInflight = 0
    ego.desktop = false
    page()
})

describe('browser_navigate', () => {
    it('reads the page through ego-browser and keeps the task on that agent', async () => {
        page({ text: '  Title   \n\n  Body line  \n  ', finalUrl: 'https://example.com/page' })
        expect(await navigate(ctxWith(), { url: 'https://example.com/page' })).toBe('[200] https://example.com/page\n\nTitle\n  Body line')
        expect(ego.calls).toEqual([{ agentId, url: 'https://example.com/page', timeoutMs: 30_000, links: false, screenshot: false }])
    })

    it('caps the text at 50k characters', async () => {
        page({ text: 'z'.repeat(80_000) })
        const out = await navigate(ctxWith(), { url: 'https://example.com/' })
        expect(out).toBe(`[200] https://example.com/\n\n${'z'.repeat(50_000)}`)
    })

    it('reports a bot wall and does not count a missing ego install as a host failure', async () => {
        page({ status: 403, text: 'Verifying you are human.', html: '<title>Just a moment...</title>' })
        const out = await navigate(ctxWith(), { url: 'https://walled.example/' })
        expect(out).toContain('Blocked by Cloudflare bot protection')
        expect(out).toContain('ego(lite) Space')
        expect(out).toContain('[attempt 1/3 on walled.example failed in this run]')
    })

    it('points at request_takeover when the desktop can hand the page over', async () => {
        ego.desktop = true
        page({ status: 403, text: 'Verifying you are human.', html: '<title>Just a moment...</title>' })
        const out = await navigate(ctxWith(), { url: 'https://walled.example/' })
        expect(out).toContain('call request_takeover with this URL')
    })

    it('does not mistake a long page that embeds a bot vendor for a block', async () => {
        page({ text: 'listing '.repeat(1_000), html: '<script src="https://js.captcha-delivery.com/tags.js"></script>' })
        const out = await navigate(ctxWith(), { url: 'https://ads.example/' })
        expect(out).not.toContain('Blocked by')
        expect(out).not.toContain('failed in this run')
    })

    it('lists the links of the page when asked, once each and only web addresses', async () => {
        page({
            text: 'Results',
            finalUrl: 'https://www.tiktok.com/search/photo?q=ads',
            links: [
                { href: 'https://www.tiktok.com/@chenny/photo/766', text: '  How to set up\n your first Meta ad ' },
                { href: 'https://www.tiktok.com/@chenny/photo/766', text: 'duplicate' },
                { href: 'javascript:void(0)', text: 'Log in' },
                { href: 'https://www.tiktok.com/@alex/photo/760', text: '' },
            ],
        })
        const out = await navigate(ctxWith(), { url: 'https://www.tiktok.com/search/photo?q=ads', links: true })
        expect(out).toBe('[200] https://www.tiktok.com/search/photo?q=ads\n\nResults\n\nLinks:\n- How to set up your first Meta ad — https://www.tiktok.com/@chenny/photo/766\n- https://www.tiktok.com/@alex/photo/760')
        expect(ego.calls[0]).toMatchObject({ links: true })
    })

    it('lists no links unless asked, nor behind a bot wall', async () => {
        page({ text: 'Results', links: [{ href: 'https://example.com/a', text: 'A' }] })
        expect(await navigate(ctxWith(), { url: 'https://example.com/' })).toBe('[200] https://example.com/\n\nResults')
        page({ status: 403, text: 'Verifying you are human.', html: '<title>Just a moment...</title>', links: [{ href: 'https://walled.example/a', text: 'A' }] })
        expect(await navigate(ctxWith(), { url: 'https://walled.example/', links: true })).not.toContain('Links:')
    })

    it('keeps the rendered HTML in the workspace and says where', async () => {
        const html = '<html><body><nav><a href="/compare">Compare</a></nav>Pricing</body></html>'
        page({ text: 'Pricing', html, finalUrl: 'https://render.example/pricing' })
        const out = (await (browserTools(ctxWith()).browser_navigate as any).execute({ url: 'https://render.example/pricing', timeoutMs: 30_000 }, { toolCallId: 'c', messages: [] })) as string
        expect(out.split('\n').slice(0, 2)).toEqual(['[200] https://render.example/pricing', 'Saved whole: .rerun/pages/render.example/pricing.browser.html (the rendered HTML: read or grep it for anything this text leaves out)'])
        expect(readFileSync(resolve(workspaceDir(agentId), '.rerun/pages/render.example/pricing.browser.html'), 'utf8')).toBe(html)
    })

    it('saves no page behind a bot wall', async () => {
        page({ status: 403, text: 'Verifying you are human.', html: '<title>Just a moment...</title>' })
        const out = (await (browserTools(ctxWith()).browser_navigate as any).execute({ url: 'https://walled.example/', timeoutMs: 1000 }, { toolCallId: 'c', messages: [] })) as string
        expect(out).not.toContain('Saved whole')
    })

    it('saves a screenshot inside the workspace', async () => {
        page({ text: 'hi', screenshot: `data:image/png;base64,${PNG.toString('base64')}` })
        const out = await navigate(ctxWith(), { url: 'https://example.com/', screenshotPath: 'shots/home.png' })
        const target = resolve(workspaceDir(agentId), 'shots/home.png')
        expect(out).toBe('[200] https://example.com/\n\nhi\n\n[screenshot saved to shots/home.png]')
        expect(existsSync(target)).toBe(true)
        expect(ego.calls[0]).toMatchObject({ screenshot: true })
    })

    it('refuses a screenshot outside the workspace', async () => {
        page({ text: 'hi', screenshot: `data:image/png;base64,${PNG.toString('base64')}` })
        const out = await navigate(ctxWith(), { url: 'https://example.com/', screenshotPath: '../../escape.png' })
        expect(out).toMatch(/^Navigation failed: /)
        expect(out).toContain('[attempt 1/3 on example.com failed in this run]')
    })

    it('says when the screenshot payload is not an image', async () => {
        page({ text: 'hi', screenshot: { note: 'no image' } })
        const out = await navigate(ctxWith(), { url: 'https://example.com/', screenshotPath: 'shots/missing.png' })
        expect(out).toContain('[screenshot was not saved:')
        expect(existsSync(resolve(workspaceDir(agentId), 'shots/missing.png'))).toBe(false)
    })

    it('fails a navigation the command could not finish', async () => {
        ego.result = { ok: false, missing: false, message: 'net::ERR_NAME_NOT_RESOLVED' } as any
        expect(await navigate(ctxWith(), { url: 'https://nowhere.example/' })).toBe('Navigation failed: net::ERR_NAME_NOT_RESOLVED\n\n[attempt 1/3 on nowhere.example failed in this run]')
    })

    it('stops after three refusals and does not treat a missing ego(lite) as one of them', async () => {
        page({ status: 403, text: 'nope', html: '' })
        const ctx = ctxWith()
        expect(await navigate(ctx, { url: 'https://www.blocked.example/a' })).toContain('[attempt 1/3 on blocked.example failed in this run]')
        expect(await navigate(ctx, { url: 'https://blocked.example/b' })).toContain('[attempt 2/3 on blocked.example failed in this run]')
        expect(await navigate(ctx, { url: 'https://blocked.example/c' })).toContain(`${BLOCKED_SOURCE_PREFIX} blocked.example`)
        expect(await navigate(ctx, { url: 'https://blocked.example/d' })).toMatch(new RegExp(`^${BLOCKED_SOURCE_PREFIX} blocked.example`))
        expect(ego.calls).toHaveLength(3)

        ego.result = { ok: false, missing: true } as any
        const setup = await navigate(ctxWith('other'), { url: 'https://setup.example/' })
        expect(setup).toBe(EGO_BROWSER_SETUP)
        expect(setup).toContain('设置 → ego(lite)')
        expect(setup).not.toContain('failed in this run')
    })

    it('runs the calls of one agent one at a time, and different agents side by side', async () => {
        await Promise.all([navigate(ctxWith(), { url: 'https://a.example/' }), navigate(ctxWith(), { url: 'https://b.example/' })])
        expect(ego.maxInflight).toBe(1)
        ego.maxInflight = 0
        await Promise.all([navigate(ctxWith('agent-one'), { url: 'https://a.example/' }), navigate(ctxWith('agent-two'), { url: 'https://b.example/' })])
        expect(ego.maxInflight).toBe(2)
    })
})
