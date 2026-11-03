import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = mkdtempSync(resolve(tmpdir(), 'rerun-paths-'))
process.env.RERUN_DATA_DIR = root

const { describe, expect, it } = await import('vitest')
const paths = await import('./paths.js')
const { HttpError } = await import('../lib/errors.js')

const segmentHelpers: Array<[string, (value: string) => string]> = [
    ['agentDir', value => paths.agentDir(value)],
    ['connectionDir', value => paths.connectionDir(value)],
    ['skillDir', value => paths.skillDir('agent', value)],
    ['scheduleFile', value => paths.scheduleFile('agent', value)],
    ['triggerFile', value => paths.triggerFile('agent', value)],
    ['mcpTokenPath', value => paths.mcpTokenPath('agent', value)],
    ['mcpPendingPath', value => paths.mcpPendingPath('agent', value)],
]

describe('pathSegment', () => {
    it.each(['', '.', '..', '../other', 'a/b', 'a\\b', 'nul\0byte'])('refuses %j with a 400', value => {
        expect(() => paths.pathSegment(value, 'slug')).toThrow(expect.objectContaining({ name: 'HttpError', status: 400, message: expect.stringMatching(/^Invalid slug/) }))
    })

    it.each(['daily', 'my.skill', '..notes', 'v1..2', 'with space'])('keeps %j as is', value => {
        expect(paths.pathSegment(value, 'slug')).toBe(value)
    })
})

describe.each(segmentHelpers)('%s', (_name, helper) => {
    it('stays inside the data dir for a plain segment', () => {
        expect(helper('plain').startsWith(root)).toBe(true)
    })

    it.each(['..', '../../other/SOUL', 'nested/name'])('refuses %j', value => {
        expect(() => helper(value)).toThrow(HttpError)
    })
})

describe('layout', () => {
    it('keeps the shared database beside the shared folder, not inside it', () => {
        expect(paths.sharedDbPath().startsWith(`${paths.sharedDir()}/`)).toBe(false)
        expect(paths.sharedDbDir()).toBe(resolve(root, 'shared-db'))
    })

    it('nests every per-agent path under the agent folder', () => {
        const dir = paths.agentDir('a1')
        for (const path of [paths.soulPath('a1'), paths.configPath('a1'), paths.installPath('a1'), paths.agentEnvPath('a1'), paths.workspaceDir('a1'), paths.reposDir('a1'), paths.reposRegistryPath('a1'), paths.systemDbPath('a1'), paths.skillsDir('a1'), paths.schedulesDir('a1'), paths.triggersDir('a1'), paths.mcpDir('a1')]) {
            expect(path.startsWith(`${dir}/`)).toBe(true)
        }
    })

    it('names schedule, trigger and MCP files after their segment', () => {
        expect(paths.scheduleFile('a1', 'daily')).toBe(resolve(paths.schedulesDir('a1'), 'daily.md'))
        expect(paths.triggerFile('a1', 'inbound')).toBe(resolve(paths.triggersDir('a1'), 'inbound.md'))
        expect(paths.mcpTokenPath('a1', 'linear')).toBe(resolve(paths.mcpDir('a1'), 'linear.json'))
        expect(paths.mcpPendingPath('a1', 'linear')).toBe(resolve(paths.mcpDir('a1'), 'linear.pending.json'))
    })

    it('keeps every connection file under its connection folder', () => {
        const dir = paths.connectionDir('c1')
        for (const path of [paths.connectionConfigPath('c1'), paths.connectionEnvPath('c1'), paths.codexHomeDir('c1'), paths.codexAuthPath('c1')]) {
            expect(path.startsWith(`${dir}/`)).toBe(true)
        }
        expect(paths.boxDefaultPath()).toBe(resolve(paths.connectionsDir(), 'default.json'))
    })
})
