// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

struct OnboardingSettingsSection: View {
    @EnvironmentObject private var onboarding: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(onboarding.copy.settingsTitle)
                .font(.headline)
            Text(onboarding.copy.settingsDetail)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(onboarding.copy.settingsButton, action: onboarding.present)
        }
    }
}
#endif
