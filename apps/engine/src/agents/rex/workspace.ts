// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import { mkdirSync } from 'node:fs'
import { workspaceDir } from '../../config/paths.js'

// Rex panes use the agent's own workspace. A later change to where that directory lives
// stays behind this function: today it is `<data>/agents/<id>/workspace`.
export function agentWorkspace(agentId: string): string {
    const workspace = workspaceDir(agentId)
    mkdirSync(workspace, { recursive: true })
    return workspace
}
