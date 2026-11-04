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

export async function driveMissingEgo({ app }) {
    const modulePath = join(app, 'Contents/Resources/runtime/engine/dist/browser/ego-browser.js')
    const mod = await import(pathToFileURL(modulePath).href)
    const home = '/tmp/blinky-e2e-no-ego'
    const driven = await mod.driveEgoBrowser(
        { agentId: 'e2e-missing', url: 'https://example.com/missing', timeoutMs: 2_000, links: false, screenshot: false },
        { env: { PATH: '/usr/bin:/bin', HOME: home }, home, isExecutable: () => false },
    )
    if (driven.ok || !driven.missing) throw new Error(`A missing ego-browser should not drive a page: ${JSON.stringify(driven)}`)
    const text = mod.EGO_BROWSER_SETUP
    if (typeof text !== 'string' || !text.includes('ego(lite) is not ready') || !text.includes('尚未就绪')) {
        throw new Error('The missing ego-browser path does not return the setup message.')
    }
    if (!text.includes('does not fall back to another browser')) {
        throw new Error('The setup message does not say the task stays on ego(lite).')
    }
    return text
}

export async function drivePackagedClis({ app, bin, stubLog, cwd }) {
    const modulePath = join(app, 'Contents/Resources/runtime/engine/dist/agents/cli-adapters/registry.js')
    const mod = await import(pathToFileURL(modulePath).href)
    const secret = 'e2e-secret-value'
    const lines = []
    for (const id of ['codex', 'kimi', 'grok', 'claude']) {
        const result = await mod.runLocalCli(
            id,
            {
                prompt: `roundtrip-${id}`,
                cwd,
                home: cwd,
                env: { CODEX_API_KEY: secret, KIMI_API_KEY: secret, XAI_API_KEY: secret, ANTHROPIC_API_KEY: secret },
            },
            {
                timeoutMs: 20_000,
                processEnv: {
                    ...process.env,
                    RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude',
                    RERUN_CODEX_PATH: join(bin, 'codex.mjs'),
                    RERUN_KIMI_PATH: join(bin, 'kimi.mjs'),
                    RERUN_GROK_PATH: join(bin, 'grok.mjs'),
                    RERUN_CLAUDE_PATH: join(bin, 'claude.mjs'),
                    BLINKY_STUB_LOG: stubLog,
                    PATH: `${bin}:${process.env.PATH ?? ''}`,
                },
            },
        )
        if (!result.parsed?.text?.includes('BLINKY_E2E_REPLY') || result.parsed.text.includes(`roundtrip-${id}`)) {
            throw new Error(`${id} echoed its prompt instead of a reply: ${JSON.stringify(result.parsed)}`)
        }
        if (`${result.stdout}${result.stderr}`.includes(secret) || result.invocation.args.some(arg => String(arg).includes(secret))) {
            throw new Error(`${id} put a secret on the command line or in its output.`)
        }
        lines.push(`${id} parsed ${result.parsed.text}`)
    }
    const log = readFileSync(stubLog, 'utf8')
    if (log.includes(secret)) throw new Error('The stub log kept a CLI secret.')
    if (!log.includes('[set]')) throw new Error('The stub log did not redact the CLI secrets.')
    return lines
}
