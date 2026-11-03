// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
#if canImport(BlinkyComposeURL)
import BlinkyComposeURL
#endif
import SwiftUI

@MainActor
final class ProcessSupervisor: ObservableObject {
    static let shared = ProcessSupervisor()

    @Published private(set) var phase: ServicePhase = .idle
    @Published private(set) var failure: RuntimeFailure?
    @Published private(set) var engineLogText = ""
    @Published private(set) var uiLogText = ""
    @Published private(set) var logsDirectory: String?
    @Published private(set) var pageURL: URL = ComposeURL.resolve()
    @Published private(set) var readyGeneration = 0

    var showsBrowser: Bool {
        phase == .ready || phase == .external
    }

    func presentedWindow() -> ServiceWindow {
        serviceWindow(
            phase: phase,
            failure: failure,
            engineLog: engineLogText,
            uiLog: uiLogText,
            language: .current
        )
    }

    private var session = LaunchSession()
    private var task: Task<Void, Never>?
    private var generation = 0
    private var support: SupportLayout?
    private var nodePath: String?

    func start() {
        guard phase == .idle || phase == .failed else { return }
        let environment = ProcessInfo.processInfo.environment
        if !superviseEnabled(environment) {
            phase = .external
            failure = nil
            pageURL = ComposeURL.resolve()
            readyGeneration += 1
            return
        }
        phase = .starting
        failure = nil
        let ticket = generation
        task = Task { [weak self] in
            await self?.run(ticket: ticket)
        }
    }

    func retry() {
        generation += 1
        task?.cancel()
        let environment = ProcessInfo.processInfo.environment
        haltChildren()
        session = LaunchSession()
        failure = nil
        if !superviseEnabled(environment) {
            phase = .external
            pageURL = ComposeURL.resolve()
            readyGeneration += 1
            return
        }
        phase = .idle
        start()
    }

    func stop() {
        generation += 1
        task?.cancel()
        haltChildren()
        session = LaunchSession()
    }

    func notePageDidFail() {
        guard phase == .ready else { return }
        guard let failure = childExitFailure() else { return }
        fail(generation, failure)
    }

    private func run(ticket: Int) async {
        let inputs = RuntimeInputsLoader.current()
        let plan: StackPlan
        switch resolveStackPlan(
            inputs,
            fileExists: { FileManager.default.fileExists(atPath: $0) },
            isExecutable: { FileManager.default.isExecutableFile(atPath: $0) }
        ) {
        case .failure(let failure):
            fail(ticket, failure)
            return
        case .success(let resolved):
            plan = resolved
        }
        guard ticket == generation else { return }
        pageURL = plan.uiOrigin
        support = plan.support
        logsDirectory = plan.support.logsDir
        nodePath = plan.nodePath

        if case .failure(let failure) = prepareSupport(plan.support) {
            fail(ticket, failure)
            return
        }
        let key: String
        switch APIKeyFile.loadOrCreate(at: plan.support.apiKeyFile) {
        case .failure(let failure):
            fail(ticket, failure)
            return
        case .success(let value):
            key = value
        }

        let choices: LaunchChoices
        switch planLaunches(
            engine: readPidState(at: plan.support.enginePid, expectedExecutable: plan.nodePath),
            ui: readPidState(at: plan.support.uiPid, expectedExecutable: plan.nodePath),
            enginePortListening: PortProbe.isListening(port: plan.enginePort),
            uiPortListening: PortProbe.isListening(port: plan.uiPort),
            enginePort: plan.enginePort,
            uiPort: plan.uiPort
        ) {
        case .failure(let failure):
            fail(ticket, failure)
            return
        case .success(let value):
            choices = value
        }

        do {
            try launch(choices.engine, plan.engineRequest(apiKey: key))
            try launch(choices.ui, plan.uiRequest(apiKey: key))
        } catch let error as LaunchError {
            session.stop(
                expectedExecutable: plan.nodePath,
                pidPaths: [plan.support.enginePid, plan.support.uiPid],
                grace: 5
            )
            fail(ticket, runtimeFailure(error))
            return
        } catch {
            fail(ticket, .spawn(error.localizedDescription))
            return
        }

        let started = Date()
        var announcedReady = false
        while ticket == generation && !Task.isCancelled {
            if !announcedReady {
                let uiBody = await fetch(uiReadyURL(port: plan.uiPort))
                let engineBody = await fetch(engineReadyURL(port: plan.enginePort))
                let outcome = pollOutcome(
                    elapsed: Date().timeIntervalSince(started),
                    timeout: readyTimeoutSeconds,
                    uiReady: uiBody.map { ReadyBody.composeVersion(status: $0.status, body: $0.body) } ?? false,
                    engineReady: engineBody.map { ReadyBody.engineHealth(status: $0.status, body: $0.body) } ?? false,
                    engineRunning: session.isRunning(role: RuntimeRole.engine),
                    uiRunning: session.isRunning(role: RuntimeRole.ui),
                    engineCode: session.exitCode(role: RuntimeRole.engine) ?? 0,
                    uiCode: session.exitCode(role: RuntimeRole.ui) ?? 0,
                    engineLogTail: logTail(readLogFile(plan.support.engineLog)),
                    uiLogTail: logTail(readLogFile(plan.support.uiLog))
                )
                switch outcome {
                case .ready:
                    guard ticket == generation else { return }
                    phase = .ready
                    failure = nil
                    readyGeneration += 1
                    announcedReady = true
                case .keepWaiting:
                    try? await Task.sleep(nanoseconds: 250_000_000)
                case .timedOut:
                    fail(ticket, .timedOut(engineLog: plan.support.engineLog, uiLog: plan.support.uiLog))
                    return
                case .exited(let role, let code, let tail):
                    fail(ticket, .exited(role: role, code: code, logTail: tail))
                    return
                }
            } else {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard ticket == generation, !Task.isCancelled else { return }
                if let failure = childExitFailure() {
                    fail(ticket, failure)
                    return
                }
            }
        }
    }

