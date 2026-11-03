export { agentWorkingDirectory, ensureWorkspaceLayout, resolveCliCwd } from './cwd.js'
export { foreignAgentEnvOverlay, isForeignAgentValue, mergeSpawnEnv, omitForeignAgentEnv } from './env.js'
export { describeAgentWorkspace, listAgentRuns, listCliProcesses, releaseAgentWorkspace, trackAgentRun, trackCliProcess } from './runs.js'
export type { AgentRunHandle } from './runs.js'
export { attachRepo, clearRepoCache, ensureTaskWorktree, fetchAgentRepo, gcAgentRepos, listAgentRepos, removeAgentRepo, setActiveRepo, testRepoAccess } from './provision.js'
export { listGithubRepos } from './github.js'
export { parseGitRemote } from './git-url.js'

// Rex maps one session per agent onto this workspace. `describeAgentWorkspace` is the read
// side (paths, the active checkout, disk, in-flight runs and CLI processes). Spawn paths take
// `agentWorkingDirectory` for cwd and `mergeSpawnEnv` so another agent's directories stay out
// of the child environment. Nothing here stores a git password or an SSH key.
