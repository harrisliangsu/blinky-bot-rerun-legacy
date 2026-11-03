// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

struct LoginItemSettingsView: View {
    @State private var enabled = false
    @State private var message: String?

    private var language: ShellLanguage { .current }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ShellCopy.loginHeading(language))
                .font(.headline)
            Toggle(ShellCopy.loginToggle(language), isOn: $enabled)
                .onChange(of: enabled) { _, newValue in
                    apply(newValue)
                }
            Text(ShellCopy.loginHelp(language))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let message {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear {
            enabled = LoginItem.isEnabled
        }
    }

    private func apply(_ enabled: Bool) {
        guard enabled != LoginItem.isEnabled else { return }
        do {
            try LoginItem.setEnabled(enabled)
            message = nil
        } catch {
            message = ShellCopy.loginFailed(language)
            if self.enabled != LoginItem.isEnabled {
                self.enabled = LoginItem.isEnabled
            }
        }
    }
}
#endif
