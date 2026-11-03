// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum ShellLanguage: Equatable {
    case english
    case chinese

    public static func resolve(_ preferredLanguages: [String]) -> ShellLanguage {
        for tag in preferredLanguages {
            let lower = tag.lowercased().replacingOccurrences(of: "_", with: "-")
            if lower.hasPrefix("zh") { return .chinese }
            if lower.hasPrefix("en") { return .english }
        }
        return .english
    }

    public static var current: ShellLanguage {
        resolve(Locale.preferredLanguages)
    }
}

public enum ShellCopy {
    public static func starting(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Starting the local engine and Compose…"
        case .chinese: return "正在启动本地引擎和界面…"
        }
    }

    public static func pageFailedTitle(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "This page didn't open"
        case .chinese: return "这个页面没有打开"
        }
    }

    public static func pageFailedBody(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Reload to try that page again."
        case .chinese: return "请重新载入后再试。"
        }
    }

    public static func reload(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Reload"
        case .chinese: return "重新载入"
        }
    }

    public static func newBot(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "New Bot"
        case .chinese: return "新建 Bot"
        }
    }

    public static func openBlinkyBot(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Open BlinkyBot"
        case .chinese: return "打开 BlinkyBot"
        }
    }

    public static func restartServices(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Restart Services"
        case .chinese: return "重启服务"
        }
    }

    public static func openLogsFolder(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Open Logs Folder"
        case .chinese: return "打开日志文件夹"
        }
    }

    public static func checkForUpdates(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Check for Updates…"
        case .chinese: return "检查更新"
        }
    }

    public static func quit(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Quit"
        case .chinese: return "退出"
        }
    }

    public static func status(_ language: ShellLanguage, _ status: ServiceMenuStatus) -> String {
        switch (language, status) {
        case (.english, .running): return "Service running"
        case (.english, .starting): return "Service starting"
        case (.english, .stopped): return "Service stopped"
        case (.english, .error): return "Service error"
        case (.chinese, .running): return "服务运行中"
        case (.chinese, .starting): return "服务启动中"
        case (.chinese, .stopped): return "服务已停止"
        case (.chinese, .error): return "服务出错"
        }
    }

    public static func retry(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Retry"
        case .chinese: return "重试"
        }
    }

    public static func copyDiagnostics(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Copy Diagnostics"
        case .chinese: return "复制诊断信息"
        }
    }

    public static func copied(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Copied."
        case .chinese: return "已复制。"
        }
    }

    public static func logHeading(_ language: ShellLanguage, count: Int) -> String {
        if count == 0 {
            switch language {
            case .english: return "Recent log"
            case .chinese: return "最近的日志"
            }
        }
        switch language {
        case .english: return count == 1 ? "Recent log (1 line)" : "Recent log (\(count) lines)"
        case .chinese: return "最近的日志（\(count) 行）"
        }
    }

    public static func emptyLog(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "No log lines yet."
        case .chinese: return "暂时没有日志。"
        }
    }

    public static func loginHeading(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Startup"
        case .chinese: return "启动"
        }
    }

    public static func loginToggle(_ language: ShellLanguage) -> String {
        switch language {
        case .english: return "Open at login"
        case .chinese: return "登录时打开"
        }
    }

    public static func loginHelp(_ language: ShellLanguage) -> String {
        switch language {
        case .english:
            return "Off unless you turn it on. BlinkyBot then opens when you log in to this Mac. Closing the window leaves the local service running, in the Dock and in the menu bar."
        case .chinese:
            return "默认关闭。打开后，登录这台 Mac 时会启动 BlinkyBot。关掉窗口后，本地服务会继续运行，Dock 和菜单栏里都还在。"
        }
    }

    public static func loginFailed(_ language: ShellLanguage) -> String {
        switch language {
        case .english:
            return "BlinkyBot couldn't change the login item. Open the installed app in Applications and try again."
        case .chinese:
            return "没能修改登录项。请从「应用程序」里打开安装好的 BlinkyBot 后再试。"
        }
    }

    public static func serviceName(_ language: ShellLanguage, role: String) -> String {
        let lower = role.lowercased()
        if lower.contains("compose") || lower == "ui" {
            return language == .chinese ? "界面" : "Compose"
        }
        if lower.contains("engine") {
            return language == .chinese ? "引擎" : "the engine"
        }
        return language == .chinese ? "本地服务" : "the local service"
    }
}
