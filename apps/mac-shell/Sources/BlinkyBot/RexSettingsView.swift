// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

@MainActor
final class RexSettingsModel: ObservableObject {
    @Published var status = RexStatus(appPath: nil, cliPath: nil, readiness: .notInstalled)
    @Published var requested: Bool
    @Published var warning = ""
    @Published var removedNotice = false
    @Published var languages: [String]
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard, languages: [String] = Locale.preferredLanguages) {
        self.defaults = defaults
        self.languages = languages
        requested = defaults.bool(forKey: RuntimePreferenceKey.rexWatch)
    }

    var effective: Bool { requested && status.readiness == .ready }
    var canEnable: Bool { status.readiness == .ready }

    func text(_ key: RexCopyKey) -> String {
        RexCopy.string(key, preferredLanguages: languages)
    }

    func refresh() async {
        status = await RexLive.status(home: NSHomeDirectory())
        if requested && status.readiness != .ready {
            requested = false
            defaults.set(false, forKey: RuntimePreferenceKey.rexWatch)
            removedNotice = true
        }
        try? RexWatchStore.publish(root: RexLive.supportRoot(), requested: requested, status: status)
        loadWarning()
    }

    func setWatch(_ on: Bool) {
        Task { await applyWatch(on) }
    }

    func applyWatch(_ on: Bool) async {
        status = await RexLive.status(home: NSHomeDirectory())
        if on && status.readiness != .ready {
            requested = false
            defaults.set(false, forKey: RuntimePreferenceKey.rexWatch)
            removedNotice = true
            try? RexWatchStore.publish(root: RexLive.supportRoot(), requested: false, status: status)
            return
        }
        removedNotice = false
        requested = on
        defaults.set(on, forKey: RuntimePreferenceKey.rexWatch)
        try? RexWatchStore.publish(root: RexLive.supportRoot(), requested: requested, status: status)
    }

    private func loadWarning() {
        let log = (try? String(contentsOfFile: RexWatchStore.warningPath(RexLive.supportRoot()), encoding: .utf8)) ?? ""
        warning = RexWatchStore.latestWarningCode(in: log) ?? ""
    }

    func openWebsite() {
        guard let url = URL(string: RexDetection.website) else { return }
        NSWorkspace.shared.open(url)
    }

    var explanation: String {
        if removedNotice {
            return text(.removed)
        }
        switch status.readiness {
        case .ready:
            return text(.ready)
        case .notInstalled:
            return text(.notInstalled)
        case .appOnly:
            return text(.appOnly)
        case .cliOnly:
            return text(.cliOnly)
        case .versionFailed:
            return text(.versionFailed)
        }
    }

    var warningText: String? {
        switch warning {
        case "rex-launch-failed":
            return text(.launchFailed)
        case "rex-closed-early":
            return text(.closedEarly)
        case "rex-not-installed":
            return text(.turnedOff)
        case "":
            return nil
        default:
            return text(.launchFailed)
        }
    }
}

struct RexSettingsView: View {
    @StateObject private var model = RexSettingsModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(model.text(.section))
                    .font(.headline)
                Text(model.text(.beta))
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }
            Text(model.text(.summary))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Toggle(model.text(.title), isOn: Binding(get: { model.effective }, set: { model.setWatch($0) }))
                .toggleStyle(.switch)
                .disabled(!model.canEnable)
            Text(model.explanation)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(model.text(.localOnly))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let appPath = model.status.appPath {
                labeled(model.text(.appFound), appPath)
            }
            if let cliPath = model.status.cliPath {
                labeled(model.text(.cliFound), cliPath)
            }
            if let warning = model.warningText {
                Text(warning)
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 8) {
                Button(model.text(.openWebsite)) { model.openWebsite() }
                Button(model.text(.refresh)) { Task { await model.refresh() } }
            }
        }
        .task { await model.refresh() }
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