    private func launch(_ choice: LaunchChoice, _ request: SpawnRequest) throws {
        switch choice {
        case .adopt(let pid):
            session.track(role: request.role, pid: pid, pidPath: request.pidPath)
        case .spawn:
            try session.spawn(request)
        case .portBusy:
            break
        }
    }

    private func childExitFailure() -> RuntimeFailure? {
        if !session.isRunning(role: RuntimeRole.engine) {
            let code = session.exitCode(role: RuntimeRole.engine) ?? 0
            return .exited(role: "The engine", code: code, logTail: "")
        }
        if !session.isRunning(role: RuntimeRole.ui) {
            let code = session.exitCode(role: RuntimeRole.ui) ?? 0
            return .exited(role: "Compose", code: code, logTail: "")
        }
        return nil
    }

    private func fail(_ ticket: Int, _ failure: RuntimeFailure) {
        guard ticket == generation else { return }
        captureLogs()
        self.failure = failure
        phase = .failed
    }

    private func haltChildren() {
        let paths = [support?.enginePid, support?.uiPid].compactMap { $0 }
        session.stop(expectedExecutable: nodePath, pidPaths: paths, grace: 5)
    }

    private func captureLogs() {
        guard let support else { return }
        logsDirectory = support.logsDir
        engineLogText = readLogFile(support.engineLog)
        uiLogText = readLogFile(support.uiLog)
    }

    private func fetch(_ url: URL) async -> (status: Int, body: String)? {
        var request = URLRequest(url: url, timeoutInterval: 2)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return nil }
            return (http.statusCode, String(data: data, encoding: .utf8) ?? "")
        } catch {
            return nil
        }
    }

    private func readLogFile(_ path: String) -> String {
        guard let handle = FileHandle(forReadingAtPath: path) else { return "" }
        defer { handle.closeFile() }
        let maxBytes: UInt64 = 65_536
        let end = handle.seekToEndOfFile()
        let start = end > maxBytes ? end - maxBytes : 0
        handle.seek(toFileOffset: start)
        let data = handle.readDataToEndOfFile()
        var text = String(decoding: data, as: UTF8.self)
        if start > 0, let newline = text.firstIndex(of: "\n") {
            text = String(text[text.index(after: newline)...])
        }
        return text
    }
}

enum RuntimeInputsLoader {
    static func current() -> RuntimeInputs {
        let environment = ProcessInfo.processInfo.environment
        let defaults = UserDefaults.standard
        var saved: [String: String] = [:]
        for key in [
            RuntimePreferenceKey.supportDir,
            RuntimePreferenceKey.nodePath,
            RuntimePreferenceKey.engineCWD,
            RuntimePreferenceKey.uiCWD,
            RuntimePreferenceKey.uiPort,
            RuntimePreferenceKey.enginePort,
            RuntimePreferenceKey.repoRoot,
        ] {
            if let value = defaults.string(forKey: key) {
                saved[key] = value
            }
        }
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.path
            ?? childPath(NSHomeDirectory(), "Library/Application Support")
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("runtime", isDirectory: true).path
        let bundledRuntime = bundled.flatMap { FileManager.default.fileExists(atPath: $0) ? $0 : nil }
        return RuntimeInputs(
            environment: environment,
            saved: saved,
            applicationSupport: applicationSupport,
            bundledRuntime: bundledRuntime,
            walkFrom: [
                FileManager.default.currentDirectoryPath,
                Bundle.main.bundlePath,
                #filePath,
            ],
            home: NSHomeDirectory()
        )
    }
}

@MainActor
final class BlinkyAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        ProcessSupervisor.shared.start()
    }

    // The Dock icon stays after the window closes. BlinkyBot is a windowed app, so a
    // missing Dock icon would look like it had quit while the local service kept running.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            NotificationCenter.default.post(name: .blinkyOpenMainWindow, object: nil)
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        ProcessSupervisor.shared.stop()
    }
}
#endif
