// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public struct RexWatchFile: Codable, Equatable, Sendable {
    public var enabled: Bool
    public var bin: String?

    public init(enabled: Bool, bin: String?) {
        self.enabled = enabled
        self.bin = bin
    }
}

public enum RexWatchStore {
    public static func statePath(_ root: String) -> String {
        childPath(stripTrailingSlash(root), "rex-watch.json")
    }

    public static func warningPath(_ root: String) -> String {
        childPath(stripTrailingSlash(root), "logs/rex-watch.log")
    }

    public static func supportRoot(environment: [String: String], saved: [String: String], applicationSupport: String) -> String {
        firstNonEmpty([
            environment["BLINKY_SUPPORT_DIR"],
            saved[RuntimePreferenceKey.supportDir],
        ]) ?? SupportLayout.defaultRoot(applicationSupport: applicationSupport)
    }

    public static func file(requested: Bool, status: RexStatus) -> RexWatchFile {
        if requested, status.readiness == .ready, let bin = status.cliPath, bin.hasPrefix("/") {
            return RexWatchFile(enabled: true, bin: bin)
        }
        return RexWatchFile(enabled: false, bin: nil)
    }

    public static func publish(root: String, requested: Bool, status: RexStatus) throws {
        let directory = stripTrailingSlash(root)
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(file(requested: requested, status: status))
        try data.write(to: URL(fileURLWithPath: statePath(directory)), options: .atomic)
    }

    public static func resetWarning(root: String) {
        let path = warningPath(root)
        try? FileManager.default.createDirectory(atPath: parentDirectory(path), withIntermediateDirectories: true)
        try? Data().write(to: URL(fileURLWithPath: path), options: .atomic)
    }

    public static func latestWarningCode(in log: String) -> String? {
        let lines = log.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard let last = lines.last else { return nil }
        return last.split(separator: " ").first.map(String.init)
    }
}
