// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum RuntimePreferenceKey {
    public static let supportDir = "blinkySupportDir"
    public static let nodePath = "blinkyNodePath"
    public static let engineCWD = "blinkyEngineCWD"
    public static let uiCWD = "blinkyUICWD"
    public static let uiPort = "blinkyUIPort"
    public static let enginePort = "blinkyEnginePort"
    public static let repoRoot = "blinkyRepoRoot"
}

public enum RuntimeRole {
    public static let engine = "engine"
    public static let ui = "ui"
}

public let defaultUIPort = 3000
public let defaultEnginePort = 3001
public let readyTimeoutSeconds: TimeInterval = 30

public struct SupportLayout: Equatable {
    public var root: String
    public var engineDataDir: String
    public var localAuthDB: String
    public var apiKeyFile: String
    public var runDir: String
    public var logsDir: String
    public var enginePid: String
    public var uiPid: String
    public var engineLog: String
    public var uiLog: String

    public static func resolve(root: String) -> SupportLayout {
        let root = stripTrailingSlash(root)
        return SupportLayout(
            root: root,
            engineDataDir: childPath(root, "engine"),
            localAuthDB: childPath(root, "local-auth.sqlite"),
            apiKeyFile: childPath(root, "engine-api-key"),
            runDir: childPath(root, "run"),
            logsDir: childPath(root, "logs"),
            enginePid: childPath(root, "run/engine.pid"),
            uiPid: childPath(root, "run/ui.pid"),
            engineLog: childPath(root, "logs/engine.log"),
            uiLog: childPath(root, "logs/ui.log")
        )
    }

    public static func defaultRoot(applicationSupport: String) -> String {
        childPath(applicationSupport, "BlinkyBot")
    }

    public var directories: [String] {
        [root, engineDataDir, runDir, logsDir]
    }
}

public struct RuntimeInputs: Equatable {
    public var environment: [String: String]
    public var saved: [String: String]
    public var applicationSupport: String
    public var bundledRuntime: String?
    public var walkFrom: [String]
    public var home: String

    public init(
        environment: [String: String] = [:],
        saved: [String: String] = [:],
        applicationSupport: String,
        bundledRuntime: String? = nil,
        walkFrom: [String] = [],
        home: String
    ) {
        self.environment = environment
        self.saved = saved
        self.applicationSupport = applicationSupport
        self.bundledRuntime = bundledRuntime
        self.walkFrom = walkFrom
        self.home = home
    }
}

func firstNonEmpty(_ values: [String?]) -> String? {
    for value in values {
        guard let value else { continue }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
    }
    return nil
}

func stripTrailingSlash(_ path: String) -> String {
    var text = path
    while text.count > 1 && text.hasSuffix("/") {
        text.removeLast()
    }
    return text
}

func parentDirectory(_ path: String) -> String {
    (stripTrailingSlash(path) as NSString).deletingLastPathComponent
}

public func childPath(_ base: String, _ child: String) -> String {
    let root = stripTrailingSlash(base)
    var name = child
    while name.hasPrefix("/") {
        name.removeFirst()
    }
    return root + "/" + name
}

public func superviseEnabled(_ environment: [String: String]) -> Bool {
    switch environment["BLINKY_SUPERVISE"]?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "0", "off", "false", "no":
        return false
    default:
        return true
    }
}

public func parsePort(_ raw: String) -> Int? {
    guard let port = Int(raw), (1...65535).contains(port) else { return nil }
    return port
}

public func loopbackOrigin(port: Int) -> URL {
    URL(string: "http://127.0.0.1:\(port)")!
}

public func uiReadyURL(port: Int) -> URL {
    URL(string: "http://127.0.0.1:\(port)/api/version")!
}

public func engineReadyURL(port: Int) -> URL {
    URL(string: "http://127.0.0.1:\(port)/health")!
}
