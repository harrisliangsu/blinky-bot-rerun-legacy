// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum ServicePhase: Equatable {
    case idle
    case starting
    case ready
    case failed
    case external
}

public enum ServiceMenuStatus: Equatable {
    case running
    case starting
    case stopped
    case error
}

public enum ServiceStatusDot: Equatable {
    case green
    case orange
    case gray
    case red
}

public struct ServiceMenuModel: Equatable {
    public var status: ServiceMenuStatus
    public var dot: ServiceStatusDot
    public var statusTitle: String
    public var openTitle: String
    public var newBotTitle: String
    public var restartTitle: String
    public var logsTitle: String
    public var updatesTitle: String
    public var quitTitle: String
}

public func serviceMenuStatus(phase: ServicePhase) -> ServiceMenuStatus {
    switch phase {
    case .idle:
        return .stopped
    case .starting:
        return .starting
    case .ready, .external:
        return .running
    case .failed:
        return .error
    }
}

public func serviceMenuModel(phase: ServicePhase, language: ShellLanguage) -> ServiceMenuModel {
    let status = serviceMenuStatus(phase: phase)
    return ServiceMenuModel(
        status: status,
        dot: statusDot(status),
        statusTitle: ShellCopy.status(language, status),
        openTitle: ShellCopy.openBlinkyBot(language),
        newBotTitle: ShellCopy.newBot(language),
        restartTitle: ShellCopy.restartServices(language),
        logsTitle: ShellCopy.openLogsFolder(language),
        updatesTitle: ShellCopy.checkForUpdates(language),
        quitTitle: ShellCopy.quit(language)
    )
}

public enum ServiceFailureCause: Equatable {
    case missingModule(name: String?)
    case portInUse(port: Int?)
    case permission
    case missingNode
    case missingBuild
    case timedOut
    case exited(role: String, code: Int32)
    case configuration
    case other
}

public enum ServiceErrorAction: Equatable {
    case retry
    case copyDiagnostics
    case openLogs
}

public struct DiagnosticHost: Equatable {
    public var appVersion: String
    public var operatingSystem: String
    public var architecture: String

    public init(appVersion: String, operatingSystem: String, architecture: String) {
        self.appVersion = appVersion
        self.operatingSystem = operatingSystem
        self.architecture = architecture
    }
}

public struct ServiceErrorScreen: Equatable {
    public static let identifier = "blinky.service-error"
    public static let retryIdentifier = "blinky.service-error.retry"
    public static let copyIdentifier = "blinky.service-error.copy"
    public static let logsIdentifier = "blinky.service-error.logs"

    public var showsErrorView: Bool
    public var viewIdentifier: String
    public var title: String
    public var summary: String
    public var hint: String
    public var logHeading: String
    public var logLines: [String]
    public var emptyLog: String
    public var retryTitle: String
    public var copyTitle: String
    public var logsTitle: String
    public var copiedTitle: String
    public var retryIdentifier: String
    public var copyIdentifier: String
    public var logsIdentifier: String
    public var cause: ServiceFailureCause
    public var actions: [ServiceErrorAction]

    public var logText: String {
        logLines.joined(separator: "\n")
    }

    public func diagnosticText(host: DiagnosticHost) -> String {
        var lines = [
            "App: BlinkyBot \(host.appVersion)",
            "macOS: \(host.operatingSystem)",
            "Architecture: \(host.architecture)",
            "Cause: \(causeToken(cause))",
        ]
        if case .missingModule(let name) = cause, let name, !name.isEmpty {
            lines.append("Module: \(name)")
        }
        if case .portInUse(let port) = cause, let port {
            lines.append("Port: \(port)")
        }
        if case .exited(_, let code) = cause {
            lines.append("Exit code: \(code)")
        }
        lines.append("")
        lines.append(summary)
        lines.append(hint)
        lines.append("")
        lines.append("--- log ---")
        if logLines.isEmpty {
            lines.append(emptyLog)
        } else {
            lines.append(contentsOf: logLines)
        }
        return redactSensitive(lines.joined(separator: "\n"))
    }
}

