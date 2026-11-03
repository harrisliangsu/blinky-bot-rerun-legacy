import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { egoBrowserSystem } from '../../browser/ego-browser.js'
import { cliInvocation, CliAdapterError, enabledCliRuntimes, listCliAdapters, runLocalCli, type CliRunRequest, type CliRuntimeId } from './index.js'

const stubCli = join(dirname(fileURLToPath(import.meta.url)), '../../../../../e2e/stubs/agent-cli.mjs')

const cwd = mkdtempSync(join(tmpdir(), 'cli-adapters-'))
const base: CliRunRequest = { prompt: 'Say hi', cwd }

describe('listCliAdapters', () => {
    it('lists Codex, Kimi, Grok, and Claude, with only the existing Foreman CLIs marked wired', () => {
        expect(listCliAdapters()).toEqual([
            { id: 'codex', binaryName: 'codex', pathEnv: 'RERUN_CODEX_PATH', homeEnv: 'CODEX_HOME', maturity: 'wired' },
            { id: 'kimi', binaryName: 'kimi', pathEnv: 'RERUN_KIMI_PATH', homeEnv: 'KIMI_CODE_HOME', maturity: 'spawn-ready' },
            { id: 'grok', binaryName: 'grok', pathEnv: 'RERUN_GROK_PATH', homeEnv: 'GROK_HOME', maturity: 'spawn-ready' },
            { id: 'claude', binaryName: 'claude', pathEnv: 'RERUN_CLAUDE_PATH', homeEnv: 'CLAUDE_CONFIG_DIR', maturity: 'wired' },
        ])
    })
})

describe('enabledCliRuntimes', () => {
    it('reads a comma-separated list and ignores blanks and unknown names', () => {
        expect([...enabledCliRuntimes({ RERUN_CLI_ADAPTERS: ' codex , kimi , nope , claude , codex ' })]).toEqual(['codex', 'kimi', 'claude'])
        expect(enabledCliRuntimes({ RERUN_CLI_ADAPTERS: '' }).size).toBe(0)
        expect(enabledCliRuntimes({}).size).toBe(0)
    })

    it('reads the process environment when none is passed', () => {
        const previous = process.env.RERUN_CLI_ADAPTERS
        process.env.RERUN_CLI_ADAPTERS = 'grok'
        try {
            expect([...enabledCliRuntimes()]).toEqual(['grok'])
        } finally {
            if (previous === undefined) delete process.env.RERUN_CLI_ADAPTERS
            else process.env.RERUN_CLI_ADAPTERS = previous
        }
    })
})

