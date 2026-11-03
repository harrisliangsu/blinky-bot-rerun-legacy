// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum RexReadiness: String, Equatable, Sendable {
    case ready
    case notInstalled
    case appOnly
    case cliOnly
    case versionFailed
}

public struct RexStatus: Equatable, Sendable {
    public var appPath: String?
    public var cliPath: String?
    public var readiness: RexReadiness

    public init(appPath: String?, cliPath: String?, readiness: RexReadiness) {
        self.appPath = appPath
        self.cliPath = cliPath
        self.readiness = readiness
    }
}

public enum RexDetection {
    public static let featureMarker = "blinky-rex-watch"
    public static let bundleIdentifier = "com.superlogical.rex"
    public static let appBundleNames = ["Rex.app", "Rex Beta.app"]
    public static let cliName = "rex"
    public static let website = "https://www.superlogical.com/rex/"
    // Beta builds put `rex` inside the app. The docs name Rex.app and the command, not this helper path.
    public static let bundledCliRelativePath = "Contents/Helpers/Rex Server.rex/Contents/MacOS/rex"

    public static func standardAppCandidates(home: String) -> [String] {
        appBundleNames.flatMap { name in
            ["/Applications/" + name, childPath(childPath(home, "Applications"), name)]
        }
    }

    public static func candidateApps(home: String, applicationNames: [String], userApplicationNames: [String]) -> [String] {
        var paths = standardAppCandidates(home: home)
        for name in applicationNames where name.hasSuffix(".app") {
            paths.append("/Applications/" + name)
        }
        let userRoot = childPath(home, "Applications")
        for name in userApplicationNames where name.hasSuffix(".app") {
            paths.append(childPath(userRoot, name))
        }
        var seen = Set<String>()
        var unique: [String] = []
        for path in paths where seen.insert(path).inserted {
            unique.append(path)
        }
        return unique
    }

    public static func bundledCli(appPath: String) -> String {
        childPath(appPath, bundledCliRelativePath)
    }

    public static func bundleIdentifier(inPlist xml: String) -> String? {
        guard let key = xml.range(of: "<key>CFBundleIdentifier</key>") else { return nil }
        let rest = xml[key.upperBound...]
        guard let open = rest.range(of: "<string>"), let close = rest.range(of: "</string>") else { return nil }
        let between = rest[..<open.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
        if !between.isEmpty { return nil }
        return String(rest[open.upperBound..<close.lowerBound])
    }

    public static func detect(
        home: String,
        path: String,
        candidates: [String],
        fileExists: (String) -> Bool,
        isExecutable: (String) -> Bool,
        readBundleIdentifier: (String) -> String?
    ) -> RexStatus {
        let appPath = candidates.first { acceptApp($0, fileExists: fileExists, readBundleIdentifier: readBundleIdentifier) }
        var cliPath: String?
        if let appPath {
            let bundled = bundledCli(appPath: appPath)
            if isExecutable(bundled) {
                cliPath = bundled
            }
        }
        if cliPath == nil {
            cliPath = searchExecutable(name: cliName, path: path, home: home, isExecutable: isExecutable)
        }
        let readiness: RexReadiness
        if appPath != nil && cliPath != nil {
            readiness = .ready
        } else if appPath != nil {
            readiness = .appOnly
        } else if cliPath != nil {
            readiness = .cliOnly
        } else {
            readiness = .notInstalled
        }
        return RexStatus(appPath: appPath, cliPath: cliPath, readiness: readiness)
    }

    public static func withVersion(_ status: RexStatus, versionOk: Bool) -> RexStatus {
        guard status.readiness == .ready, !versionOk else { return status }
        return RexStatus(appPath: status.appPath, cliPath: status.cliPath, readiness: .versionFailed)
    }

    private static func acceptApp(
        _ path: String,
        fileExists: (String) -> Bool,
        readBundleIdentifier: (String) -> String?
    ) -> Bool {
        guard fileExists(path) else { return false }
        let name = (path as NSString).lastPathComponent
        if let identifier = readBundleIdentifier(path) {
            return identifier == bundleIdentifier
        }
        return appBundleNames.contains(name)
    }
}

public enum RexPath {
    public static func searchPath(loginPath: String?, processPath: String, home: String) -> String {
        var dirs: [String] = []
        if let loginPath {
            dirs.append(contentsOf: loginPath.split(separator: ":").map(String.init))
        }
        dirs.append(contentsOf: processPath.split(separator: ":").map(String.init))
        dirs.append(contentsOf: extraBinDirectories(home: home))
        var seen = Set<String>()
        var unique: [String] = []
        for dir in dirs where !dir.isEmpty {
            if seen.insert(dir).inserted {
                unique.append(dir)
            }
        }
        return unique.joined(separator: ":")
    }

    public static func loginArguments(shell: String) -> [String]? {
        switch shell {
        case "/bin/zsh", "/bin/bash", "/bin/sh":
            return ["-lc", "printf %s \"$PATH\""]
        default:
            return nil
        }
    }

    #if os(macOS)
    public static func runLoginShell(shell: String) -> String? {
        guard let arguments = loginArguments(shell: shell) else { return nil }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: shell)
        process.arguments = arguments
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return nil
        }
        let deadline = Date().addingTimeInterval(2)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
        if process.isRunning {
            process.terminate()
            return nil
        }
        guard process.terminationStatus == 0 else { return nil }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let text, !text.isEmpty { return text }
        return nil
    }
    #endif
}