public enum ServiceWindow: Equatable {
    case starting
    case browser
    case error(ServiceErrorScreen)
}

public func serviceWindow(
    phase: ServicePhase,
    failure: RuntimeFailure?,
    engineLog: String,
    uiLog: String,
    language: ShellLanguage
) -> ServiceWindow {
    switch phase {
    case .ready, .external:
        return .browser
    case .idle, .starting:
        return .starting
    case .failed:
        let failure = failure ?? .spawn("")
        return .error(makeServiceErrorScreen(
            failure: failure,
            engineLog: engineLog,
            uiLog: uiLog,
            language: language
        ))
    }
}

public enum LaunchAtLogin {
    public static func isOn(serviceStatus: String) -> Bool {
        serviceStatus == "enabled"
    }
}

public func runtimeFailure(_ error: LaunchError) -> RuntimeFailure {
    switch error {
    case .openLog(let path, let code):
        if code == EACCES || code == EPERM {
            return .directory(path)
        }
        return .spawn("Could not open the log.")
    case .spawn(_, let detail):
        return .spawn(detail)
    case .pidFile(let path):
        return .directory(path)
    }
}

public func redactSensitive(_ text: String) -> String {
    var redacted = text
    let secretPatterns = [
        #"(?i)\bbearer\s+\S+"#,
        #"(?i)\b(?:rerun_api_key|rerun_engine_api_key|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization)\b\s*[:=]\s*\S+"#,
        #"(?i)(?:token|key|secret|password)=([^&\s]+)"#,
        #"\b[0-9a-fA-F]{64,}\b"#,
    ]
    for pattern in secretPatterns {
        redacted = replace(pattern, in: redacted, with: "[redacted]")
    }
    redacted = replace(
        #"(?i)\b(?:(?:https?|wss?)://)[^\s<>"'\)\]]+"#,
        in: redacted,
        with: "[address]"
    )
    redacted = replace(
        #"(?i)\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b"#,
        in: redacted,
        with: "[address]"
    )
    redacted = replace(
        #"(?i)\[::1\](?::\d+)?"#,
        in: redacted,
        with: "[address]"
    )
    return redacted
}

private func makeServiceErrorScreen(
    failure: RuntimeFailure,
    engineLog: String,
    uiLog: String,
    language: ShellLanguage
) -> ServiceErrorScreen {
    let cause = diagnose(failure: failure, engineLog: engineLog, uiLog: uiLog)
    let copy = causeCopy(cause, language: language)
    let lines = failureLogLines(failure: failure, engineLog: engineLog, uiLog: uiLog, language: language, limit: 30)
    return ServiceErrorScreen(
        showsErrorView: true,
        viewIdentifier: ServiceErrorScreen.identifier,
        title: copy.title,
        summary: copy.summary,
        hint: copy.hint,
        logHeading: ShellCopy.logHeading(language, count: lines.count),
        logLines: lines,
        emptyLog: ShellCopy.emptyLog(language),
        retryTitle: ShellCopy.retry(language),
        copyTitle: ShellCopy.copyDiagnostics(language),
        logsTitle: ShellCopy.openLogsFolder(language),
        copiedTitle: ShellCopy.copied(language),
        retryIdentifier: ServiceErrorScreen.retryIdentifier,
        copyIdentifier: ServiceErrorScreen.copyIdentifier,
        logsIdentifier: ServiceErrorScreen.logsIdentifier,
        cause: cause,
        actions: [.retry, .copyDiagnostics, .openLogs]
    )
}

