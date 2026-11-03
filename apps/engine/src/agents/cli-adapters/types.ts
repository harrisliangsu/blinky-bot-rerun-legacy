export const CLI_RUNTIME_IDS = ['codex', 'kimi', 'grok', 'claude'] as const

export type CliRuntimeId = (typeof CLI_RUNTIME_IDS)[number]

export type CliSession = { kind: 'new' } | { kind: 'resume'; id: string } | { kind: 'continue' }

// `flag` is a real CLI switch. `prepended` means the CLI has no system-prompt switch, so the
// text is placed in front of the user prompt. `none` means the caller passed no system text.
export type CliSystemDelivery = 'flag' | 'prepended' | 'none'

export type CliMaturity = 'wired' | 'spawn-ready'

export type CliRunRequest = {
    prompt: string
    cwd: string
    model?: string
    system?: string
    session?: CliSession
    // Credential and other variables for this spawn. Merged over the process environment.
    // Never placed on argv.
    env?: Record<string, string>
    // CLI config/home directory, when that CLI has one (`CODEX_HOME`, `KIMI_CODE_HOME`, …).
    home?: string
    // Pane label and session handle when Rex mirroring is on. `agentId` selects that agent's workspace.
    label?: string
    handle?: string
    agentId?: string
}

export type CliInvocation = {
    id: CliRuntimeId
    command: string
    args: string[]
    cwd: string
    env: Record<string, string>
    maturity: CliMaturity
    systemDelivery: CliSystemDelivery
}

export type CliRunResult = {
    invocation: CliInvocation
    exitCode: number | null
    stdout: string
    stderr: string
}

export type CliAdapterInfo = {
    id: CliRuntimeId
    binaryName: string
    pathEnv: string
    homeEnv: string
    maturity: CliMaturity
}

export class CliAdapterError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'CliAdapterError'
    }
}
