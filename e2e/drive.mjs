import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { routeEgoBrowser } from './hooks.mjs'

const mode = process.argv[2]
const out = process.env.E2E_OUT
const ui = process.env.BLINKY_UI_URL
const engineUrl = process.env.BLINKY_ENGINE_URL
const apiKey = process.env.BLINKY_API_KEY
const stubLog = process.env.BLINKY_STUB_LOG
const root = process.env.BLINKY_REPO_ROOT
const prompt = 'E2E fixture ping'
const reply = 'BLINKY_E2E_REPLY'

if (!mode || !out || !ui || !engineUrl || !apiKey) {
    console.error('drive.mjs needs core|persist plus E2E_OUT, BLINKY_UI_URL, BLINKY_ENGINE_URL, and BLINKY_API_KEY')
    process.exit(1)
}

const shots = join(out, 'screenshots')
mkdirSync(shots, { recursive: true })
const features = JSON.parse(readFileSync(join(out, 'features.json'), 'utf8'))
const statePath = join(out, 'state.json')

try {
    if (mode === 'core') await core()
    else if (mode === 'persist') await persist()
    else throw new Error(`Unknown mode ${mode}`)
} catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error)
    writeFileSync(join(out, `${mode}.json`), JSON.stringify({ ok: false, detail }, null, 2))
    process.stderr.write(`${detail}\n`)
    process.exit(1)
}

