// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { agentWorkingDirectory } from '../../workspace/cwd.js'

// Rex panes use the directory the agent's CLIs use: the selected repository checkout when
// one is ready, otherwise `<data>/agents/<id>/workspace`.
export function agentWorkspace(agentId: string): string {
    return agentWorkingDirectory(agentId).cwd
}
