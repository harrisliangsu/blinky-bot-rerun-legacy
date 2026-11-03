#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Starts the packaged Compose server and fails if it cannot serve /api/version.
//
//   node Scripts/smoke-ui.mjs <runtime/ui> <node-binary>

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const uiRoot = process.argv[2]
const nodeBin = process.argv[3]
if (!uiRoot || !nodeBin) {
    console.error('Usage: node Scripts/smoke-ui.mjs <runtime/ui> <node-binary>')
    process.exit(1)
}

const servers = ['server.js', 'apps/ui/server.js']
const serverRel = servers.find((entry) => existsSync(join(uiRoot, entry)))
if (!serverRel) {
    console.error(`No standalone server.js under ${uiRoot}`)
    process.exit(1)
}

const port = await freePort()
const home = mkdtempSync(join(tmpdir(), 'blinky-ui-smoke-'))
const serverAbs = join(uiRoot, serverRel)
const child = spawn(nodeBin, [serverAbs], {
    cwd: dirname(serverAbs),
    env: {
        ...process.env,
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
        BLINKY_LOCAL_AUTH: '1',
        BLINKY_LOCAL_AUTH_DB: join(home, 'local-auth.sqlite'),
        NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        SUPABASE_SECRET_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let exited = null
child.on('exit', (code) => {
    exited = code ?? 1
})
const take = (chunk) => {
    output += chunk.toString()
    if (output.length > 200_000) output = output.slice(-100_000)
}
child.stdout.on('data', take)
child.stderr.on('data', take)

const deadline = Date.now() + 90_000
let ready = false
let failure = ''
try {
    while (Date.now() < deadline) {
        if (exited !== null) {
            failure = `Compose exited ${exited} before it listened`
            break
        }
        if (output.includes('MODULE_NOT_FOUND') || output.includes('Cannot find module')) {
            failure = 'Compose failed to load a module'
            break
        }
        if (await health(port)) {
            ready = true
            break
        }
        await sleep(250)
    }
    if (!ready && !failure) failure = `Compose did not answer /api/version on 127.0.0.1:${port} within 90s`
} finally {
    child.kill('SIGTERM')
    await sleep(500)
    if (child.exitCode === null) child.kill('SIGKILL')
    rmSync(home, { recursive: true, force: true })
}

if (!ready) {
    console.error(failure)
    console.error(output.trim())
    process.exit(1)
}
console.log(`Compose answered /api/version on 127.0.0.1:${port}`)

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const chosen = typeof address === 'object' && address ? address.port : 0
            server.close(() => resolve(chosen))
        })
    })
}

function health(chosen) {
    return new Promise((resolve) => {
        fetch(`http://127.0.0.1:${chosen}/api/version`, { signal: AbortSignal.timeout(2000) })
            .then((response) => resolve(response.status === 200))
            .catch(() => resolve(false))
    })
}
