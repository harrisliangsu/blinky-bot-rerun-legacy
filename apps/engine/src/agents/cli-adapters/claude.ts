import { egoBrowserSystem } from '../../browser/ego-browser.js'
import { childEnv, resolveCommand } from './binary.js'
import type { CliAdapterInfo, CliInvocation, CliRunRequest, CliSystemDelivery } from './types.js'

// Official Claude Code CLI (`claude`, `@anthropic-ai/claude-code`). `--dangerously-skip-permissions`
// is the CLI form of the bypassPermissions mode Foreman already sets on `createClaudeCode`.
// `--system-prompt` replaces the default prompt, matching the provider's `systemPrompt` setting.
export const claudeAdapter: CliAdapterInfo & { build(request: CliRunRequest, processEnv: NodeJS.ProcessEnv): CliInvocation } = {
    id: 'claude',
    binaryName: 'claude',
    pathEnv: 'RERUN_CLAUDE_PATH',
    homeEnv: 'CLAUDE_CONFIG_DIR',
    maturity: 'wired',
    build(request, processEnv) {
        const resolved = resolveCommand(this.pathEnv, this.binaryName, processEnv)
        const session = request.session ?? { kind: 'new' }
        const args = [...resolved.args, '-p', '--output-format', 'json', '--dangerously-skip-permissions']
        if (session.kind === 'resume') args.push('--resume', session.id)
        else if (session.kind === 'continue') args.push('--continue')
        if (request.model) args.push('--model', request.model)
        args.push('--system-prompt', egoBrowserSystem(request.system))
        const systemDelivery: CliSystemDelivery = 'flag'
        args.push(request.prompt)
        const env = childEnv(processEnv, this.homeEnv, request.home, request.env)
        // A subscription token and an API key in the same process make the CLI bill the key.
        // Foreman drops the key for the same reason (`ANTHROPIC_API_KEY: undefined` in claudeProvider).
        if (env.CLAUDE_CODE_OAUTH_TOKEN) delete env.ANTHROPIC_API_KEY
        return {
            id: this.id,
            command: resolved.command,
            args,
            cwd: request.cwd,
            env,
            maturity: this.maturity,
            systemDelivery,
        }
    },
}