private func diagnose(failure: RuntimeFailure, engineLog: String, uiLog: String) -> ServiceFailureCause {
    switch failure {
    case .missingNode:
        return .missingNode
    case .missingEngineBuild, .missingUIBuild:
        return .missingBuild
    case .portBusy(_, let port):
        return .portInUse(port: port)
    case .invalidPort, .portsCollide:
        return .configuration
    case .directory, .apiKey:
        return .permission
    case .timedOut, .exited, .spawn:
        let clue = [engineLog, uiLog, failure.bannerText].joined(separator: "\n")
        switch moduleClue(in: clue) {
        case .named(let name):
            return .missingModule(name: name)
        case .unnamed:
            return .missingModule(name: nil)
        case nil:
            break
        }
        switch portConflict(in: clue) {
        case .port(let port):
            return .portInUse(port: port)
        case .unspecified:
            return .portInUse(port: nil)
        case nil:
            break
        }
        if mentionsPermission(clue) {
            return .permission
        }
        if case .timedOut = failure {
            return .timedOut
        }
        if case .exited(let role, let code, _) = failure {
            return .exited(role: role, code: code)
        }
        return .other
    }
}

private struct CauseCopy {
    var title: String
    var summary: String
    var hint: String
}

private func causeCopy(_ cause: ServiceFailureCause, language: ShellLanguage) -> CauseCopy {
    switch language {
    case .english:
        return englishCopy(cause)
    case .chinese:
        return chineseCopy(cause)
    }
}

private func englishCopy(_ cause: ServiceFailureCause) -> CauseCopy {
    switch cause {
    case .missingModule(let name):
        let summary = name.map { "BlinkyBot needed “\($0)” and it wasn't there." }
            ?? "BlinkyBot needed one of its own pieces and it wasn't there."
        return CauseCopy(
            title: "A piece of BlinkyBot is missing",
            summary: summary,
            hint: "Install BlinkyBot again. If you are running from a checkout, rebuild Compose and the engine, then try again."
        )
    case .portInUse(let port):
        let summary = port.map { "Something else is using port \($0), so BlinkyBot left it alone." }
            ?? "Something else is using the port BlinkyBot needs, so BlinkyBot left it alone."
        return CauseCopy(
            title: "That port is already in use",
            summary: summary,
            hint: "Quit the other app, or pick a different port in Settings, then try again."
        )
    case .permission:
        return CauseCopy(
            title: "BlinkyBot can't use its folder",
            summary: "BlinkyBot couldn't read or write its data on this Mac.",
            hint: "Check that your account can use the BlinkyBot folder in Application Support, then try again."
        )
    case .missingNode:
        return CauseCopy(
            title: "Node wasn't found",
            summary: "BlinkyBot couldn't find the Node program it uses to start.",
            hint: "The installed app includes Node. A checkout needs Node 22, or a Node path in Settings."
        )
    case .missingBuild:
        return CauseCopy(
            title: "The local service isn't built",
            summary: "The files that run the local service aren't in place.",
            hint: "From a checkout, build the engine and Compose, then try again. An installed copy should be installed again."
        )
    case .timedOut:
        return CauseCopy(
            title: "The local service took too long",
            summary: "The local service was still starting after 30 seconds.",
            hint: "Try again. If it stays here, copy the diagnostics."
        )
    case .exited(let role, _):
        let name = ShellCopy.serviceName(.english, role: role)
        return CauseCopy(
            title: "The local service stopped",
            summary: "\(capitalized(name)) stopped while BlinkyBot was starting it.",
            hint: "Try again. If it stops every time, copy the diagnostics."
        )
    case .configuration:
        return CauseCopy(
            title: "The port settings need a change",
            summary: "Compose and the engine need two different ports, each from 1 to 65535.",
            hint: "Change the ports in Settings, quit BlinkyBot, and open it again."
        )
    case .other:
        return CauseCopy(
            title: "BlinkyBot didn't start",
            summary: "The local service didn't start.",
            hint: "Try again. If it keeps failing, copy the diagnostics."
        )
    }
}

