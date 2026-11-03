// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

struct UpdateSettingsView: View {
    @State private var checksAutomatically = AppUpdate.shared.checksAutomatically

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Updates")
                .font(.headline)
            Text(versionLine)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            Toggle("Check for updates automatically", isOn: $checksAutomatically)
                .onChange(of: checksAutomatically) { _, newValue in
                    AppUpdate.shared.checksAutomatically = newValue
                }
            Text("BlinkyBot looks for a new version about every 12 hours. There is no beta channel. An update is the full app, and BlinkyBot stops the local engine and Compose before it installs and relaunches.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Check for Updates…") {
                AppUpdate.shared.check()
            }
                .disabled(!AppUpdate.shared.canCheck)
            if !AppUpdate.shared.canCheck {
                Text("Automatic updates run from the installed BlinkyBot app. A development build does not check.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .blinkyUpdatesDidChange)) { _ in
            checksAutomatically = AppUpdate.shared.checksAutomatically
        }
    }

    private var versionLine: String {
        let version = AppUpdate.shared.version
        if version.isEmpty { return "BlinkyBot" }
        return "BlinkyBot \(version)"
    }
}
#endif
