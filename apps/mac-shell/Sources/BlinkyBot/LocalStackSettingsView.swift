// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

struct BlinkySettingsView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ComposeSettingsView()
                Divider()
                LocalStackSettingsView()
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 520, height: 640)
    }
}

@MainActor
final class StackSettingsModel: ObservableObject {
    @Published var supportDir: String
    @Published var repoRoot: String
    @Published var nodePath: String
    @Published var engineCWD: String
    @Published var uiCWD: String
    @Published var uiPort: String
    @Published var enginePort: String

    init(defaults: UserDefaults = .standard) {
        supportDir = defaults.string(forKey: RuntimePreferenceKey.supportDir) ?? ""
        repoRoot = defaults.string(forKey: RuntimePreferenceKey.repoRoot) ?? ""
        nodePath = defaults.string(forKey: RuntimePreferenceKey.nodePath) ?? ""
        engineCWD = defaults.string(forKey: RuntimePreferenceKey.engineCWD) ?? ""
        uiCWD = defaults.string(forKey: RuntimePreferenceKey.uiCWD) ?? ""
        uiPort = defaults.string(forKey: RuntimePreferenceKey.uiPort) ?? ""
        enginePort = defaults.string(forKey: RuntimePreferenceKey.enginePort) ?? ""
    }

    var portsAreValid: Bool {
        (uiPort.trimmingCharacters(in: .whitespaces).isEmpty || parsePort(uiPort.trimmingCharacters(in: .whitespaces)) != nil)
            && (enginePort.trimmingCharacters(in: .whitespaces).isEmpty || parsePort(enginePort.trimmingCharacters(in: .whitespaces)) != nil)
    }

    func save(defaults: UserDefaults = .standard) {
        write(supportDir, key: RuntimePreferenceKey.supportDir, defaults: defaults)
        write(repoRoot, key: RuntimePreferenceKey.repoRoot, defaults: defaults)
        write(nodePath, key: RuntimePreferenceKey.nodePath, defaults: defaults)
        write(engineCWD, key: RuntimePreferenceKey.engineCWD, defaults: defaults)
        write(uiCWD, key: RuntimePreferenceKey.uiCWD, defaults: defaults)
        write(uiPort, key: RuntimePreferenceKey.uiPort, defaults: defaults)
        write(enginePort, key: RuntimePreferenceKey.enginePort, defaults: defaults)
    }

    func clear(defaults: UserDefaults = .standard) {
        supportDir = ""
        repoRoot = ""
        nodePath = ""
        engineCWD = ""
        uiCWD = ""
        uiPort = ""
        enginePort = ""
        save(defaults: defaults)
    }

    private func write(_ value: String, key: String, defaults: UserDefaults) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(trimmed, forKey: key)
        }
    }
}

struct LocalStackSettingsView: View {
    @StateObject private var settings = StackSettingsModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Local stack")
                .font(.headline)
            Text("BlinkyBot starts Compose on 127.0.0.1:3000 and the engine on 127.0.0.1:3001. Data lives in ~/Library/Application Support/BlinkyBot. Empty fields keep those defaults. Quit and open BlinkyBot again to apply a change.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            field("Data folder", text: $settings.supportDir, prompt: "Application Support/BlinkyBot")
            field("Checkout", text: $settings.repoRoot, prompt: "Repository root")
            field("Node", text: $settings.nodePath, prompt: "Path to node")
            field("Engine directory", text: $settings.engineCWD, prompt: "runtime/engine or apps/engine")
            field("Compose directory", text: $settings.uiCWD, prompt: "runtime/ui or apps/ui")
            field("Compose port", text: $settings.uiPort, prompt: "3000")
            field("Engine port", text: $settings.enginePort, prompt: "3001")
            if !settings.portsAreValid {
                Text("Ports are whole numbers from 1 to 65535.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Save overrides", action: settings.save)
                    .disabled(!settings.portsAreValid)
                Button("Use defaults", action: settings.clear)
            }
        }
    }

    private func field(_ title: String, text: Binding<String>, prompt: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.callout)
            TextField(prompt, text: text)
                .textFieldStyle(.roundedBorder)
        }
    }
}
#endif
