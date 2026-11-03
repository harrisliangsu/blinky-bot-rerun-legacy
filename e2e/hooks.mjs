import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function drivePackagedEgo({ app, stubPath, stubLog }) {
    const modulePath = join(app, 'Contents/Resources/runtime/engine/dist/browser/ego-browser.js')
    const mod = await import(pathToFileURL(modulePath).href)
    const url = 'https://example.com/e2e'
    const driven = await mod.driveEgoBrowser(
        { agentId: 'e2e', url, timeoutMs: 8_000, links: false, screenshot: false },
        {
            env: {
                ...process.env,
                EGO_BROWSER_PATH: stubPath,
                BLINKY_STUB_LOG: stubLog,
                PATH: `${dirname(stubPath)}:${process.env.PATH ?? ''}`,
            },
        },
    )
    if (!driven.ok) throw new Error(`ego(lite) did not drive the page: ${JSON.stringify(driven)}`)
    if (driven.page.text !== 'BLINKY_EGO_PAGE' || driven.page.finalUrl !== url) {
        throw new Error(`ego(lite) returned an unexpected page: ${JSON.stringify(driven.page)}`)
    }
    const log = readFileSync(stubLog, 'utf8')
    if (!log.includes('"bin":"ego-browser"') || !log.includes('nodejs') || !log.includes(url)) {
        throw new Error('The browser task was not routed to ego-browser nodejs.')
    }
    return { url, text: driven.page.text }
}
