// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyComposeURL)
import BlinkyComposeURL
#endif
import SwiftUI

@MainActor
final class ShellModel: ObservableObject {
    @Published var address: URL
    @Published var draft: String
    @Published var generation = 0

    init() {
        let resolved = ComposeURL.resolve()
        address = resolved
        draft = resolved.absoluteString
    }

    func applyDraft() {
        guard ComposeURL.saveOverride(draft) != nil else { return }
        address = ComposeURL.resolve()
        draft = address.absoluteString
        generation += 1
    }

    func clearSavedURL() {
        ComposeURL.clearOverride()
        address = ComposeURL.resolve()
        draft = address.absoluteString
        generation += 1
    }

    var environmentOverride: String? {
        let raw = ProcessInfo.processInfo.environment[ComposeURL.environmentKey]
        return ComposeURL.parse(raw)?.absoluteString
    }
}
#endif
