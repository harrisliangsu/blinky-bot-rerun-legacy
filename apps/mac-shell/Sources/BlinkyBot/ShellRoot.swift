// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

/// Covers Compose while first-run setup is open. A failed local service stays
/// visible so the error view is not hidden behind the cover.
struct ShellRoot: View {
    @EnvironmentObject private var onboarding: OnboardingModel
    @EnvironmentObject private var supervisor: ProcessSupervisor

    private var coverSetup: Bool {
        onboarding.isShowing && supervisor.phase != .failed
    }

    var body: some View {
        ZStack {
            ContentView()
                .allowsHitTesting(!coverSetup)
                .accessibilityHidden(coverSetup)
            if coverSetup {
                OnboardingScreen()
            }
        }
        .toolbar(coverSetup ? .hidden : .automatic, for: .windowToolbar)
        .preferredColorScheme(onboarding.colorScheme)
    }
}
#endif
