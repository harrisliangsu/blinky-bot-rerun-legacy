// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum EgoLiteLanguage: String, Equatable, Sendable {
    case en
    case zh
}

public enum EgoLiteCopyKey: String, CaseIterable, Sendable {
    case title
    case summary
    case ready
    case needsOnboarding
    case notInstalled
    case appFound
    case cliFound
    case appMissing
    case cliMissing
    case install
    case openApp
    case openWebsite
    case refresh
    case confirmTitle
    case confirmRun
    case confirmWebsite
    case confirmAction
    case cancel
    case installFailed
    case logTitle
}

public enum EgoLiteCopy {
    public static func language(preferredLanguages: [String]) -> EgoLiteLanguage {
        let first = preferredLanguages.first?.lowercased() ?? "en"
        return first.hasPrefix("zh") ? .zh : .en
    }

    public static func string(_ key: EgoLiteCopyKey, preferredLanguages: [String] = Locale.preferredLanguages) -> String {
        let language = language(preferredLanguages: preferredLanguages)
        return table[language]?[key] ?? table[.en]![key]!
    }

    private static let table: [EgoLiteLanguage: [EgoLiteCopyKey: String]] = [
        .en: [
            .title: "ego(lite)",
            .summary: "Browser tasks run in ego(lite), in their own Space, using the logins you imported. BlinkyBot does not open another browser for them.",
            .ready: "ego(lite) is installed and ego-browser is ready. Finish nothing else here.",
            .needsOnboarding: "ego(lite) is installed. Open it and finish onboarding so it registers ego-browser, usually in ~/.local/bin. You can import another browser’s logins. macOS may ask for your keychain password more than once.",
            .notInstalled: "ego(lite) is not installed, so browser tasks stop here until you install it.",
            .appFound: "App",
            .cliFound: "ego-browser",
            .appMissing: "ego lite.app was not found in /Applications or ~/Applications.",
            .cliMissing: "ego-browser is not on PATH yet.",
            .install: "Install ego(lite)…",
            .openApp: "Open ego(lite)",
            .openWebsite: "Open ego(lite) website",
            .refresh: "Check again",
            .confirmTitle: "Install ego(lite)?",
            .confirmRun: "BlinkyBot will run the official installer. It downloads the ego(lite) disk image, installs ego lite.app, and opens the app. You finish onboarding there. Nothing downloads until you confirm.",
            .confirmWebsite: "The installer script is not in this app. BlinkyBot will open https://lite.ego.app/ so you can download ego(lite) yourself.",
            .confirmAction: "Continue",
            .cancel: "Cancel",
            .installFailed: "The installer did not finish. You can download ego(lite) from its website and try again.",
            .logTitle: "Installer",
        ],
        .zh: [
            .title: "ego(lite)",
            .summary: "浏览器任务在 ego(lite) 里运行，使用独立的 Space，并复用你导入的登录状态。BlinkyBot 不会为此改用其他浏览器。",
            .ready: "ego(lite) 已安装，ego-browser 已可用。这里没有其他步骤。",
            .needsOnboarding: "已安装 ego(lite)。请打开它并完成首次引导，这样才会注册 ego-browser（通常在 ~/.local/bin）。你可以导入其他浏览器的登录状态。macOS 可能会多次询问钥匙串密码。",
            .notInstalled: "尚未安装 ego(lite)，浏览器任务会停在这里，直到安装完成。",
            .appFound: "应用",
            .cliFound: "ego-browser",
            .appMissing: "在 /Applications 和 ~/Applications 中没有找到 ego lite.app。",
            .cliMissing: "PATH 上还没有 ego-browser。",
            .install: "安装 ego(lite)…",
            .openApp: "打开 ego(lite)",
            .openWebsite: "打开 ego(lite) 网站",
            .refresh: "重新检查",
            .confirmTitle: "安装 ego(lite)？",
            .confirmRun: "BlinkyBot 将运行官方安装脚本。它会下载 ego(lite) 磁盘映像，安装 ego lite.app，然后打开应用。你在应用里完成首次引导。确认之前不会开始下载。",
            .confirmWebsite: "此应用里没有安装脚本。BlinkyBot 会打开 https://lite.ego.app/，由你自己下载 ego(lite)。",
            .confirmAction: "继续",
            .cancel: "取消",
            .installFailed: "安装程序没有完成。你可以从官网下载 ego(lite) 后再试一次。",
            .logTitle: "安装程序",
        ],
    ]
}