async function core() {
    const agent = await createCoworker()
    const notes = []
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    page.on('console', message => notes.push(`${message.type()}: ${message.text()}`))
    page.on('pageerror', error => notes.push(`pageerror: ${error.message}`))
    try {
        await page.goto(ui, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        if (features.onboarding.enabled) {
            await dismissOnboarding(page)
        } else {
            notes.push(features.onboarding.reason)
        }
        await page.getByRole('button', { name: 'BlinkyBot', exact: true }).first().waitFor({ timeout: 60_000 })
        await page.screenshot({ path: join(shots, 'workspace.png') })
        await page.getByRole('button', { name: 'New coworker' }).click()
        await page.getByRole('heading', { name: 'What should your new coworker do?' }).waitFor({ timeout: 20_000 })
        await page.screenshot({ path: join(shots, 'new-coworker.png') })
        await page.keyboard.press('Escape')
        await page.goto(`${ui}/?agent=${agent.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        const composer = page.getByPlaceholder('Send a message...')
        await composer.waitFor({ timeout: 45_000 })
        const seen = []
        const watch = watchRuns(agent.id, seen)
        await composer.click()
        await composer.fill(prompt)
        const submit = page.locator('form button[type="submit"]').last()
        await submit.waitFor({ state: 'visible', timeout: 30_000 })
        const enabledAt = Date.now() + 30_000
        while (Date.now() < enabledAt && !(await submit.isEnabled())) await sleep(200)
        if (!(await submit.isEnabled())) throw new Error('The send button stayed disabled.')
        await submit.click()
        const stopVisible = await page.getByRole('button', { name: 'Stop the current run' }).waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
        const run = await watch
        if (!seen.includes('running') || !seen.includes('done')) {
            throw new Error(`Run statuses were ${seen.join(' -> ') || 'empty'}. Last run: ${JSON.stringify(run)}`)
        }
        if (run?.status !== 'done') throw new Error(run?.error || `Run statuses were ${seen.join(' -> ') || 'empty'}. Last run: ${JSON.stringify(run)}`)
        await page.getByText(reply).first().waitFor({ timeout: 20_000 })
        await page.screenshot({ path: join(shots, 'task-reply.png') })
        const messages = await engine(`/agents/${agent.id}/sessions/${run.sessionId}/messages`)
        const stored = JSON.stringify(messages)
        if (!stored.includes(reply) || !stored.includes(prompt)) throw new Error('The engine session does not store the prompt and the reply.')
        const log = readFileSync(stubLog, 'utf8')
        if (!log.includes('"mode":"app-server"') || !log.includes(prompt)) throw new Error('The stub codex CLI was not invoked for the task.')
        let ego = features.ego.reason
        if (features.ego.enabled) {
            const routed = await routeEgoBrowser({ root, engineUrl, apiKey, stubLog })
            ego = `Routed a browser task through ${routed.path} (${routed.status}).`
        }
        writeFileSync(statePath, JSON.stringify({ agentId: agent.id, sessionId: run.sessionId }))
        writeFileSync(join(out, 'core.json'), JSON.stringify({
            ok: true,
            detail: [
                'Opened the local BlinkyBot workspace, opened New coworker, and sent a task from the chat composer.',
                `Run statuses: ${seen.join(' -> ')}. Stop control visible: ${stopVisible}.`,
                `Stub reply ${reply} is on screen and stored on the session.`,
                ego,
                notes.filter(Boolean).slice(-8).join('\n'),
            ].join('\n\n'),
        }, null, 2))
    } catch (error) {
        await page.screenshot({ path: join(shots, 'core-failed.png') }).catch(() => {})
        writeFileSync(join(out, 'browser.log'), notes.join('\n'))
        throw error
    } finally {
        await context.close()
        await browser.close()
    }
}

async function persist() {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    try {
        await page.goto(`${ui}/?agent=${state.agentId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        const visible = page.getByText(reply).first()
        if (!(await visible.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false))) {
            const conversation = page.getByText(prompt).first()
            await conversation.click({ timeout: 20_000 })
        }
        await page.getByText(reply).first().waitFor({ timeout: 30_000 })
        await page.screenshot({ path: join(shots, 'after-relaunch.png') })
        const messages = await engine(`/agents/${state.agentId}/sessions/${state.sessionId}/messages`)
        if (!JSON.stringify(messages).includes(reply)) throw new Error('The reply was not on disk after relaunch.')
        writeFileSync(join(out, 'persist.json'), JSON.stringify({ ok: true, detail: 'After relaunch the same session still shows the stub reply, and the engine still has it on disk.' }, null, 2))
    } catch (error) {
        await page.screenshot({ path: join(shots, 'persist-failed.png') }).catch(() => {})
        throw error
    } finally {
        await context.close()
        await browser.close()
    }
}

async function dismissOnboarding(page) {
    const landmark = page.getByText(/get started|welcome to blinky|first run|set up blinky/i).first()
    await landmark.waitFor({ timeout: 30_000 })
    await page.screenshot({ path: join(shots, 'onboarding.png') })
    const button = page.getByRole('button', { name: /continue|get started|next/i }).first()
    await button.click({ timeout: 10_000 })
}

async function createCoworker() {
    const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const connection = await engine('/connections', {
        method: 'POST',
        body: {
            name: 'E2E Codex',
            provider: 'codex',
            models: ['gpt-5.6-sol'],
            keys: { CODEX_OAUTH_TOKEN: 'e2e-access-token', CODEX_OAUTH_EXPIRES_AT: expires },
        },
    })
    const agent = await engine('/agents', {
        method: 'POST',
        body: {
            config: {
                name: 'e2e_coworker',
                displayName: 'E2E Coworker',
                description: 'Deterministic stub coworker',
                provider: 'codex',
                connectionId: connection.id,
                model: 'gpt-5.6-sol',
                enabled: true,
                tools: { web: false, browser: false },
            },
        },
    })
    return agent
}

async function watchRuns(agentId, seen) {
    const deadline = Date.now() + 90_000
    let last = null
    while (Date.now() < deadline) {
        const body = await engine(`/agents/${agentId}/runs`).catch(() => ({ runs: [] }))
        const run = body.runs?.[0]
        if (run) {
            last = run
            if (!seen.includes(run.status)) seen.push(run.status)
            if (run.status === 'done' || run.status === 'error') return run
        }
        await sleep(250)
    }
    return last
}

async function engine(path, options = {}) {
    const response = await fetch(`${engineUrl}${path}`, {
        method: options.method || 'GET',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : null
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
