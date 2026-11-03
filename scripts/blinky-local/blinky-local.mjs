#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    READY_TIMEOUT_MS,
    STOP_GRACE_MS,
    buildPlan,
    decideStart,
    resolvePorts,
    isReady,
    layoutPaths,
    missingBinaries,
    pidAlive,
    readApiKey,
    readOrCreateApiKey,
    readPid,
    redactPlan,
    repoRootFrom,
    composeBuildEnv,
    spawnEnv,
    supportDir,
} from './layout.mjs'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = repoRootFrom(moduleDir)

const HELP = `BlinkyBot local runtime (no Docker)

  node scripts/blinky-local/blinky-local.mjs build
  node scripts/blinky-local/blinky-local.mjs start
  node scripts/blinky-local/blinky-local.mjs stop
  node scripts/blinky-local/blinky-local.mjs status
  node scripts/blinky-local/blinky-local.mjs dry-run [--json]

Starts the built engine (node dist/cli/bin.js run on 127.0.0.1:3001) and
Compose UI (next start on 127.0.0.1:3000) with BLINKY_LOCAL_AUTH=1.
macOS data: ~/Library/Application Support/BlinkyBot
other systems: ~/.blinkybot
Override the directory with BLINKY_SUPPORT_DIR.
Ports default to 3000 and 3001 (BLINKY_UI_PORT, BLINKY_ENGINE_PORT).
`

function home() {
    return supportDir()
}

function planFor(apiKey) {
    let ports
    try {
        ports = resolvePorts()
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
    return buildPlan({ repoRoot, home: home(), apiKey, uiPort: ports.uiPort, enginePort: ports.enginePort })
}

function printPlan(plan) {
    const shown = redactPlan(plan)
    console.log(`BlinkyBot local runtime`)
    console.log(`  home:   ${shown.home}`)
    console.log(`  engine: ${shown.engine.command.join(' ')}`)
    console.log(`          cwd ${shown.engine.cwd}`)
    console.log(`          ${shown.engine.url}`)
    console.log(`  ui:     ${shown.ui.command.join(' ')}`)
    console.log(`          cwd ${shown.ui.cwd}`)
    console.log(`          ${shown.ui.url}`)
    console.log(`  auth:   BLINKY_LOCAL_AUTH=1`)
    console.log(`  data:   ${shown.engine.env.RERUN_DATA_DIR}`)
}

async function portFree(port) {
    return new Promise((resolve) => {
        const server = createServer()
        server.once('error', () => resolve(false))
        server.listen({ host: '127.0.0.1', port }, () => {
            server.close(() => resolve(true))
        })
    })
}

function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal)
        return true
    } catch (error) {
        if (error && error.code === 'ESRCH') return false
        try {
            process.kill(pid, signal)
            return true
        } catch {
            return false
        }
    }
}

async function waitDead(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (!pidAlive(pid)) return true
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return !pidAlive(pid)
}

function spawnService(service, paths) {
    mkdirSync(paths.logDir, { recursive: true })
    mkdirSync(paths.runDir, { recursive: true })
    writeFileSync(service.log, `\n--- ${new Date().toISOString()} start ---\n`, { flag: 'a' })
    const logFd = openSync(service.log, 'a')
    const child = spawn(process.execPath, service.command.slice(1), {
        cwd: service.cwd,
        env: spawnEnv(service.env),
        detached: true,
        stdio: ['ignore', logFd, logFd],
    })
    closeSync(logFd)
    writeFileSync(service.pidFile, `${child.pid}\n`)
    child.unref()
    return child.pid
}

async function describeService(name, service) {
    const pid = readPid(service.pidFile)
    const alive = pidAlive(pid)
    const healthy = alive ? await isReady(service.healthUrl, name) : false
    const free = alive ? true : await portFree(service.port)
    return { name, pid, alive, healthy, free, action: decideStart({ pidAlive: alive, healthy, portFree: free }) }
}

function serviceViews(plan) {
    return {
        engine: {
            ...plan.engine,
            pidFile: plan.paths.enginePid,
            log: plan.paths.engineLog,
        },
        ui: {
            ...plan.ui,
            pidFile: plan.paths.uiPid,
            log: plan.paths.uiLog,
        },
    }
}

