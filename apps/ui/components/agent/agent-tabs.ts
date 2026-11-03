import type { SidePanelTab } from '@/components/layout/SidePanelTabHeader'
import { AGENT_TAB_LABELS, type AgentFocusTab } from '@/lib/board/types'
import { BlocksIcon, BrainIcon, CalendarClockIcon, FolderIcon, GaugeIcon, InboxIcon, Layers, MessageCircle, PlugSparkleIcon, ScrollTextIcon, SettingsIcon, SlidersHorizontalIcon, TableIcon, WebhookIcon, WrenchIcon } from '@/lib/icons'

export type Tab = SidePanelTab & { id: AgentFocusTab }

export const CHAT_TAB: Tab = { id: 'chat', icon: MessageCircle, label: AGENT_TAB_LABELS.chat, description: 'Talk with this Bot' }
export const ACTIONS_TAB: Tab = { id: 'actions', icon: InboxIcon, label: AGENT_TAB_LABELS.actions, description: 'Items that need your attention' }
export const SERVICES_TAB: Tab = { id: 'services', icon: BlocksIcon, label: AGENT_TAB_LABELS.services, description: 'Ready-made integrations this Bot can use' }
export const MCP_TAB: Tab = { id: 'mcp', icon: PlugSparkleIcon, label: AGENT_TAB_LABELS.mcp, description: 'Model Context Protocol servers' }
export const SKILLS_TAB: Tab = { id: 'skills', icon: Layers, label: AGENT_TAB_LABELS.skills, description: 'Reusable skills the Bot can run' }
export const DATA_TAB: Tab = { id: 'data', icon: TableIcon, label: AGENT_TAB_LABELS.data, description: "This Bot's data" }
export const MEMORIES_TAB: Tab = { id: 'memories', icon: BrainIcon, label: AGENT_TAB_LABELS.memories, description: 'What this Bot remembers' }
export const FILES_TAB: Tab = { id: 'files', icon: FolderIcon, label: AGENT_TAB_LABELS.files, description: "This Bot's files" }
export const SCHEDULED_TAB: Tab = { id: 'scheduled', icon: CalendarClockIcon, label: AGENT_TAB_LABELS.scheduled, description: 'Recurring and scheduled tasks' }
export const TRIGGERS_TAB: Tab = { id: 'triggers', icon: WebhookIcon, label: AGENT_TAB_LABELS.triggers, description: 'Public URLs that start a run when called' }
export const TOOLS_TAB: Tab = { id: 'tools', icon: SlidersHorizontalIcon, label: AGENT_TAB_LABELS.tools, description: 'Tools this Bot can use' }
export const MONITORING_TAB: Tab = { id: 'monitoring', icon: GaugeIcon, label: AGENT_TAB_LABELS.monitoring, description: 'Usage, cost and activity for this Bot' }
export const LOGS_TAB: Tab = { id: 'logs', icon: ScrollTextIcon, label: AGENT_TAB_LABELS.logs, description: 'Activity and run logs' }
export const SETUP_TAB: Tab = { id: 'setup', icon: WrenchIcon, label: AGENT_TAB_LABELS.setup, description: 'What this Bot does the first time someone installs it' }
export const SETTINGS_TAB: Tab = { id: 'settings', icon: SettingsIcon, label: AGENT_TAB_LABELS.settings, description: 'Configure this Bot' }

// In the order the rail lists them.
export const AGENT_TABS: Tab[] = [CHAT_TAB, ACTIONS_TAB, SERVICES_TAB, MCP_TAB, SKILLS_TAB, DATA_TAB, MEMORIES_TAB, FILES_TAB, SCHEDULED_TAB, TRIGGERS_TAB, TOOLS_TAB, MONITORING_TAB, LOGS_TAB, SETUP_TAB, SETTINGS_TAB]
