import { egoBrowserSystem } from '../../browser/ego-browser.js'
import { childEnv, resolveCommand } from './binary.js'
import type { CliAdapterInfo, CliInvocation, CliRunRequest, CliSystemDelivery } from './types.js'

// Local one-shot. Foreman chats use the app-server (`codexAppServerProvider`), not this argv.
// `exec resume --last` is Codex's non-interactive "continue the latest thread in this cwd".
export const codexAdapter: CliAdapterInfo & { build(request: CliRunRequest, processEnv: NodeJS.ProcessEnv): CliInvocation } = {
    id: 'codex',
    binaryName: 'codex',
    pathEnv: 'RERUN_CODEX_PATH',
    homeEnv: 'CODEX_HOME',
    maturity: 'wired',
    build(request, processEnv) {
        const resolved = resolveCommand(this.pathEnv, this.binaryName, processEnv)
        const session = request.session ?? { kind: 'new' }
        const args = [...resolved.args, 'exec']
        if (session.kind === 'resume') args.push('resume', session.id)
        else if (session.kind === 'continue') args.push('resume', '--last')
        args.push('--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-c', 'approval_policy=never')
        if (request.model) args.push('-m', request.model)
        args.push('-c', `instructions=${egoBrowserSystem(request.system)}`)
        const systemDelivery: CliSystemDelivery = 'flag'
        args.push('--', request.prompt)
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
