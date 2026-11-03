// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyOnboarding)
import BlinkyOnboarding
#endif
import AppKit

func probeOnboarding(
    environment: [String: String],
    home: String,
    makeSteps: (OnboardingSignals) -> [OnboardingStep]
) -> [OnboardingStep] {
    var signals = OnboardingSignals.readingMachine(environment: environment, home: home)
    let path = onboardingAugmentedPath(home: signals.home, path: environment["PATH"], entries: signals.entries)
    var exits: [String: Int32] = [:]
    for query in onboardingStatusQueries(signals) {
        if let code = runOnboardingStatusQuery(query, path: path, home: signals.home, environment: environment) {
            exits[query.id] = code
        }
    }
    signals.statusExit = exits
    return makeSteps(signals)
}

func runOnboardingStatusQuery(
    _ query: OnboardingStatusQuery,
    path: String,
    home: String,
    environment: [String: String]
) -> Int32? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: query.executable)
    process.arguments = query.arguments
    var childEnvironment = environment
    childEnvironment["PATH"] = path
    process.environment = childEnvironment
    if onboardingPathIsDirectory(home) {
        process.currentDirectoryURL = URL(fileURLWithPath: home, isDirectory: true)
    }
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    let finished = DispatchSemaphore(value: 0)
    process.terminationHandler = { _ in
        finished.signal()
    }
    do {
        try process.run()
    } catch {
        return nil
    }
    if finished.wait(timeout: .now() + 8) == .timedOut {
        process.terminate()
        _ = finished.wait(timeout: .now() + 2)
        return nil
    }
    guard process.terminationReason == .exit else { return nil }
    return process.terminationStatus
}

func openOnboardingTerminal(command: String, language: OnboardingLanguage) -> Bool {
    guard let script = onboardingTerminalScript(command: command, language: language) else { return false }
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("blinky-onboarding-\(UUID().uuidString).command")
    do {
        try script.write(to: url, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
        return NSWorkspace.shared.open(url)
    } catch {
        return false
    }
}

func openOnboardingLink(_ raw: String) -> Bool {
    guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
        return false
    }
    return NSWorkspace.shared.open(url)
}

func openOnboardingApp(_ path: String) -> Bool {
    guard onboardingPathIsDirectory(path) else { return false }
    return NSWorkspace.shared.open(URL(fileURLWithPath: path, isDirectory: true))
}

func focusBlinkyMainWindow() {
    NSApp.activate(ignoringOtherApps: true)
    let candidates = NSApp.windows.filter { window in
        window.isVisible && window.canBecomeKey && !onboardingIsSettingsTitle(window.title)
    }
    let wide = candidates.filter { $0.frame.width >= 640 }
    let pool = wide.isEmpty ? candidates : wide
    let window = pool.first { $0.isMainWindow } ?? pool.first
    window?.makeKeyAndOrderFront(nil)
}

private func onboardingIsSettingsTitle(_ title: String) -> Bool {
    let folded = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = folded.lowercased()
    return lower == "settings" || folded == "设置" || lower.hasSuffix(" settings") || folded.hasSuffix("设置")
}
#endif
