import { egoBrowserSystem } from '../../browser/ego-browser.js'
import { childEnv, resolveCommand } from './binary.js'
import type { CliAdapterInfo, CliInvocation, CliRunRequest, CliSystemDelivery } from './types.js'

// Kimi Code CLI (`kimi` from `@moonshot-ai/kimi-code`), not the archived Python `kimi-cli`.
// `-p` already runs with the auto permission policy, and the CLI rejects `-p` together with
// `--auto` / `--yolo`. There is no system-prompt flag, so a system string is prepended.
export const kimiAdapter: CliAdapterInfo & { build(request: CliRunRequest, processEnv: NodeJS.ProcessEnv): CliInvocation } = {
    id: 'kimi',
    binaryName: 'kimi',
    pathEnv: 'RERUN_KIMI_PATH',
    homeEnv: 'KIMI_CODE_HOME',
    maturity: 'spawn-ready',
    build(request, processEnv) {
        const resolved = resolveCommand(this.pathEnv, this.binaryName, processEnv)
        const session = request.session ?? { kind: 'new' }
        const args = [...resolved.args]
        if (session.kind === 'resume') args.push('--session', session.id)
        else if (session.kind === 'continue') args.push('--continue')
        if (request.model) args.push('-m', request.model)
        const prompt = `${egoBrowserSystem(request.system)}\n\n${request.prompt}`
        const systemDelivery: CliSystemDelivery = 'prepended'
        args.push('-p', prompt, '--output-format', 'stream-json')
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
