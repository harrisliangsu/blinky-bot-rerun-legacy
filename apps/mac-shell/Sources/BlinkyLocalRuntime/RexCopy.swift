// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum RexCopyKey: String, CaseIterable, Sendable {
    case section
    case title
    case beta
    case summary
    case ready
    case notInstalled
    case appOnly
    case cliOnly
    case versionFailed
    case removed
    case localOnly
    case appFound
    case cliFound
    case openWebsite
    case refresh
    case launchFailed
    case closedEarly
    case turnedOff
    case dismiss
}

public enum RexCopy {
    public static func language(preferredLanguages: [String]) -> EgoLiteLanguage {
        EgoLiteCopy.language(preferredLanguages: preferredLanguages)
    }

    public static func string(_ key: RexCopyKey, preferredLanguages: [String] = Locale.preferredLanguages) -> String {
        let language = language(preferredLanguages: preferredLanguages)
        return table[language]?[key] ?? table[.en]![key]!
    }

    private static let table: [EgoLiteLanguage: [RexCopyKey: String]] = [
        .en: [
            .section: "Rex",
            .title: "Show bot activity in Rex",
            .beta: "Beta",
            .summary: "Mirror each bot’s run into its own Rex session while BlinkyBot keeps the process. BlinkyBot does not change Claude or Codex settings.",
            .ready: "The next agent run opens in Rex. If Rex does not start, BlinkyBot runs the agent as usual and shows a warning.",
            .notInstalled: "Rex is not installed, so this stays off. Install Rex, then check again.",
            .appOnly: "Rex is installed, but the rex command was not found on PATH or inside the app, so this stays off.",
            .cliOnly: "The rex command is available, but Rex was not found in /Applications or your Applications folder, so this stays off.",
            .versionFailed: "The rex command did not run, so this stays off.",
            .removed: "Rex is no longer available, so this was turned off. Install Rex and turn it on again if you want it.",
            .localOnly: "Rex stays on this Mac. BlinkyBot does not open Rex’s server to the network.",
            .appFound: "App",
            .cliFound: "rex",
            .openWebsite: "Rex website",
            .refresh: "Check again",
            .launchFailed: "Rex did not open a pane for this run. BlinkyBot ran the agent on its own.",
            .closedEarly: "Rex closed before this run finished. BlinkyBot kept the output it had already captured.",
            .turnedOff: "Rex is not available, so this was turned off. The agent kept running.",
            .dismiss: "Dismiss",
        ],
        .zh: [
            .section: "Rex",
            .title: "在 Rex 中显示 Bot 活动",
            .beta: "实验",
            .summary: "把每个 Bot 的运行镜像到它自己的 Rex 会话。BlinkyBot 仍掌握进程，也不会改 Claude 或 Codex 的设置。",
            .ready: "下一次 agent 运行会在 Rex 中打开。如果 Rex 没有启动，BlinkyBot 会照常运行，并给出提示。",
            .notInstalled: "尚未安装 Rex，所以这项保持关闭。安装 Rex 后再检查一次。",
            .appOnly: "已安装 Rex，但在 PATH 和应用内部都没有找到 rex 命令，所以这项保持关闭。",
            .cliOnly: "已找到 rex 命令，但在 /Applications 或个人应用程序文件夹里没有找到 Rex，所以这项保持关闭。",
            .versionFailed: "rex 命令没有运行成功，所以这项保持关闭。",
            .removed: "现在找不到 Rex，所以这项已关闭。需要时请安装 Rex 后再打开。",
            .localOnly: "Rex 只在这台 Mac 上使用。BlinkyBot 不会把 Rex 的服务器暴露到网络。",
            .appFound: "应用",
            .cliFound: "rex",
            .openWebsite: "Rex 网站",
            .refresh: "重新检查",
            .launchFailed: "Rex 没有为这次运行打开窗格。BlinkyBot 已自行运行 agent。",
            .closedEarly: "Rex 在这次运行结束前关闭了。BlinkyBot 保留了已经收到的输出。",
            .turnedOff: "找不到 Rex，已关闭这项。agent 仍在运行。",
            .dismiss: "知道了",
        ],
    ]
}
