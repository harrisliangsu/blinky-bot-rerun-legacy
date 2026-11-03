import { chromium } from 'playwright'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { driveMissingEgo, drivePackagedClis, drivePackagedEgo } from './hooks.mjs'
import { assertRexLaunch } from './rex-hook.mjs'

const mode = process.argv[2]
const out = process.env.E2E_OUT
const ui = process.env.BLINKY_UI_URL
const engineUrl = process.env.BLINKY_ENGINE_URL
const apiKey = process.env.BLINKY_API_KEY
const stubLog = process.env.BLINKY_STUB_LOG
const app = process.env.BLINKY_APP
const suggestion = 'SEO Assistant'
const kickoffMark = 'Audit my website'
const reply = 'BLINKY_E2E_REPLY'

if (!mode || !out) {
    console.error('drive.mjs needs a mode and E2E_OUT')
    process.exit(1)
}
if ((mode === 'core' || mode === 'persist' || mode === 'chat' || mode === 'runs' || mode === 'workspace' || mode === 'retire') && (!ui || !engineUrl || !apiKey)) {
    console.error('drive.mjs core and persist need BLINKY_UI_URL, BLINKY_ENGINE_URL, and BLINKY_API_KEY')
    process.exit(1)
}

const shots = join(out, 'screenshots')
mkdirSync(shots, { recursive: true })
const features = JSON.parse(readFileSync(join(out, 'features.json'), 'utf8'))
const statePath = join(out, 'state.json')

try {
    if (mode === 'core') await core()
    else if (mode === 'persist') await persist()
    else if (mode === 'ego') await ego()
    else if (mode === 'ego-missing') await egoMissing()
    else if (mode === 'clis') await clis()
    else if (mode === 'workspace') await workspace()
    else if (mode === 'rex') await rex()
    else if (mode === 'chat') await chat()
    else if (mode === 'runs') await runs()
    else if (mode === 'retire') await retire()
    else throw new Error(`Unknown mode ${mode}`)
} catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error)
    writeFileSync(join(out, `${mode}.json`), JSON.stringify({ ok: false, detail }, null, 2))
    process.stderr.write(`${detail}\n`)
    process.exit(1)
}