describe('cliInvocation', () => {
    it('builds a codex exec command, and resumes with exec resume', () => {
        const named = cliInvocation('codex', { ...base, model: 'gpt-5.6-sol', system: 'Be brief', session: { kind: 'resume', id: 'thread-1' }, home: '/tmp/codex-home', env: { CODEX_API_KEY: 'secret' } }, { RERUN_CODEX_PATH: '/opt/bin/codex' })
        expect(named).toMatchObject({ id: 'codex', command: '/opt/bin/codex', maturity: 'wired', systemDelivery: 'flag', cwd })
        expect(named.args).toEqual(['exec', 'resume', 'thread-1', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-c', 'approval_policy=never', '-m', 'gpt-5.6-sol', '-c', `instructions=${egoBrowserSystem('Be brief')}`, '--', 'Say hi'])
        expect(named.env).toMatchObject({ CODEX_HOME: '/tmp/codex-home', CODEX_API_KEY: 'secret' })
        expect(named.args.join(' ')).not.toContain('secret')

        const continued = cliInvocation('codex', { ...base, session: { kind: 'continue' } }, {})
        expect(continued.args.slice(0, 3)).toEqual(['exec', 'resume', '--last'])

        const fresh = cliInvocation('codex', base, {})
        expect(fresh.command).toBe('codex')
        expect(fresh.args).toEqual(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-c', 'approval_policy=never', '-c', `instructions=${egoBrowserSystem(undefined)}`, '--', 'Say hi'])
        expect(fresh.systemDelivery).toBe('flag')
        expect(fresh.env.CODEX_HOME).toBeUndefined()

        const script = cliInvocation('codex', base, { RERUN_CODEX_PATH: '/opt/codex.js' })
        expect(script.command).toBe('node')
        expect(script.args.slice(0, 2)).toEqual(['/opt/codex.js', 'exec'])
    })

    it('builds a kimi print command and prepends the system text', () => {
        const named = cliInvocation('kimi', { ...base, prompt: 'Do it', model: 'kimi-code/kimi-for-coding', system: 'Rules', session: { kind: 'resume', id: '01HZ' }, home: '/tmp/kimi-home', env: { KIMI_API_KEY: 'secret' } }, { RERUN_KIMI_PATH: '/opt/bin/kimi' })
        expect(named).toMatchObject({ command: '/opt/bin/kimi', maturity: 'spawn-ready', systemDelivery: 'prepended' })
        expect(named.args).toEqual(['--session', '01HZ', '-m', 'kimi-code/kimi-for-coding', '-p', `${egoBrowserSystem('Rules')}\n\nDo it`, '--output-format', 'stream-json'])
        expect(named.env).toMatchObject({ KIMI_CODE_HOME: '/tmp/kimi-home', KIMI_API_KEY: 'secret' })
        expect(named.args.join(' ')).not.toContain('secret')
        expect(named.args).not.toContain('--auto')

        const continued = cliInvocation('kimi', { ...base, session: { kind: 'continue' } }, { RERUN_KIMI_PATH: '' })
        expect(continued.command).toBe('kimi')
        expect(continued.args.slice(0, 1)).toEqual(['--continue'])

        const fresh = cliInvocation('kimi', base, {})
        expect(fresh.args).toEqual(['-p', `${egoBrowserSystem(undefined)}\n\nSay hi`, '--output-format', 'stream-json'])
        expect(fresh.systemDelivery).toBe('prepended')
    })

    it('builds a grok headless command and does not mint a session id', () => {
        const named = cliInvocation('grok', { ...base, model: 'grok-4.7', system: 'Be brief', session: { kind: 'resume', id: 'sess-9' }, home: '/tmp/grok-home', env: { XAI_API_KEY: 'secret' } }, { RERUN_GROK_PATH: '/opt/bin/grok' })
        expect(named).toMatchObject({ command: '/opt/bin/grok', maturity: 'spawn-ready', systemDelivery: 'flag' })
        expect(named.args).toEqual(['--no-auto-update', '--always-approve', '--output-format', 'json', '--cwd', cwd, '-m', 'grok-4.7', '--system-prompt-override', egoBrowserSystem('Be brief'), '--resume', 'sess-9', '-p', 'Say hi'])
        expect(named.args).not.toContain('--session-id')
        expect(named.env).toMatchObject({ GROK_HOME: '/tmp/grok-home', XAI_API_KEY: 'secret' })
        expect(named.args.join(' ')).not.toContain('secret')

        const continued = cliInvocation('grok', { ...base, session: { kind: 'continue' } }, {})
        expect(continued.command).toBe('grok')
        expect(continued.args).toContain('--continue')
        expect(continued.args).not.toContain('--resume')

        const streamed = cliInvocation('grok', { ...base, stream: true }, { RERUN_GROK_PATH: '/opt/bin/grok' })
        expect(streamed.args).toContain('streaming-json')
        expect(streamed.args).not.toContain('json')

        const fresh = cliInvocation('grok', base, {})
        expect(fresh.systemDelivery).toBe('flag')
        expect(fresh.args).toContain(egoBrowserSystem(undefined))
        expect(fresh.args).not.toContain('-m')
        expect(fresh.env.GROK_HOME).toBeUndefined()
    })

    it('builds a claude print command and drops an API key when a subscription token is set', () => {
        const named = cliInvocation(
            'claude',
            { ...base, model: 'claude-sonnet-5', system: 'You are Blinky.', session: { kind: 'resume', id: 'sess-2' }, home: '/tmp/claude-a', env: { CLAUDE_CODE_OAUTH_TOKEN: 'oat', ANTHROPIC_API_KEY: 'from-request', CLAUDE_CONFIG_DIR: '/tmp/claude-b' } },
            { RERUN_CLAUDE_PATH: '/opt/claude.mjs', ANTHROPIC_API_KEY: 'ambient' },
        )
        expect(named).toMatchObject({ command: 'node', maturity: 'wired', systemDelivery: 'flag' })
        expect(named.args).toEqual(['/opt/claude.mjs', '-p', '--output-format', 'json', '--dangerously-skip-permissions', '--resume', 'sess-2', '--model', 'claude-sonnet-5', '--system-prompt', egoBrowserSystem('You are Blinky.'), 'Say hi'])
        expect(named.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oat')
        expect(named.env.CLAUDE_CONFIG_DIR).toBe('/tmp/claude-b')
        expect(named.env.ANTHROPIC_API_KEY).toBeUndefined()
        expect(named.args.join(' ')).not.toContain('oat')

        const continued = cliInvocation('claude', { ...base, session: { kind: 'continue' } }, { ANTHROPIC_API_KEY: 'ambient' })
        expect(continued.command).toBe('claude')
        expect(continued.args).toContain('--continue')
        expect(continued.env.ANTHROPIC_API_KEY).toBe('ambient')

        const fresh = cliInvocation('claude', base, {})
        expect(fresh.systemDelivery).toBe('flag')
        expect(fresh.args).toContain(egoBrowserSystem(undefined))
        expect(fresh.args).not.toContain('--model')
        expect(fresh.env.CLAUDE_CONFIG_DIR).toBeUndefined()
    })

    it('reads the process environment when none is passed', () => {
        expect(cliInvocation('codex', base).args).toContain('exec')
    })

    it('drops non-string environment values', () => {
        const invocation = cliInvocation('codex', base, { NOT_A_STRING: undefined, KEEP: 'yes' })
        expect(invocation.env.KEEP).toBe('yes')
        expect(invocation.env.NOT_A_STRING).toBeUndefined()
    })

    it('refuses an empty prompt, cwd, or resume id before building a command', () => {
        expect(() => cliInvocation('grok', { ...base, prompt: '   ' }, {})).toThrow(CliAdapterError)
        expect(() => cliInvocation('grok', { ...base, prompt: '   ' }, {})).toThrow(/prompt is empty/)
        expect(() => cliInvocation('claude', { ...base, cwd: '  ' }, {})).toThrow(/cwd is empty/)
        expect(() => cliInvocation('kimi', { ...base, session: { kind: 'resume', id: ' ' } }, {})).toThrow(/resume id is empty/)
    })
})

describe('runLocalCli', () => {
    const standIn = join(cwd, 'stand-in.mjs')
    const hang = join(cwd, 'hang.mjs')
    const failing = join(cwd, 'fail.mjs')
    writeFileSync(
        standIn,
        `const keys = ['CLAUDE_CODE_OAUTH_TOKEN','ANTHROPIC_API_KEY','CLAUDE_CONFIG_DIR','CODEX_HOME','KIMI_CODE_HOME','GROK_HOME','KIMI_API_KEY','XAI_API_KEY','CODEX_API_KEY']
const env = {}
for (const key of keys) if (process.env[key] !== undefined) env[key] = process.env[key]
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), env }))
process.stderr.write('stderr-note')
`,
    )
    writeFileSync(hang, "process.on('SIGTERM', () => process.exit(1))\nsetInterval(() => {}, 1000)\n")
    writeFileSync(failing, "process.stdout.write('out'); process.stderr.write('err'); process.exit(2)\n")

    function envFor(id: CliRuntimeId, path: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
        const pathEnv = { codex: 'RERUN_CODEX_PATH', kimi: 'RERUN_KIMI_PATH', grok: 'RERUN_GROK_PATH', claude: 'RERUN_CLAUDE_PATH' }[id]
        return { PATH: process.env.PATH, RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude', [pathEnv]: path, ...extra }
    }

    it('refuses to spawn an adapter that the flag does not name', async () => {
        await expect(runLocalCli('kimi', base, { processEnv: { RERUN_CLI_ADAPTERS: 'codex' } })).rejects.toThrow(/Add "kimi" to RERUN_CLI_ADAPTERS/)
    })

    it('uses the process environment when no options are passed', async () => {
        const previous = process.env.RERUN_CLI_ADAPTERS
        delete process.env.RERUN_CLI_ADAPTERS
        try {
            await expect(runLocalCli('claude', base)).rejects.toThrow(/is off/)
        } finally {
            if (previous === undefined) delete process.env.RERUN_CLI_ADAPTERS
            else process.env.RERUN_CLI_ADAPTERS = previous
        }
    })

    it('spawns each runtime and hands it the prompt, session, and credentials', async () => {
        const cases: CliRuntimeId[] = ['codex', 'kimi', 'grok', 'claude']
        for (const id of cases) {
            const result = await runLocalCli(
                id,
                { prompt: 'hello', cwd, model: 'm', session: { kind: 'resume', id: 'sess-1' }, home: join(cwd, 'home'), env: { KIMI_API_KEY: 'kimi-secret', XAI_API_KEY: 'xai-secret', CODEX_API_KEY: 'codex-secret', CLAUDE_CODE_OAUTH_TOKEN: 'oat-secret' } },
                { processEnv: envFor(id, standIn, { ANTHROPIC_API_KEY: 'ambient-key' }) },
            )
            expect(result.exitCode).toBe(0)
            expect(result.stderr).toBe('stderr-note')
            const parsed = JSON.parse(result.stdout) as { argv: string[]; env: Record<string, string> }
            expect(parsed.argv.join('\n')).toContain('hello')
            expect(parsed.argv).toContain('sess-1')
            expect(JSON.stringify(parsed.argv)).not.toContain('secret')
            if (id === 'claude') expect(parsed.env.ANTHROPIC_API_KEY).toBeUndefined()
            else expect(parsed.env.ANTHROPIC_API_KEY).toBe('ambient-key')
            expect(parsed.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oat-secret')
        }
    })

    it('returns a non-zero exit instead of throwing', async () => {
        const result = await runLocalCli('kimi', base, { processEnv: envFor('kimi', failing) })
        expect(result.exitCode).toBe(2)
        expect(result.stdout).toBe('out')
        expect(result.stderr).toBe('err')
    })

    it('reports a binary that cannot be started', async () => {
        await expect(runLocalCli('claude', base, { processEnv: envFor('claude', '/no/such/claude-binary') })).rejects.toThrow(/failed to start \/no\/such\/claude-binary/)
    })

    it('stops a run that exceeds its timeout', async () => {
        await expect(runLocalCli('grok', base, { processEnv: envFor('grok', hang), timeoutMs: 400 })).rejects.toThrow(/timed out after 400ms/)
    })

    it('stops a run when the signal aborts', async () => {
        const signal = new AbortController()
        const pending = runLocalCli('codex', base, { processEnv: envFor('codex', hang), signal: signal.signal })
        signal.abort()
        await expect(pending).rejects.toThrow(/was aborted/)
    })

    it('does not spawn when the signal is already aborted', async () => {
        const signal = new AbortController()
        signal.abort()
        await expect(runLocalCli('claude', base, { processEnv: envFor('claude', '/no/such/claude-binary'), signal: signal.signal })).rejects.toThrow(/was aborted/)
    })
})

describe('stub CLI contract', () => {
    const secret = 'contract-secret-value'
    const prompt = 'hello from contract'

    function envFor(id: CliRuntimeId, log: string): NodeJS.ProcessEnv {
        const pathEnv = { codex: 'RERUN_CODEX_PATH', kimi: 'RERUN_KIMI_PATH', grok: 'RERUN_GROK_PATH', claude: 'RERUN_CLAUDE_PATH' }[id]
        return {
            PATH: process.env.PATH,
            RERUN_CLI_ADAPTERS: 'codex,kimi,grok,claude',
            BLINKY_STUB_ID: id,
            BLINKY_STUB_LOG: log,
            [pathEnv]: stubCli,
        }
    }

    it.each(['codex', 'kimi', 'grok', 'claude'] as const)('invokes %s with the expected args and parses the stub output', async id => {
        const log = join(cwd, `stub-${id}.jsonl`)
        writeFileSync(log, '')
        const home = join(cwd, `${id}-home`)
        const result = await runLocalCli(
            id,
            { prompt, cwd, model: 'm', system: 'Be brief', session: { kind: 'resume', id: 'sess-contract' }, home, env: { CODEX_API_KEY: secret, KIMI_API_KEY: secret, XAI_API_KEY: secret, CLAUDE_CODE_OAUTH_TOKEN: secret } },
            { processEnv: envFor(id, log) },
        )
        expect(result.exitCode).toBe(0)
        expect(result.parsed.text).toContain(prompt)
        expect(result.parsed.sessionId).toBe(`stub-${id}-session`)
        expect(result.invocation.args.join(' ')).not.toContain(secret)
        const recorded = JSON.parse(readFileSync(log, 'utf8').trim()) as { argv: string[]; env: Record<string, string> }
        expect(recorded.argv.join(' ')).toContain(prompt)
        expect(recorded.argv.join(' ')).toContain('sess-contract')
        expect(recorded.argv.join(' ')).not.toContain(secret)
        expect(recorded.env.CODEX_API_KEY).toBe('[set]')
        expect(recorded.env.KIMI_API_KEY).toBe('[set]')
        expect(recorded.env.XAI_API_KEY).toBe('[set]')
        expect(recorded.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('[set]')
        const homeEnv = { codex: 'CODEX_HOME', kimi: 'KIMI_CODE_HOME', grok: 'GROK_HOME', claude: 'CLAUDE_CONFIG_DIR' }[id]
        expect(recorded.env[homeEnv]).toBe(home)
    })
})
