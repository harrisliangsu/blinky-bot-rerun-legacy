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

    enum Phase: Equatable {
        case idle
        case starting
        case ready
        case failed
        case external
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var failureText: String?
    @Published private(set) var pageURL: URL = ComposeURL.resolve()

    var showsBrowser: Bool {
        phase == .ready || phase == .external
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
            failureText = nil
            pageURL = ComposeURL.resolve()
            return
        }
        phase = .starting
        failureText = nil
        let ticket = generation
        task = Task { [weak self] in
            await self?.run(ticket: ticket)
        }
    }

    func retry() {
        generation += 1
        task?.cancel()
        phase = .idle
        failureText = nil
        session = LaunchSession()
        start()
    }

    func stop() {
        generation += 1
        task?.cancel()
        let paths = [support?.enginePid, support?.uiPid].compactMap { $0 }
        session.stop(expectedExecutable: nodePath, pidPaths: paths, grace: 5)
        session = LaunchSession()
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
            fail(ticket, failure.bannerText)
            return
        case .success(let resolved):
            plan = resolved
        }
        guard ticket == generation else { return }
        pageURL = plan.uiOrigin
        support = plan.support
        nodePath = plan.nodePath

        if case .failure(let failure) = prepareSupport(plan.support) {
            fail(ticket, failure.bannerText)
            return
        }
        let key: String
        switch APIKeyFile.loadOrCreate(at: plan.support.apiKeyFile) {
        case .failure(let failure):
            fail(ticket, failure.bannerText)
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
            fail(ticket, failure.bannerText)
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
            fail(ticket, error.bannerText)
            return
        } catch {
            fail(ticket, error.localizedDescription)
            return
        }

        let started = Date()
        while ticket == generation && !Task.isCancelled {
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
                engineLogTail: logTail(readText(plan.support.engineLog)),
                uiLogTail: logTail(readText(plan.support.uiLog))
            )
            switch outcome {
            case .ready:
                guard ticket == generation else { return }
                phase = .ready
                failureText = nil
                return
            case .keepWaiting:
                try? await Task.sleep(nanoseconds: 250_000_000)
            case .timedOut:
                fail(ticket, RuntimeFailure.timedOut(engineLog: plan.support.engineLog, uiLog: plan.support.uiLog).bannerText)
                return
            case .exited(let role, let code, let tail):
                fail(ticket, RuntimeFailure.exited(role: role, code: code, logTail: tail).bannerText)
                return
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

    private func fail(_ ticket: Int, _ text: String) {
        guard ticket == generation else { return }
        phase = .failed
        failureText = text
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

    private func readText(_ path: String) -> String {
        (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
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
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        ProcessSupervisor.shared.stop()
    }
}
#endif
