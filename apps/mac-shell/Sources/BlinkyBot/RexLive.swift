// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif

enum RexLive {
    static func status(home: String) async -> RexStatus {
        let environment = ProcessInfo.processInfo.environment
        let shell = environment["SHELL"] ?? "/bin/zsh"
        let login = await Task.detached(priority: .userInitiated) {
            RexPath.runLoginShell(shell: shell)
        }.value
        let path = RexPath.searchPath(loginPath: login, processPath: environment["PATH"] ?? "", home: home)
        let applications = (try? FileManager.default.contentsOfDirectory(atPath: "/Applications")) ?? []
        let userApplications = (try? FileManager.default.contentsOfDirectory(atPath: childPath(home, "Applications"))) ?? []
        let found = RexDetection.detect(
            home: home,
            path: path,
            candidates: RexDetection.candidateApps(home: home, applicationNames: applications, userApplicationNames: userApplications),
            fileExists: { FileManager.default.fileExists(atPath: $0) },
            isExecutable: { FileManager.default.isExecutableFile(atPath: $0) },
            readBundleIdentifier: { bundleIdentifier(at: $0) }
        )
        guard found.readiness == .ready, let cli = found.cliPath else { return found }
        let versionOk = await Task.detached(priority: .userInitiated) {
            versionSucceeds(cli)
        }.value
        return RexDetection.withVersion(found, versionOk: versionOk)
    }

    static func versionSucceeds(_ cli: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cli)
        process.arguments = ["version"]
        process.standardOutput = Pipe()
        process.standardError = FileHandle.nullDevice
        var environment = ProcessInfo.processInfo.environment
        environment.removeValue(forKey: "REX_SERVER")
        process.environment = environment
        do {
            try process.run()
        } catch {
            return false
        }
        let deadline = Date().addingTimeInterval(5)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
        if process.isRunning {
            process.terminate()
            return false
        }
        return process.terminationStatus == 0
    }

    static func bundleIdentifier(at app: String) -> String? {
        let plist = childPath(app, "Contents/Info.plist")
        guard let data = FileManager.default.contents(atPath: plist) else { return nil }
        if let object = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
           let identifier = object["CFBundleIdentifier"] as? String {
            return identifier
        }
        guard let text = String(data: data, encoding: .utf8) else { return nil }
        return RexDetection.bundleIdentifier(inPlist: text)
    }

    static func supportRoot() -> String {
        let environment = ProcessInfo.processInfo.environment
        var saved: [String: String] = [:]
        if let value = UserDefaults.standard.string(forKey: RuntimePreferenceKey.supportDir) {
            saved[RuntimePreferenceKey.supportDir] = value
        }
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.path
            ?? childPath(NSHomeDirectory(), "Library/Application Support")
        return RexWatchStore.supportRoot(environment: environment, saved: saved, applicationSupport: applicationSupport)
    }
}
#endif
