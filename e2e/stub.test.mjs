import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const stub = fileURLToPath(new URL('./stubs/agent-cli.mjs', import.meta.url))
const ego = fileURLToPath(new URL('./stubs/ego-browser', import.meta.url))

test('exec mode prints parseable output for each CLI name', async () => {
    for (const id of ['codex', 'kimi', 'grok', 'claude']) {
        const log = join(mkdtempSync(join(tmpdir(), 'stub-')), 'log')
        const { stdout } = await run([stub, '-p', 'ping'], { BLINKY_STUB_ID: id, BLINKY_STUB_LOG: log })
        const lines = stdout.trim().split('\n').map(line => JSON.parse(line))
        const blob = JSON.stringify(lines)
        assert.match(blob, /stub-ok:.*ping/)
        assert.match(blob, new RegExp(`stub-${id}-session`))
        const recorded = JSON.parse(readFileSync(log, 'utf8').trim())
        assert.equal(recorded.mode, 'exec')
        assert.equal(recorded.env.CODEX_API_KEY, '[set]')
    }
})

test('app-server answers a turn with the fixture sentence', async () => {
    const child = spawn(process.execPath, [stub, 'app-server', '--listen', 'stdio://'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, BLINKY_STUB_ID: 'codex', BLINKY_STUB_DELAY_MS: '30' },
    })
    const notes = []
    const pending = new Map()
    let nextId = 0
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', line => {
        const message = JSON.parse(line)
        if (message.id !== undefined && Object.prototype.hasOwnProperty.call(message, 'result')) pending.get(message.id)?.(message.result)
        else notes.push(message)
    })
    const request = (method, params) =>
        new Promise(resolve => {
            const id = ++nextId
            pending.set(id, resolve)
            child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
        })
    const init = await request('initialize', { clientInfo: { name: 'e2e', version: '0' } })
    assert.match(init.userAgent, /0\.160\.0/)
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
    const thread = await request('thread/start', { model: 'gpt-5.6-sol' })
    assert.equal(thread.thread.id, 'thr-stub')
    const turn = await request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'E2E fixture ping' }] })
    assert.equal(turn.turn.status, 'inProgress')
    const completed = await waitFor(() => notes.find(note => note.method === 'turn/completed'))
    assert.equal(completed.params.turn.items[0].text, 'BLINKY_E2E_REPLY')
    child.stdin.end()
    child.kill()
})

test('ego-browser nodejs prints the page payload the engine parses', async () => {
    const log = join(mkdtempSync(join(tmpdir(), 'ego-')), 'log')
    const child = spawn(process.execPath, [ego, 'nodejs'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, BLINKY_STUB_LOG: log, BLINKY_EGO_URL: 'https://example.com/e2e' },
    })
    let stdout = ''
    child.stdout.on('data', chunk => {
        stdout += chunk
    })
    child.stdin.end('script')
    const code = await new Promise(resolve => child.on('close', resolve))
    assert.equal(code, 0)
    assert.match(stdout, /^BLINKY_EGO_JSON /)
    const page = JSON.parse(stdout.slice('BLINKY_EGO_JSON '.length))
    assert.equal(page.text, 'BLINKY_EGO_PAGE')
    assert.equal(page.finalUrl, 'https://example.com/e2e')
    const recorded = JSON.parse(readFileSync(log, 'utf8').trim())
    assert.deepEqual(recorded.argv, ['nodejs'])
    assert.equal(recorded.url, 'https://example.com/e2e')
})

function run(args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { env: { ...process.env, CODEX_API_KEY: 'secret-value', ...env } })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', chunk => {
            stdout += chunk
        })
        child.stderr.on('data', chunk => {
            stderr += chunk
        })
        child.on('error', reject)
        child.on('close', code => {
            if (code !== 0) reject(new Error(stderr || `exit ${code}`))
            else resolve({ stdout })
        })
    })
}

function waitFor(read) {
    return new Promise((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
            const value = read()
            if (value) {
                clearInterval(timer)
                resolve(value)
            } else if (Date.now() - started > 3000) {
                clearInterval(timer)
                reject(new Error('timed out waiting for the stub'))
            }
        }, 20)
    })
}
