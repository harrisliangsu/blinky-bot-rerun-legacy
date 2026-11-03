import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium, type BrowserContext } from 'patchright'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { resolveInWorkspace } from '../sandbox.js'
import { HostBreaker, hostOf, isFailureStatus, withHostBreaker, type HostAttempt } from '../host-breaker.js'
import { detectBotWall } from '../bot-wall.js'
import { offersTakeover } from './hitl.js'
import { browserProfileDir } from '../../config/paths.js'
import { withKeyedLock } from '../../lib/lock.js'
import type { RunContext } from '../../runtime/context.js'
import { driveEgoBrowser, EGO_BROWSER_SETUP, screenshotBytes, type EgoPage } from '../../browser/ego-browser.js'
import { savePage } from './page-file.js'

const TEXT_LIMIT = 50_000
const LINKS_LIMIT = 300
const LINK_TEXT_LIMIT = 80
const PROFILE_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
// Only cookies, consents and storage are worth keeping between calls; the caches would grow every
// agent's profile by tens of MB on boxes whose disk is already short.
const PROFILE_CACHE_DIRS = ['Default/Cache', 'Default/Code Cache', 'Default/GPUCache', 'Default/DawnWebGPUCache', 'Default/DawnGraphiteCache', 'Default/Service Worker/CacheStorage', 'BrowserMetrics']
const PROFILE_IN_USE = /ProcessSingleton|profile appears to be in use/i

type LaunchOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>

// Still used by the watched desktop (RERUN_DESKTOP, off in BlinkyBot) when a person takes over
// that screen. browser_navigate does not call this and does not fall back to it.
export async function launchContext(profileDir: string, display: string | null, extra: LaunchOptions = {}): Promise<BrowserContext> {
    const options: LaunchOptions = {
        channel: 'chromium',
        headless: !display,
        ...(display ? { env: { ...process.env, DISPLAY: display } } : {}),
        ...extra,
    }
    await mkdir(profileDir, { recursive: true })
    try {
        return await chromium.launchPersistentContext(profileDir, options)
    } catch (e) {
        if (!PROFILE_IN_USE.test((e as Error).message)) throw e
        await Promise.all(PROFILE_LOCK_FILES.map(name => rm(resolve(profileDir, name), { force: true })))
        return chromium.launchPersistentContext(profileDir, options)
    }
}

export async function dropProfileCaches(agentId: string): Promise<void> {
    await Promise.all(PROFILE_CACHE_DIRS.map(dir => rm(resolve(browserProfileDir(agentId), dir), { recursive: true, force: true })))
}

type Visit = { url: string; screenshotPath?: string; links?: boolean; timeoutMs: number }

function formatLinks(links: Array<{ href: string; text: string }>): string {
    const seen = new Set<string>()
    const lines: string[] = []
    for (const { href, text } of links) {
        if (!/^https?:\/\//.test(href) || seen.has(href)) continue
        seen.add(href)
        const label = text.replace(/\s+/g, ' ').trim().slice(0, LINK_TEXT_LIMIT)
        lines.push(label ? `- ${label} — ${href}` : `- ${href}`)
        if (lines.length === LINKS_LIMIT) break
    }
    return `\n\nLinks:\n${lines.length ? lines.join('\n') : 'none'}`
}

async function present(ctx: RunContext, visit: Visit, page: EgoPage): Promise<HostAttempt> {
    const url = page.finalUrl || visit.url
    const wall = detectBotWall({ html: page.html, text: page.text })
    const body = wall
        ? `Blocked by ${wall.provider} bot protection, so this page cannot be read from here. The page stays open in this coworker's ego(lite) Space. ${offersTakeover(ctx.agent.config) ? 'If the user can get past it by hand, call request_takeover with this URL; otherwise open ego(lite) and clear the check there, then try browser_navigate again.' : 'Open ego(lite) and clear the check in that Space if a person can, then try again. Otherwise use another source.'}`
        : page.text.replace(/\s+\n/g, '\n').trim().slice(0, TEXT_LIMIT)
    const linkList = visit.links && !wall ? formatLinks(page.links) : ''
    const saved = wall || !page.html ? null : await savePage(ctx.agent.id, { url: visit.url, view: 'browser', body: page.html, ext: 'html', status: page.status, finalUrl: url })
    let note = ''
    if (visit.screenshotPath && !wall) {
        const target = resolveInWorkspace(ctx.agent.id, visit.screenshotPath)
        const bytes = screenshotBytes(page.screenshot)
        if (bytes) {
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, bytes)
            note = `\n\n[screenshot saved to ${visit.screenshotPath}]`
        } else {
            note = '\n\n[screenshot was not saved: captureScreenshot did not return an image BlinkyBot could write]'
        }
    }
    const savedLine = saved ? `\nSaved whole: ${saved} (the rendered HTML: read or grep it for anything this text leaves out)` : ''
    return { text: `[${page.status}] ${url}${savedLine}\n\n${body}${linkList}${note}`, failed: !!wall || isFailureStatus(page.status) }
}

export function browserTools(ctx: RunContext): ToolSet {
    const id = ctx.agent.id
    const breaker = ctx.hostBreaker ?? new HostBreaker()
    return {
        browser_navigate: tool({
            description:
                'Open a URL in ego(lite) through the ego-browser command. The page renders in this coworker\'s isolated Space, which reuses logins the user imported into ego(lite), and this returns the page snapshot, plus the links when you ask for them. Use this instead of web_fetch for pages that need JavaScript, and instead of any other browser. If ego(lite) is not installed or its onboarding is unfinished, this fails with setup instructions and does not switch to Chromium or Playwright. Optionally save a screenshot into your workspace to inspect later with vision_analyze.',
            inputSchema: z.object({
                url: z.string().url(),
                screenshotPath: z.string().optional().describe('Workspace-relative path to save a PNG screenshot'),
                links: z.boolean().default(false).describe('Also list the links on the page (text and URL), e.g. to open the results of a search'),
                timeoutMs: z.number().int().positive().max(120_000).default(30_000),
            }),
            execute: async (visit: Visit) => {
                const host = hostOf(visit.url)
                return withHostBreaker(breaker, host ? [host] : [], async (): Promise<HostAttempt> => {
                    return withKeyedLock(`browser:${id}`, async (): Promise<HostAttempt> => {
                        try {
                            const driven = await driveEgoBrowser({
                                agentId: id,
                                url: visit.url,
                                timeoutMs: visit.timeoutMs,
                                links: visit.links === true,
                                screenshot: Boolean(visit.screenshotPath),
                            })
                            if (!driven.ok) {
                                if (driven.missing) return { text: EGO_BROWSER_SETUP, failed: false }
                                return { text: `Navigation failed: ${driven.message}`, failed: true }
                            }
                            return await present(ctx, visit, driven.page)
                        } catch (e) {
                            return { text: `Navigation failed: ${(e as Error).message}`, failed: true }
                        }
                    })
                })
            },
        }),
    }
}
