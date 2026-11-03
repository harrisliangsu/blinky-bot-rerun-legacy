// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

struct ServiceErrorView: View {
    let screen: ServiceErrorScreen
    let onRetry: () -> Void
    let onCopy: () -> Void
    let onOpenLogs: () -> Void

    @State private var logsExpanded = false
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                logBox
                actions
            }
            .padding(28)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier(screen.viewIdentifier)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2)
                .foregroundStyle(.red)
                .accessibilityHidden(true)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 8) {
                Text(screen.title)
                    .font(.title2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(screen.summary)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                Text(screen.hint)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var logBox: some View {
        DisclosureGroup(isExpanded: $logsExpanded) {
            Group {
                if screen.logLines.isEmpty {
                    Text(screen.emptyLog)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ScrollView {
                        Text(screen.logText)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                    }
                    .frame(maxHeight: 220)
                    .background(.background)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.top, 8)
        } label: {
            Text(screen.logHeading)
                .font(.callout.weight(.medium))
        }
        .padding(12)
        .background(.quaternary.opacity(0.45))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityIdentifier("blinky.service-error.log")
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                actionButtons
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if copied {
                Text(screen.copiedTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        Button(screen.retryTitle, action: onRetry)
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier(screen.retryIdentifier)
        Button(screen.copyTitle) {
            onCopy()
            copied = true
        }
        .accessibilityIdentifier(screen.copyIdentifier)
        Button(screen.logsTitle, action: onOpenLogs)
            .accessibilityIdentifier(screen.logsIdentifier)
    }
}

enum DiagnosticHostLoader {
    static func current() -> DiagnosticHost {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        return DiagnosticHost(
            appVersion: version.isEmpty ? "unknown" : version,
            operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
            architecture: architecture
        )
    }

    private static var architecture: String {
        #if arch(arm64)
        "arm64"
        #elseif arch(x86_64)
        "x86_64"
        #else
        "unknown"
        #endif
    }
}
#endif
