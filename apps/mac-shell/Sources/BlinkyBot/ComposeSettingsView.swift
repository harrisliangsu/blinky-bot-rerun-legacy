// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyComposeURL)
import BlinkyComposeURL
#endif
import SwiftUI

struct ComposeSettingsView: View {
    @EnvironmentObject private var model: ShellModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Compose URL")
                .font(.headline)
            TextField("http://127.0.0.1:3000", text: $model.draft)
                .textFieldStyle(.roundedBorder)
                .onSubmit(saveIfValid)
            Text(hint)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let override = model.environmentOverride {
                Text("BLINKY_COMPOSE_URL is \(override). That launch value wins until you quit and start BlinkyBot without it.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Saved page: \(model.address.absoluteString). While BlinkyBot is supervising, the window loads the Compose process it started.")
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Save and reload", action: saveIfValid)
                    .disabled(ComposeURL.parse(model.draft) == nil)
                Button("Clear saved URL", action: model.clearSavedURL)
            }
        }
    }

    private var hint: String {
        if ComposeURL.parse(model.draft) == nil {
            return "Use an http or https URL with a host, such as http://127.0.0.1:3000."
        }
        return "With supervision on, BlinkyBot opens the Compose process it started (port 3000). This field is the page when BLINKY_SUPERVISE=0. The hot-reload UI (pnpm dev:ui) uses port 3050."
    }

    private func saveIfValid() {
        guard ComposeURL.parse(model.draft) != nil else { return }
        model.applyDraft()
    }
}
#endif
