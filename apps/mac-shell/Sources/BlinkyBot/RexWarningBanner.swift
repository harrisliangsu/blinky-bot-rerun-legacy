// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

struct RexWarningBanner: View {
    var supportRoot: String
    @State private var code = ""
    @State private var dismissed = ""
    private let languages = Locale.preferredLanguages

    var body: some View {
        Group {
            if !code.isEmpty && code != dismissed {
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 12) {
                        Text(message)
                            .font(.callout)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Button(RexCopy.string(.dismiss, preferredLanguages: languages)) {
                            dismissed = code
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.bar)
                    Divider()
                }
            }
        }
        .task(id: supportRoot) { await poll() }
    }

    private var message: String {
        switch code {
        case "rex-closed-early":
            return RexCopy.string(.closedEarly, preferredLanguages: languages)
        case "rex-not-installed":
            return RexCopy.string(.turnedOff, preferredLanguages: languages)
        default:
            return RexCopy.string(.launchFailed, preferredLanguages: languages)
        }
    }

    func poll() async {
        let path = RexWatchStore.warningPath(supportRoot)
        while !Task.isCancelled {
            let log = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
            let next = RexWatchStore.latestWarningCode(in: log) ?? ""
            if next != code { code = next }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
    }
}
#endif