async function core() {
    await installCodex()
    const notes = []
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    page.on('console', message => notes.push(`${message.type()}: ${message.text()}`))
    page.on('pageerror', error => notes.push(`pageerror: ${error.message}`))
    try {
        await page.goto(ui, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        notes.push(features.onboarding.enabled ? 'Native onboarding is dismissed in the BlinkyBot window before this page opens.' : features.onboarding.reason)
        await page.getByRole('button', { name: 'BlinkyBot', exact: true }).first().waitFor({ timeout: 60_000 })
        await page.screenshot({ path: join(shots, 'workspace.png') })
        const known = new Set(((await engine('/agents')).agents ?? []).map(agent => agent.id))
        await saveBot(page, { name: 'Lighthouse', persona: 'You answer as a lighthouse keeper.' })
        const lantern = await waitForNewAgent(known, 20_000)
        if (!lantern?.id) throw new Error('Lighthouse was not created on the engine.')
        known.add(lantern.id)
        await saveBot(page, { name: 'Harbor', persona: 'You answer as a harbor pilot.' })
        const harbor = await waitForNewAgent(known, 20_000)
        if (!harbor?.id) throw new Error('Harbor was not created on the engine.')
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Lighthouse"]').waitFor()
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Harbor"]').waitFor()
        await page.screenshot({ path: join(shots, 'bot-list.png') })
        await page.locator('[data-testid="bot-edit"][aria-label*="Lighthouse"]').click()
        await page.getByTestId('bot-name').fill('Lantern')
        await page.getByTestId('bot-save').click()
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Lantern"]').waitFor({ timeout: 20_000 })
        const saved = await engine(`/agents/${lantern.id}`)
        if (!JSON.stringify(saved).includes('lighthouse keeper')) throw new Error('The saved Bot does not keep the lighthouse persona.')
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Lantern"]').evaluate(element => element.click())
        const seen = []
        const boardSeen = []
        const watch = watchRuns(lantern.id, seen, () => sampleBoard(page, lantern.id, boardSeen))
        await sendChat(page, 'who are you')
        const run = await watch
        if (!seen.includes('running') || !seen.includes('done')) {
            throw new Error(`Run statuses were ${seen.join(' -> ') || 'empty'}. Last run: ${JSON.stringify(run)}`)
        }
        await waitBoard(page, lantern.id, 'idle', boardSeen)
        if (!boardSeen.includes('working') || boardSeen.at(-1) !== 'idle') {
            throw new Error(`Board statuses were ${boardSeen.join(' -> ') || 'empty'}. Expected working, then idle.`)
        }
        await page.getByText('lighthouse keeper').first().waitFor({ timeout: 20_000 })
        await page.screenshot({ path: join(shots, 'task-reply.png') })
        const messages = await engine(`/agents/${lantern.id}/sessions/${run.sessionId}/messages`)
        const stored = JSON.stringify(messages)
        if (!stored.includes(reply) || !stored.includes('lighthouse keeper') || !stored.includes('who are you')) {
            throw new Error('Lantern did not store the question and the persona reply.')
        }
        await page.goto(`${ui}/?agent=${harbor.id}`, { waitUntil: 'domcontentloaded' })
        await page.getByTestId('bot-list').waitFor({ timeout: 60_000 })
        await sendChat(page, 'who are you')
        const harborRun = await watchRuns(harbor.id, [])
        const harborSession = harborRun?.sessionId || harborRun?.session_id
        if (!harborSession) throw new Error(`Harbor did not start a run. Last: ${JSON.stringify(harborRun)}`)
        const harborMessages = await engine(`/agents/${harbor.id}/sessions/${harborSession}/messages`)
        const harborStored = JSON.stringify(harborMessages)
        if (!harborStored.includes(reply) || harborStored.includes('lighthouse keeper')) {
            throw new Error('Harbor used Lantern’s persona.')
        }
        await page.screenshot({ path: join(shots, 'harbor-reply.png') })
        writeFileSync(statePath, JSON.stringify({ agentId: lantern.id, sessionId: run.sessionId, label: 'Lantern', harborId: harbor.id }))
        writeFileSync(join(out, 'core.json'), JSON.stringify({
            ok: true,
            detail: [
                'Created Lighthouse and Harbor from bot-create, with an emoji and a persona.',
                'Renamed Lighthouse to Lantern. The list row and the saved soul both say so.',
                `Lantern’s chat ran ${seen.join(' -> ')}. Board: ${boardSeen.join(' -> ')}. The reply includes the lighthouse persona.`,
                'Harbor answered the same question without Lantern’s persona.',
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

async function saveBot(page, { name, persona }) {
    await page.getByTestId('bot-create').click()
    await page.getByTestId('bot-editor').waitFor({ timeout: 20_000 })
    await page.getByTestId('bot-name').fill(name)
    await page.getByTestId('bot-persona').fill(persona)
    await page.getByTestId('bot-avatar-emoji').first().click()
    await page.getByTestId('bot-model').click()
    const model = page.getByRole('option', { name: /GPT-5\.6 Sol/ }).first()
    await model.waitFor({ timeout: 20_000 })
    await model.click()
    await page.getByTestId('bot-save').click()
    await page.getByTestId('bot-editor').waitFor({ state: 'hidden', timeout: 20_000 })
}

async function retire() {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    try {
        await page.goto(ui, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.getByTestId('bot-list').waitFor({ timeout: 60_000 })
        await page.locator('[data-testid="bot-edit"][aria-label*="Lantern"]').click()
        await page.getByTestId('bot-delete').click()
        await page.getByTestId('bot-delete-dialog').waitFor()
        const confirm = page.getByTestId('bot-delete-confirm')
        if (await confirm.isEnabled()) throw new Error('Delete confirmed before the name was typed.')
        await page.getByTestId('bot-delete-name').fill('not-the-name')
        if (await confirm.isEnabled()) throw new Error('Delete confirmed on the wrong name.')
        await page.getByTestId('bot-delete-name').fill('Lantern')
        await confirm.click()
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Lantern"]').waitFor({ state: 'hidden', timeout: 20_000 })
        await page.locator('[data-testid="bot-list-item"][data-bot-name="Harbor"]').waitFor()
        await page.screenshot({ path: join(shots, 'bot-deleted.png') })
        const gone = await engineStatus(`/agents/${state.agentId}`)
        if (gone.status !== 404) throw new Error(`Lantern was still on the engine after delete (${gone.status}).`)
        const harbor = await engine(`/agents/${state.harborId}`)
        if (!harbor?.id) throw new Error('Harbor was removed with Lantern.')
        writeFileSync(join(out, 'retire.json'), JSON.stringify({
            ok: true,
            detail: 'Delete asked for the Bot name, refused a mismatch, then removed Lantern. Harbor is still in the list and on the engine.',
        }, null, 2))
    } catch (error) {
        await page.screenshot({ path: join(shots, 'retire-failed.png') }).catch(() => {})
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
        await page.getByRole('button', { name: 'BlinkyBot', exact: true }).first().waitFor({ timeout: 60_000 })
        const visible = page.getByText(reply).first()
        if (!(await visible.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false))) {
            const session = await engine(`/agents/${state.agentId}/sessions/${state.sessionId}`)
            await page.getByTestId('chats').click()
            await page.getByRole('button', { name: session.title || 'Untitled' }).last().click()
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

async function ego() {
    if (!app) throw new Error('BLINKY_APP is not set, so the packaged ego router cannot be loaded.')
    const routed = await drivePackagedEgo({ app, stubPath: process.env.EGO_BROWSER_PATH, stubLog })
    writeFileSync(join(out, 'ego.json'), JSON.stringify({
        ok: true,
        detail: `Routed ${routed.url} through ego-browser and read ${routed.text}. Dependency: ${process.env.BLINKY_EGO_KIND || 'stub'}.`,
    }, null, 2))
}

async function egoMissing() {
    if (!app) throw new Error('BLINKY_APP is not set, so the packaged ego router cannot be loaded.')
    const text = await driveMissingEgo({ app })
    writeFileSync(join(out, 'ego-missing.json'), JSON.stringify({
        ok: true,
        detail: `With ego-browser absent, the packaged router returns the setup message and does not open another browser.\n\n${text}`,
    }, null, 2))
}

async function clis() {
    if (!app) throw new Error('BLINKY_APP is not set, so the packaged CLI adapters cannot be loaded.')
    const lines = await drivePackagedClis({ app, bin: join(out, 'bin'), stubLog, cwd: out })
    writeFileSync(join(out, 'clis.json'), JSON.stringify({
        ok: true,
        detail: `Packaged adapters spawned stub Codex, Kimi, Grok, and Claude. Secrets stayed off argv.\n\n${lines.join('\n')}`,
    }, null, 2))
}

async function workspace() {
    const url = process.env.BLINKY_FIXTURE_URL
    const lockedUrl = process.env.BLINKY_LOCKED_URL
    const lockedPath = process.env.BLINKY_LOCKED_PATH
    if (!url || !lockedUrl || !lockedPath) throw new Error('The git fixtures were not prepared.')
    const ada = await engine('/agents', { method: 'POST', body: { config: { name: 'Fixture Ada' } } })
    const grace = await engine('/agents', { method: 'POST', body: { config: { name: 'Fixture Grace' } } })
    const github = await engine(`/agents/${ada.id}/repos`, { method: 'POST', body: { source: 'github', nameWithOwner: 'fixture/widget' } })
    const readme = readFileSync(join(github.path, 'README'), 'utf8')
    if (!readme.includes('from-origin')) throw new Error('The GitHub attach did not check out the fixture commit.')
    const adaSpace = await engine(`/agents/${ada.id}/workspace`)
    if (adaSpace.activeRepo?.path !== github.path || !String(adaSpace.reposDir).includes(`${ada.id}`)) {
        throw new Error(`GET /workspace did not name the GitHub checkout: ${JSON.stringify(adaSpace)}`)
    }
    const plain = await engine(`/agents/${grace.id}/repos`, { method: 'POST', body: { source: 'url', url } })
    if (plain.path === github.path) throw new Error('Two agents share one checkout.')
    writeFileSync(join(plain.path, 'only-grace.txt'), 'grace')
    if (existsSync(join(github.path, 'only-grace.txt'))) throw new Error("Grace's file showed up in Ada's checkout.")
    chmodSync(lockedPath, 0o000)
    try {
        const denied = await engineStatus(`/agents/${ada.id}/repos/test`, { method: 'POST', body: { url: lockedUrl } })
        const message = String(denied.body?.error || '')
        if (denied.status !== 403 || !message.includes('does not store')) {
            throw new Error(`A private URL did not return the credential-helper 403: ${denied.status} ${message}`)
        }
        const listed = await engine(`/agents/${ada.id}/repos`)
        if (listed.repos.some(repo => String(repo.remote).includes('locked'))) throw new Error('The refused URL was recorded as a checkout.')
        if (existsSync(join(adaSpace.reposDir, 'locked'))) throw new Error('The refused URL left a checkout directory.')
    } finally {
        chmodSync(lockedPath, 0o700)
    }
    const graceSpace = await engine(`/agents/${grace.id}/workspace`)
    await engine(`/agents/${grace.id}`, { method: 'DELETE' })
    if (existsSync(graceSpace.workspacePath)) throw new Error('Deleting the agent left its workspace on disk.')
    if (!existsSync(github.path)) throw new Error("Deleting Grace removed Ada's checkout.")
    writeFileSync(join(out, 'workspace.json'), JSON.stringify({
        ok: true,
        detail: [
            `Stub gh attached fixture/widget for ${ada.id} at ${github.path}.`,
            `The same https URL cloned into a separate tree for ${grace.id}. A file written there is absent from the other tree.`,
            'POST /repos/test on a repository without permission returned 403 and left no checkout.',
            `DELETE /agents/${grace.id} removed ${graceSpace.workspacePath}.`,
        ].join('\n'),
    }, null, 2))
}

async function rex() {
    const logPath = process.env.BLINKY_REX_LOG
    if (!logPath) throw new Error('BLINKY_REX_LOG is not set.')
    const log = readFileSync(logPath, 'utf8')
    const calls = log.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const created = calls.find(call => call.args?.[0] === 'session' && call.args?.[1] === 'new')
    const launched = calls.find(call => call.args?.[0] === 'run')
    if (!created || !String(created.args[2] || '').startsWith('blinky-')) {
        throw new Error(`Rex did not create a blinky-<handle> session. Log: ${log}`)
    }
    if (!launched) throw new Error('Rex did not receive rex run.')
    const summary = assertRexLaunch(launched.args.join(' '))
    if (calls.some(call => call.server)) throw new Error('A Rex invocation had REX_SERVER set.')
    writeFileSync(join(out, 'rex.json'), JSON.stringify({
        ok: true,
        detail: `${summary} Session ${created.args[2]} was created with rex session new. REX_SERVER was unset, and the argv has no listen, tailscale, or anonymous server flag.`,
    }, null, 2))
}

async function chat() {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    try {
        await page.goto(`${ui}/?agent=${state.agentId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await openThread(page, state)
        await clickPicker(page)
        await page.getByText('Kimi for Coding', { exact: true }).waitFor({ timeout: 15_000 })
        await page.getByText('Grok 4.7', { exact: true }).waitFor({ timeout: 5_000 })
        await page.screenshot({ path: join(shots, 'model-picker.png') })
        await page.getByText('Kimi for Coding', { exact: true }).click()
        await sendChat(page, 'hello kimi')
        await page.getByText(/stub-ok:kimi:|BLINKY_E2E_REPLY/).first().waitFor({ timeout: 30_000 })
        await page.screenshot({ path: join(shots, 'kimi-reply.png') })
        await clickPicker(page)
        await page.getByText('Grok 4.7', { exact: true }).click()
        await sendChat(page, 'hello grok')
        await page.getByText(/Grok CLI is not logged in/).first().waitFor({ timeout: 30_000 })
        await page.screenshot({ path: join(shots, 'grok-signed-out.png') })
        const kimiPath = process.env.RERUN_KIMI_PATH
        const hidden = `${kimiPath}.off`
        await clickPicker(page)
        await page.getByText('Kimi for Coding', { exact: true }).click()
        renameSync(kimiPath, hidden)
        try {
            await sendChat(page, 'hello missing kimi')
            await page.getByText(/Kimi CLI is not installed/).first().waitFor({ timeout: 30_000 })
            await page.screenshot({ path: join(shots, 'kimi-missing.png') })
        } finally {
            renameSync(hidden, kimiPath)
        }
        writeControl({ fail: 'quota', delayMs: 0 })
        await sendChat(page, 'hello quota')
        await page.getByText(/quota exceeded|Usage limit reached|usage limit/).first().waitFor({ timeout: 30_000 })
        await page.screenshot({ path: join(shots, 'quota-notice.png') })
        writeControl({})
        writeFileSync(join(out, 'chat.json'), JSON.stringify({
            ok: true,
            detail: 'The model picker lists stub Kimi and Grok. A Kimi turn streamed a reply. Grok, with no key, showed the login notice. Removing the Kimi binary showed the install notice. A quota stderr showed the quota notice.',
        }, null, 2))
    } catch (error) {
        await page.screenshot({ path: join(shots, 'chat-failed.png') }).catch(() => {})
        throw error
    } finally {
        writeControl({})
        await context.close()
        await browser.close()
    }
}

async function runs() {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(out, 'video'), size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    try {
        await page.goto(`${ui}/?agent=${state.agentId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await openThread(page, state)
        writeControl({ delayMs: 8000 })
        await sendChat(page, 'please keep going')
        const stop = page.getByTestId('stop-run')
        await stop.waitFor({ timeout: 15_000 })
        await stop.click()
        await waitBoard(page, state.agentId, 'idle', [])
        await page.screenshot({ path: join(shots, 'stopped-idle.png') })
        writeControl({ fail: 'error', delayMs: 0 })
        await sendChat(page, 'please fail')
        await waitBoard(page, state.agentId, 'error', [])
        await page.screenshot({ path: join(shots, 'run-error.png') })
        writeControl({})
        writeFileSync(join(out, 'runs.json'), JSON.stringify({
            ok: true,
            detail: 'Stopping a run returned the board to idle. A failed stub run left the tile on error.',
        }, null, 2))
    } catch (error) {
        await page.screenshot({ path: join(shots, 'runs-failed.png') }).catch(() => {})
        throw error
    } finally {
        writeControl({})
        await context.close()
        await browser.close()
    }
}

async function openThread(page, state) {
    await page.getByRole('button', { name: 'BlinkyBot', exact: true }).first().waitFor({ timeout: 60_000 })
    if (!(await page.getByText(reply).first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false))) {
        const session = await engine(`/agents/${state.agentId}/sessions/${state.sessionId}`)
        await page.getByTestId('chats').click()
        await page.getByRole('button', { name: session.title || 'Untitled' }).last().click()
        await page.getByText(reply).first().waitFor({ timeout: 30_000 })
    }
}

async function sendChat(page, text) {
    const box = page.getByRole('main').getByTestId('composer').last()
    await box.waitFor({ state: 'visible', timeout: 20_000 })
    await box.click({ force: true })
    await box.fill(text)
    await box.press('Enter')
}

function writeControl(value) {
    const file = process.env.BLINKY_STUB_CONTROL
    if (!file) throw new Error('BLINKY_STUB_CONTROL is not set.')
    writeFileSync(file, JSON.stringify(value))
}

async function installCodex() {
    const expires = String(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await engine('/connections', {
        method: 'POST',
        body: {
            name: 'E2E Codex',
            provider: 'codex',
            models: ['gpt-5.6-sol'],
            keys: { CODEX_OAUTH_TOKEN: 'e2e-access-token', CODEX_OAUTH_EXPIRES_AT: expires },
        },
    })
}

async function placeOnBoard(page, before) {
    const board = page.getByTestId('coworker-board')
    await board.waitFor({ timeout: 20_000 })
    const box = await board.boundingBox()
    if (!box) throw new Error('The coworker board has no box to click.')
    const spots = [
        [0.5, 0.42],
        [0.42, 0.38],
        [0.58, 0.48],
        [0.36, 0.55],
        [0.64, 0.36],
    ]
    for (const [x, y] of spots) {
        await board.click({ position: { x: box.width * x, y: box.height * y } })
        const created = await waitForNewAgent(before, 4_000)
        if (created) return created
    }
    throw new Error('Placing the coworker on the board did not create an engine agent.')
}

async function waitForNewAgent(before, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const body = await engine('/agents').catch(() => ({ agents: [] }))
        const created = (body.agents ?? []).find(agent => !before.has(agent.id))
        if (created) return created
        await sleep(250)
    }
    return null
}

async function watchRuns(agentId, seen, sample) {
    const deadline = Date.now() + 90_000
    let last = null
    while (Date.now() < deadline) {
        if (sample) await sample().catch(() => {})
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

async function sampleBoard(page, agentId, seen) {
    const status = await boardStatus(page, agentId)
    if (status && seen.at(-1) !== status) seen.push(status)
}

async function waitBoard(page, agentId, wanted, seen) {
    const deadline = Date.now() + 20_000
    let last = null
    while (Date.now() < deadline) {
        last = await boardStatus(page, agentId)
        if (last && seen.at(-1) !== last) seen.push(last)
        if (last === wanted) return last
        await sleep(500)
    }
    throw new Error(`Board status stayed ${last || 'empty'} instead of ${wanted}. Saw ${seen.join(' -> ') || 'nothing'}.`)
}

async function boardStatus(page, agentId) {
    const body = await page.evaluate(async () => {
        const response = await fetch('/api/local-auth/board', { cache: 'no-store' })
        if (!response.ok) return { error: response.status }
        return response.json()
    })
    if (body?.error) throw new Error(`Board API returned ${body.error}.`)
    return body?.agents?.find(agent => agent.id === agentId)?.status ?? null
}

async function engine(path, options = {}) {
    const result = await engineStatus(path, options)
    if (result.status < 200 || result.status >= 300) {
        throw new Error(`${options.method || 'GET'} ${path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 500)}`)
    }
    return result.body
}

async function engineStatus(path, options = {}) {
    const response = await fetch(`${engineUrl}${path}`, {
        method: options.method || 'GET',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    let body = null
    if (text) {
        try {
            body = JSON.parse(text)
        } catch {
            body = { error: text }
        }
    }
    return { status: response.status, body }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
