// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum OnboardingLanguage: String, Equatable {
    case en
    case zh
}

public enum OnboardingAppearance: String, Equatable {
    case light
    case dark
}

public func onboardingLanguage(preferredLanguages: [String], override: String? = nil) -> OnboardingLanguage {
    if let raw = onboardingTrimmed(override)?.lowercased() {
        if raw.hasPrefix("zh") { return .zh }
        if raw.hasPrefix("en") { return .en }
    }
    if preferredLanguages.first?.lowercased().hasPrefix("zh") == true {
        return .zh
    }
    return .en
}

public func onboardingAppearance(override: String?) -> OnboardingAppearance? {
    switch onboardingTrimmed(override)?.lowercased() {
    case "light":
        return .light
    case "dark":
        return .dark
    default:
        return nil
    }
}

public func shouldPresentOnboarding(environment: [String: String], completed: Bool) -> Bool {
    switch onboardingTrimmed(environment[OnboardingEnvironmentKey.presentation])?.lowercased() {
    case "0", "off", "false", "no", "skip":
        return false
    case "1", "on", "true", "yes", "always", "show":
        return true
    default:
        return !completed
    }
}

public struct OnboardingCopy: Equatable {
    public var language: OnboardingLanguage

    public init(language: OnboardingLanguage) {
        self.language = language
    }

    public var headline: String { pick("Set up tools on this Mac", "在这台 Mac 上准备工具") }
    public var subtitle: String {
        pick(
            "BlinkyBot can use Codex, Kimi, Grok, and the ego(lite) browser. Install or sign in here, or skip and come back from Settings.",
            "BlinkyBot 可以使用 Codex、Kimi、Grok 和 ego(lite) 浏览器。可以在这里安装或登录，也可以先跳过，稍后在设置里继续。"
        )
    }
    public var footer: String {
        pick(
            "Install and sign-in run in Terminal, so you can see the output. Nothing is installed silently.",
            "安装和登录都会在终端里进行，你能看到完整输出。不会在后台悄悄安装。"
        )
    }
    public var recheck: String { pick("Recheck", "重新检查") }
    public var checking: String { pick("Checking…", "正在检查…") }
    public var skip: String { pick("Skip", "跳过") }
    public var done: String { pick("Done", "完成") }
    public var copy: String { pick("Copy", "复制") }
    public var copied: String { pick("Copied", "已复制") }
    public var settingsTitle: String { pick("Coding tools", "编程工具") }
    public var settingsDetail: String {
        pick(
            "Check Codex, Kimi, Grok, and the ego(lite) browser again.",
            "再次检查 Codex、Kimi、Grok 和 ego(lite) 浏览器。"
        )
    }
    public var settingsButton: String { pick("Set up tools…", "设置工具…") }
    public var terminalError: String { pick("Couldn’t open Terminal.", "无法打开终端。") }

    public func status(_ state: OnboardingState) -> String {
        switch state {
        case .ready:
            return pick("Installed and ready", "已安装，可以使用")
        case .needsLogin:
            return pick("Installed, sign-in needed", "已安装，需要登录")
        case .needsOnboarding:
            return pick("Installed, finish its setup", "已安装，还需完成设置")
        case .notInstalled:
            return pick("Not installed", "尚未安装")
        }
    }

    public func name(_ step: OnboardingStep) -> String {
        language == .zh ? step.nameZH : step.nameEN
    }

    public func detail(_ step: OnboardingStep) -> String? {
        language == .zh ? step.detailZH : step.detailEN
    }

    public func actionTitle(_ action: OnboardingAction) -> String {
        language == .zh ? action.titleZH : action.titleEN
    }

    public var auditLines: [String] {
        var lines = [
            headline, subtitle, footer, recheck, checking, skip, done, copy, copied,
            settingsTitle, settingsDetail, settingsButton, terminalError,
        ]
        for state in [OnboardingState.ready, .needsLogin, .needsOnboarding, .notInstalled] {
            lines.append(status(state))
        }
        return lines
    }

    private func pick(_ en: String, _ zh: String) -> String {
        language == .zh ? zh : en
    }
}

/// Shell text for a visible Terminal window. Returns nil when the command
/// contains shell metacharacters, so a copyable installer is never executed
/// from the button by accident.
public func onboardingTerminalScript(command: String, language: OnboardingLanguage) -> String? {
    let trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
    let forbidden = CharacterSet(charactersIn: "\n\r\u{0000};&|`$<>\\(){}[]!?#\"*")
    if trimmed.isEmpty || trimmed.rangeOfCharacter(from: forbidden) != nil {
        return nil
    }
    let success = language == .zh ? "BlinkyBot：已完成。" : "BlinkyBot: finished."
    let failure = language == .zh ? "BlinkyBot：命令退出码 $status。" : "BlinkyBot: the command exited with status $status."
    return """
    #!/bin/bash
    cd "$HOME" || exit 1
    \(trimmed)
    status=$?
    printf '\\n'
    if [ "$status" -eq 0 ]; then
      printf '%s\\n' "\(success)"
    else
      printf '%s\\n' "\(failure)"
    fi
    exec "${SHELL:-/bin/bash}"
    """
}
