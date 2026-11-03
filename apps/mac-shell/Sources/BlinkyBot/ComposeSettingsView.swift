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
            Text("This window opens \(model.address.absoluteString).")
                .font(.callout)
            HStack {
                Button("Save and reload", action: saveIfValid)
                    .disabled(ComposeURL.parse(model.draft) == nil)
                Button("Clear saved URL", action: model.clearSavedURL)
            }
        }
        .padding(20)
        .frame(width: 460)
    }

    private var hint: String {
        if ComposeURL.parse(model.draft) == nil {
            return "Use an http or https URL with a host, such as http://127.0.0.1:3000."
        }
        return "Docker Compose publishes the web app on port 3000. The dev server (pnpm dev:ui) uses port 3050. The engine is a different process; do not put its port here."
    }

    private func saveIfValid() {
        guard ComposeURL.parse(model.draft) != nil else { return }
        model.applyDraft()
    }
}
#endif