private func chineseCopy(_ cause: ServiceFailureCause) -> CauseCopy {
    switch cause {
    case .missingModule(let name):
        let summary = name.map { "BlinkyBot 需要「\($0)」，但没有找到。" }
            ?? "BlinkyBot 需要自己的一个组件，但没有找到。"
        return CauseCopy(
            title: "BlinkyBot 缺少一个组件",
            summary: summary,
            hint: "请重新安装 BlinkyBot。如果是从源码运行，请先重新构建界面和引擎，然后再试。"
        )
    case .portInUse(let port):
        let summary = port.map { "别的程序正在使用端口 \($0)，BlinkyBot 没有动它。" }
            ?? "别的程序正在使用 BlinkyBot 需要的端口，BlinkyBot 没有动它。"
        return CauseCopy(
            title: "端口已被占用",
            summary: summary,
            hint: "请退出占用该端口的程序，或在设置里换一个端口，然后再试。"
        )
    case .permission:
        return CauseCopy(
            title: "BlinkyBot 无法使用它的文件夹",
            summary: "BlinkyBot 无法读写这台 Mac 上的数据。",
            hint: "请确认当前账户可以使用「应用程序支持」里的 BlinkyBot 文件夹，然后再试。"
        )
    case .missingNode:
        return CauseCopy(
            title: "找不到 Node",
            summary: "BlinkyBot 找不到用来启动的 Node。",
            hint: "安装版应用自带 Node。从源码运行需要 Node 22，或在设置里填写 Node 的路径。"
        )
    case .missingBuild:
        return CauseCopy(
            title: "本地服务还没有构建好",
            summary: "运行本地服务所需的文件不在。",
            hint: "从源码运行时，请先构建引擎和界面，然后再试。安装版请重新安装。"
        )
    case .timedOut:
        return CauseCopy(
            title: "本地服务启动超时",
            summary: "本地服务在 30 秒后还没有准备好。",
            hint: "请再试一次。如果一直这样，请复制诊断信息。"
        )
    case .exited(let role, _):
        let name = ShellCopy.serviceName(.chinese, role: role)
        return CauseCopy(
            title: "本地服务已停止",
            summary: "\(name)在启动过程中退出了。",
            hint: "请再试一次。如果每次都退出，请复制诊断信息。"
        )
    case .configuration:
        return CauseCopy(
            title: "端口设置需要改一下",
            summary: "界面和引擎需要两个不同的端口，并且都要在 1 到 65535 之间。",
            hint: "请在设置里修改端口，退出 BlinkyBot 后再打开。"
        )
    case .other:
        return CauseCopy(
            title: "BlinkyBot 没有启动成功",
            summary: "本地服务没有启动。",
            hint: "请再试一次。如果一直失败，请复制诊断信息。"
        )
    }
}

private func failureLogLines(
    failure: RuntimeFailure,
    engineLog: String,
    uiLog: String,
    language: ShellLanguage,
    limit: Int
) -> [String] {
    var engine = engineLog
    var ui = uiLog
    if engine.isEmpty && ui.isEmpty {
        switch failure {
        case .exited(let role, _, let tail):
            if role.lowercased().contains("compose") || role.lowercased() == "ui" {
                ui = tail
            } else {
                engine = tail
            }
        case .spawn(let detail):
            ui = detail
        default:
            break
        }
    }
    let engineLabel = language == .chinese ? "引擎" : "engine"
    let uiLabel = language == .chinese ? "界面" : "compose"
    let engineLines = relevantLogLines(engine, limit: limit).map { "[\(engineLabel)] \($0)" }
    let uiLines = relevantLogLines(ui, limit: limit).map { "[\(uiLabel)] \($0)" }
    let ordered: [String]
    switch failure {
    case .exited(let role, _, _) where role.lowercased().contains("engine"):
        ordered = uiLines + engineLines
    default:
        ordered = engineLines + uiLines
    }
    return Array(ordered.suffix(limit))
}

