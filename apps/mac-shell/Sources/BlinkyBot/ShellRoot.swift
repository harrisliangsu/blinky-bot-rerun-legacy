// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

/// Covers Compose while first-run setup is open, without taking over the
/// supervisor. The menu-bar and crash-page work can keep editing ContentView.
struct ShellRoot: View {
    @EnvironmentObject private var onboarding: OnboardingModel

    var body: some View {
        ZStack {
            ContentView()
                .allowsHitTesting(!onboarding.isShowing)
                .accessibilityHidden(onboarding.isShowing)
            if onboarding.isShowing {
                OnboardingScreen()
            }
        }
        .toolbar(onboarding.isShowing ? .hidden : .automatic, for: .windowToolbar)
        .preferredColorScheme(onboarding.colorScheme)
    }
}
#endif
