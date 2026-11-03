// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { sep } from 'node:path'
import { runAgentProcess } from './launch.js'
import { isDirectCliProbe, readRexWatch, rexLabel } from './protocol.js'

function invokedDirectly(): boolean {
    const entry = process.argv[1]
    if (!entry) return false
    const name = entry.split(sep).pop()
    return name === 'outer.js' || name === 'outer.ts' || name === 'outer.mjs'
}

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const real = process.env.BLINKY_REX_REAL
    if (!real) {
        process.stderr.write('BlinkyBot could not find the agent command.\n')
        process.exit(127)
    }
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
    const watch = isDirectCliProbe(args) ? null : readRexWatch(process.env)
    try {
        const result = await runAgentProcess({
            command: real,
            args,
            cwd: process.cwd(),
            env: process.env,
            label: rexLabel(process.env.BLINKY_REX_LABEL || real),
            handle: process.env.BLINKY_REX_HANDLE || process.env.BLINKY_REX_LABEL,
            agentId: process.env.BLINKY_REX_AGENT_ID,
            signal: controller.signal,
            rex: watch,
            warningFile: process.env.BLINKY_REX_WARNING_FILE,
            statePath: process.env.BLINKY_REX_STATE,
            stdio: 'proxy',
        })
        process.exit(result.exitCode ?? 1)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`${message}\n`)
        process.exit(1)
    }
}

if (invokedDirectly()) void main()