async function pollReady(services) {
    const deadline = Date.now() + READY_TIMEOUT_MS
    const pending = new Set(services.map((service) => service.name))
    while (pending.size > 0 && Date.now() < deadline) {
        for (const service of services) {
            if (!pending.has(service.name)) continue
            if (await isReady(service.healthUrl, service.name)) pending.delete(service.name)
        }
        if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return [...pending]
}

async function start() {
    const missing = missingBinaries(repoRoot)
    if (missing.length) {
        console.error(`Missing build output:\n${missing.map((item) => `  ${item}`).join('\n')}`)
        console.error(`\nBuild first:\n  node scripts/blinky-local/blinky-local.mjs build`)
        process.exit(1)
    }
    const paths = layoutPaths(home())
    mkdirSync(paths.engineData, { recursive: true })
    mkdirSync(paths.runDir, { recursive: true })
    mkdirSync(paths.logDir, { recursive: true })
    const { key } = readOrCreateApiKey(paths.apiKey)
    const plan = planFor(key)
    const views = serviceViews(plan)
    const engineState = await describeService('engine', views.engine)
    const uiState = await describeService('ui', views.ui)
    const spawned = []

    for (const state of [engineState, uiState]) {
        const service = views[state.name]
        if (state.action === 'blocked') {
            console.error(`${state.name} port ${service.port} is in use by another process. BlinkyBot will not stop it.`)
            continue
        }
        if (state.action === 'spawn') {
            const pid = spawnService(service, paths)
            spawned.push({ ...service, name: state.name, pid })
            console.log(`started ${state.name} pid ${pid}`)
            continue
        }
        console.log(`${state.action === 'adopt' ? 'adopting' : 'waiting for'} ${state.name} pid ${state.pid}`)
        spawned.push({ ...service, name: state.name, pid: state.pid })
    }

    if (spawned.length === 0) process.exit(1)
    const notReady = await pollReady(spawned)
    printPlan(plan)
    if (notReady.length || engineState.action === 'blocked' || uiState.action === 'blocked') {
        if (notReady.length) console.error(`Not ready after ${READY_TIMEOUT_MS / 1000}s: ${notReady.join(', ')}. Logs: ${paths.logDir}`)
        process.exit(1)
    }
    console.log(`Open ${plan.ui.url}`)
}

async function stopOne(pidFile) {
    const pid = readPid(pidFile)
    if (!pid || !pidAlive(pid)) {
        rmSync(pidFile, { force: true })
        return
    }
    signalGroup(pid, 'SIGTERM')
    const stopped = await waitDead(pid, STOP_GRACE_MS)
    if (!stopped) signalGroup(pid, 'SIGKILL')
    await waitDead(pid, 1_000)
    rmSync(pidFile, { force: true })
}

async function stop() {
    const paths = layoutPaths(home())
    await stopOne(paths.uiPid)
    await stopOne(paths.enginePid)
    console.log('stopped')
}

async function status() {
    const paths = layoutPaths(home())
    const plan = planFor(readApiKey(paths.apiKey))
    const views = serviceViews(plan)
    printPlan(plan)
    let down = false
    for (const name of ['engine', 'ui']) {
        const service = views[name]
        const pid = readPid(service.pidFile)
        const alive = pidAlive(pid)
        const healthy = alive ? await isReady(service.healthUrl, name) : false
        if (!alive || !healthy) down = true
        const state = !alive ? 'stopped' : healthy ? 'ready' : 'starting'
        console.log(`  ${name}: ${state}${alive ? ` pid ${pid}` : ''}`)
    }
    process.exit(down ? 1 : 0)
}

function dryRun() {
    const plan = planFor(readApiKey(layoutPaths(home()).apiKey))
    const shown = redactPlan(plan)
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({ ...shown, missing: missingBinaries(repoRoot) }, null, 2))
        return
    }
    printPlan(shown)
    const missing = missingBinaries(repoRoot)
    if (missing.length) console.log(`  missing: ${missing.join(', ')}`)
}

function build() {
    const steps = [
        ['pnpm', ['--filter', '@rerun/contracts', 'build'], process.env],
        ['pnpm', ['--filter', 'rerun-engine', 'build'], process.env],
        ['pnpm', ['--filter', 'rerun', 'build'], composeBuildEnv()],
    ]
    for (const [command, args, env] of steps) {
        const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', env })
        if (result.status !== 0) process.exit(result.status ?? 1)
    }
}

const command = process.argv[2] ?? 'help'
if (command === 'build') build()
else if (command === 'start') await start()
else if (command === 'stop') await stop()
else if (command === 'status') await status()
else if (command === 'dry-run') dryRun()
else {
    process.stdout.write(HELP)
    if (command !== 'help' && command !== '--help' && command !== '-h') process.exit(1)
}