private func relevantLogLines(_ text: String, limit: Int) -> [String] {
    let lines = text.split(whereSeparator: \.isNewline).compactMap { raw -> String? in
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let redacted = truncateLine(redactSensitive(String(trimmed)))
        return redacted.isEmpty ? nil : redacted
    }
    return Array(lines.suffix(limit))
}

private func truncateLine(_ line: String, maxCharacters: Int = 400) -> String {
    guard line.count > maxCharacters else { return line }
    return String(line.prefix(maxCharacters)) + "…"
}

private enum ModuleClue {
    case named(String)
    case unnamed
}

private func moduleClue(in text: String) -> ModuleClue? {
    let patterns = [
        #"(?i)cannot find module ['"`]([^'"`]+)['"`]"#,
        #"(?i)cannot find package ['"`]([^'"`]+)['"`]"#,
    ]
    for pattern in patterns {
        if let name = firstMatch(pattern, in: text) {
            let display = displayModuleName(name)
            if !display.isEmpty {
                return .named(display)
            }
        }
    }
    if text.range(of: "MODULE_NOT_FOUND", options: .caseInsensitive) != nil
        || text.range(of: "ERR_MODULE_NOT_FOUND", options: .caseInsensitive) != nil {
        return .unnamed
    }
    return nil
}

private func displayModuleName(_ raw: String) -> String {
    var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if let range = name.range(of: "node_modules/") {
        name = String(name[range.upperBound...])
    }
    if name.hasPrefix("@") {
        let parts = name.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        if parts.count >= 2 {
            return parts[0] + "/" + parts[1]
        }
    }
    if name.contains("/") || name.contains("\\") {
        let parts = name.split(whereSeparator: { $0 == "/" || $0 == "\\" }).map(String.init)
        return parts.last ?? name
    }
    return name
}

private enum PortClue {
    case port(Int)
    case unspecified
}

private func portConflict(in text: String) -> PortClue? {
    let lower = text.lowercased()
    let mentions = lower.contains("eaddrinuse")
        || lower.contains("address already in use")
        || lower.contains("already in use")
    guard mentions else { return nil }
    let patterns = [
        #"(?i)(?:eaddrinuse|address already in use)[^\n]*:(\d{2,5})\b"#,
        #"(?i)\bport\s*[:=]\s*(\d{2,5})\b"#,
    ]
    for pattern in patterns {
        if let raw = firstMatch(pattern, in: text), let port = Int(raw), (1...65535).contains(port) {
            return .port(port)
        }
    }
    return .unspecified
}

private func mentionsPermission(_ text: String) -> Bool {
    let lower = text.lowercased()
    return lower.contains("eacces")
        || lower.contains("eperm")
        || lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("not permitted")
}

private func causeToken(_ cause: ServiceFailureCause) -> String {
    switch cause {
    case .missingModule: return "missing-module"
    case .portInUse: return "port-in-use"
    case .permission: return "permission"
    case .missingNode: return "missing-node"
    case .missingBuild: return "missing-build"
    case .timedOut: return "timed-out"
    case .exited: return "exited"
    case .configuration: return "configuration"
    case .other: return "other"
    }
}

private func statusDot(_ status: ServiceMenuStatus) -> ServiceStatusDot {
    switch status {
    case .running: return .green
    case .starting: return .orange
    case .stopped: return .gray
    case .error: return .red
    }
}

private func capitalized(_ text: String) -> String {
    guard let first = text.first else { return text }
    return first.uppercased() + text.dropFirst()
}

private func firstMatch(_ pattern: String, in text: String) -> String? {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
    let range = NSRange(text.startIndex..., in: text)
    guard let match = regex.firstMatch(in: text, options: [], range: range), match.numberOfRanges > 1,
          let capture = Range(match.range(at: 1), in: text) else {
        return nil
    }
    return String(text[capture])
}

private func replace(_ pattern: String, in text: String, with template: String) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return text }
    let range = NSRange(text.startIndex..., in: text)
    return regex.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: template)
}
