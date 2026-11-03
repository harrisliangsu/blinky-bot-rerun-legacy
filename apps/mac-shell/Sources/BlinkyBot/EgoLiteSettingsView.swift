// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

@MainActor
final class EgoLiteSettingsModel: ObservableObject {
    @Published var status: EgoLiteStatus
    @Published var log = ""
    @Published var installing = false
    @Published var languages: [String]
    private var installProcess: Process?

    init(languages: [String] = Locale.preferredLanguages) {
        self.languages = languages
        status = EgoLiteDetection.detect(
            home: NSHomeDirectory(),
            path: ProcessInfo.processInfo.environment["PATH"] ?? "",
            fileExists: { FileManager.default.fileExists(atPath: $0) },
            isExecutable: { FileManager.default.isExecutableFile(atPath: $0) }
        )
    }

    var scriptPath: String? {
        EgoLiteDetection.locateInstallScript(
            candidates: EgoLiteDetection.installScriptCandidates(resourcePath: Bundle.main.resourcePath),
            isFile: { FileManager.default.fileExists(atPath: $0) }
        )
    }

    func refresh() {
        status = EgoLiteDetection.detect(
            home: NSHomeDirectory(),
            path: ProcessInfo.processInfo.environment["PATH"] ?? "",
            fileExists: { FileManager.default.fileExists(atPath: $0) },
            isExecutable: { FileManager.default.isExecutableFile(atPath: $0) }
        )
    }

    func text(_ key: EgoLiteCopyKey) -> String {
        EgoLiteCopy.string(key, preferredLanguages: languages)
    }

    func install() {
        guard let script = scriptPath else {
            openWebsite()
            return
        }
        installing = true
        log = ""
        let process = Process()
        installProcess = process
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [script]
        var environment = ProcessInfo.processInfo.environment
        let path = environment["PATH"] ?? ""
        environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin" + (path.isEmpty ? "" : ":" + path)
        process.environment = environment
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self.log += text }
        }
        process.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                guard let self else { return }
                self.installing = false
                self.installProcess = nil
                pipe.fileHandleForReading.readabilityHandler = nil
                self.refresh()
                if proc.terminationStatus != 0 {
                    self.log += "\n" + self.text(.installFailed)
                }
            }
        }
        do {
            try process.run()
        } catch {
            installing = false
            installProcess = nil
            log = error.localizedDescription
        }
    }

    func openApp() {
        guard let path = status.appPath else { return }
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    func openWebsite() {
        guard let url = URL(string: EgoLiteDetection.website) else { return }
        NSWorkspace.shared.open(url)
    }
}

struct EgoLiteSettingsView: View {
    @StateObject private var model = EgoLiteSettingsModel()
    @State private var confirmInstall = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.text(.title))
                .font(.headline)
            Text(model.text(.summary))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(statusText)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            if let appPath = model.status.appPath {
                labeled(model.text(.appFound), appPath)
            } else {
                Text(model.text(.appMissing))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let cliPath = model.status.cliPath {
                labeled(model.text(.cliFound), cliPath)
            } else {
                Text(model.text(.cliMissing))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.installing || !model.log.isEmpty {
                Text(model.text(.logTitle))
                    .font(.callout)
                ScrollView {
                    Text(model.log.isEmpty ? " " : model.log)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 160)
            }
            VStack(alignment: .leading, spacing: 8) {
                Button(model.text(.install)) { confirmInstall = true }
                    .disabled(model.installing)
                if model.status.appPath != nil {
                    Button(model.text(.openApp)) { model.openApp() }
                }
                Button(model.text(.openWebsite)) { model.openWebsite() }
                Button(model.text(.refresh)) { model.refresh() }
            }
        }
        .onAppear(perform: model.refresh)
        .confirmationDialog(model.text(.confirmTitle), isPresented: $confirmInstall, titleVisibility: .visible) {
            Button(model.text(.confirmAction)) { model.install() }
            Button(model.text(.cancel), role: .cancel) {}
        } message: {
            Text(model.scriptPath == nil ? model.text(.confirmWebsite) : model.text(.confirmRun))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var statusText: String {
        switch model.status.readiness {
        case .ready:
            return model.text(.ready)
        case .needsOnboarding:
            return model.text(.needsOnboarding)
        case .notInstalled:
            return model.text(.notInstalled)
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.callout)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
#endif
