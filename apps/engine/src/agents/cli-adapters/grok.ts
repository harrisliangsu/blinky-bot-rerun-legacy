import { childEnv, resolveCommand } from './binary.js'
import type { CliAdapterInfo, CliInvocation, CliRunRequest, CliSystemDelivery } from './types.js'

// Official `grok` binary (`@xai-official/grok`). `--session-id` mints a new session and errors
// when that id already exists, so resume is `--resume` and "latest in this cwd" is `--continue`.
export const grokAdapter: CliAdapterInfo & { build(request: CliRunRequest, processEnv: NodeJS.ProcessEnv): CliInvocation } = {
    id: 'grok',
    binaryName: 'grok',
    pathEnv: 'RERUN_GROK_PATH',
    homeEnv: 'GROK_HOME',
    maturity: 'spawn-ready',
    build(request, processEnv) {
        const resolved = resolveCommand(this.pathEnv, this.binaryName, processEnv)
        const session = request.session ?? { kind: 'new' }
        const args = [...resolved.args, '--no-auto-update', '--always-approve', '--output-format', 'json', '--cwd', request.cwd]
        if (request.model) args.push('-m', request.model)
        let systemDelivery: CliSystemDelivery = 'none'
        if (request.system) {
            args.push('--system-prompt-override', request.system)
            systemDelivery = 'flag'
        }
        if (session.kind === 'resume') args.push('--resume', session.id)
        else if (session.kind === 'continue') args.push('--continue')
        args.push('-p', request.prompt)
        return {
            id: this.id,
            command: resolved.command,
            args,
            cwd: request.cwd,
            env: childEnv(processEnv, this.homeEnv, request.home, request.env),
            maturity: this.maturity,
            systemDelivery,
        }
    },
}
