// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum OnboardingStepID {
    public static let codex = "codex"
    public static let kimi = "kimi"
    public static let grok = "grok"
    public static let egoLite = "egoLite"
}

public enum OnboardingState: String, Equatable {
    case ready
    case needsLogin
    case needsOnboarding
    case notInstalled
}

public enum OnboardingActionKind: String, Equatable {
    case terminalInstall
    case terminalLogin
    case openURL
    case openApp
    case copyCommand
}

public struct OnboardingAction: Equatable, Identifiable {
    public var kind: OnboardingActionKind
    public var command: String?
    public var url: String?
    public var appPath: String?
    public var titleEN: String
    public var titleZH: String

    public var id: String {
        "\(kind.rawValue)|\(command ?? "")|\(url ?? "")|\(appPath ?? "")"
    }

    public init(
        kind: OnboardingActionKind,
        command: String? = nil,
        url: String? = nil,
        appPath: String? = nil,
        titleEN: String,
        titleZH: String
    ) {
        self.kind = kind
        self.command = command
        self.url = url
        self.appPath = appPath
        self.titleEN = titleEN
        self.titleZH = titleZH
    }
}

public struct OnboardingStep: Equatable, Identifiable {
    public var id: String
    public var nameEN: String
    public var nameZH: String
    public var state: OnboardingState
    public var commandText: String?
    public var detailEN: String?
    public var detailZH: String?
    public var actions: [OnboardingAction]
    public var isPlaceholder: Bool

    public init(
        id: String,
        nameEN: String,
        nameZH: String,
        state: OnboardingState,
        commandText: String? = nil,
        detailEN: String? = nil,
        detailZH: String? = nil,
        actions: [OnboardingAction] = [],
        isPlaceholder: Bool = false
    ) {
        self.id = id
        self.nameEN = nameEN
        self.nameZH = nameZH
        self.state = state
        self.commandText = commandText
        self.detailEN = detailEN
        self.detailZH = detailZH
        self.actions = actions
        self.isPlaceholder = isPlaceholder
    }
}

public struct OnboardingStatusQuery: Equatable {
    public var id: String
    public var executable: String
    public var arguments: [String]

    public init(id: String, executable: String, arguments: [String]) {
        self.id = id
        self.executable = executable
        self.arguments = arguments
    }
}

public enum OnboardingLink {
    public static let codex = "https://github.com/openai/codex"
    public static let kimi = "https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html"
    public static let grok = "https://docs.x.ai/build/cli"
    public static let egoLiteDownload = "https://lite.ego.app/download"
}

public enum OnboardingButtonTitle {
    public static let installEN = "Install in Terminal"
    public static let installZH = "在终端中安装"
    public static let loginEN = "Sign in in Terminal"
    public static let loginZH = "在终端中登录"
    public static let instructionsEN = "Install instructions"
    public static let instructionsZH = "安装说明"
    public static let downloadEN = "Download"
    public static let downloadZH = "下载"
    public static let openEgoEN = "Open ego(lite)"
    public static let openEgoZH = "打开 ego(lite)"
}

public enum OnboardingEnvironmentKey {
    public static let presentation = "BLINKY_ONBOARDING"
    public static let language = "BLINKY_ONBOARDING_LANG"
    public static let appearance = "BLINKY_ONBOARDING_APPEARANCE"
    public static let fixture = "BLINKY_ONBOARDING_FIXTURE"
    public static let showcase = "showcase"
}

public enum OnboardingDefaultsKey {
    public static let completed = "blinkyOnboardingCompleted"
}

/// Filesystem and process facts the probes read. The Mac app fills this from
/// disk; tests pass closures so a GUI `PATH` can be simulated.
public struct OnboardingSignals {
    public var home: String
    public var environment: [String: String]
    public var now: Date
    public var isExecutable: (String) -> Bool
    public var isDirectory: (String) -> Bool
    public var readText: (String) -> String?
    public var entries: (String) -> [String]
    /// Exit codes of non-interactive status commands, keyed by step id.
    /// Missing means the command was not run. `0` and `1` are authoritative
    /// for Codex; any other code falls back to the files.
    public var statusExit: [String: Int32]

    public init(
        home: String,
        environment: [String: String] = [:],
        now: Date = Date(timeIntervalSince1970: 1_800_000_000),
        isExecutable: @escaping (String) -> Bool,
        isDirectory: @escaping (String) -> Bool = { _ in false },
        readText: @escaping (String) -> String? = { _ in nil },
        entries: @escaping (String) -> [String] = { _ in [] },
        statusExit: [String: Int32] = [:]
    ) {
        self.home = onboardingNormalizedHome(home)
        self.environment = environment
        self.now = now
        self.isExecutable = isExecutable
        self.isDirectory = isDirectory
        self.readText = readText
        self.entries = entries
        self.statusExit = statusExit
    }

    public static func readingMachine(
        environment: [String: String],
        home: String,
        now: Date = Date(),
        statusExit: [String: Int32] = [:]
    ) -> OnboardingSignals {
        OnboardingSignals(
            home: home,
            environment: environment,
            now: now,
            isExecutable: onboardingFileIsExecutable,
            isDirectory: onboardingPathIsDirectory,
            readText: { onboardingReadText(at: $0) },
            entries: { path in
                (try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []
            },
            statusExit: statusExit
        )
    }
}

public func onboardingFileIsExecutable(_ path: String) -> Bool {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), !isDirectory.boolValue else {
        return false
    }
    return FileManager.default.isExecutableFile(atPath: path)
}

public func onboardingPathIsDirectory(_ path: String) -> Bool {
    var isDirectory: ObjCBool = false
    return FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue
}

public func onboardingReadText(at path: String, limit: Int = 256_000) -> String? {
    guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
    defer { try? handle.close() }
    let data = handle.readData(ofLength: limit)
    return String(data: data, encoding: .utf8)
}

func onboardingNormalizedHome(_ home: String) -> String {
    var text = home
    while text.count > 1 && text.hasSuffix("/") {
        text.removeLast()
    }
    return text
}

func onboardingChildPath(_ base: String, _ child: String) -> String {
    var root = base
    while root.count > 1 && root.hasSuffix("/") {
        root.removeLast()
    }
    var name = child
    while name.hasPrefix("/") {
        name.removeFirst()
    }
    if root == "/" {
        return "/" + name
    }
    return root + "/" + name
}

func onboardingTrimmed(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}
