import { mkdirSync } from 'node:fs'
import { agentDataDbPath, agentDataDir, sharedDbDir, sharedDbPath } from '../config/paths.js'
import { agentWorkingDirectory } from '../workspace/cwd.js'
import { omitForeignAgentEnv } from '../workspace/env.js'
import type { LoadedAgent } from './types.js'

export type AgentProcessEnv = { cwd: string; env: Record<string, string> }

// What every process an agent starts must see, whether shell_exec spawns it or a CLI provider's
// own shell does: the agent's .env plus the paths the system prompt names. cwd is the selected
// repository when one is ready, otherwise the workspace root. process.env is left to the caller,
// because the Claude provider builds its base from an allowlist of its own.
export function agentProcessEnv(agent: Pick<LoadedAgent, 'id' | 'env' | 'config'>): AgentProcessEnv {
    const { workspace, cwd, repoPath } = agentWorkingDirectory(agent.id)
    mkdirSync(agentDataDir(agent.id), { recursive: true })
    const env = omitForeignAgentEnv(agent.id, agent.env)
    env.RERUN_AGENT_DB = agentDataDbPath(agent.id)
    env.RERUN_WORKSPACE = workspace
    if (repoPath) env.RERUN_REPO = repoPath
    if (agent.config.tools.sharedDb) {
        mkdirSync(sharedDbDir(), { recursive: true })
        env.RERUN_SHARED_DB = sharedDbPath()
    }
    return { cwd, env }
}
