// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: ShellModel
    @EnvironmentObject private var browser: ComposeBrowser
    @EnvironmentObject private var supervisor: ProcessSupervisor
    @State private var loadedGeneration = 0

    var body: some View {
        Group {
            switch supervisor.presentedWindow() {
            case .error(let screen):
                ServiceErrorView(
                    screen: screen,
                    onRetry: supervisor.retry,
                    onCopy: {
                        SupportActions.copyToPasteboard(screen.diagnosticText(host: DiagnosticHostLoader.current()))
                    },
                    onOpenLogs: {
                        SupportActions.openLogs(preferredDirectory: supervisor.logsDirectory)
                    }
                )
            case .starting:
                StartingView()
            case .browser:
                browserColumn
            }
        }
        .navigationTitle("BlinkyBot")
        .task {
            supervisor.start()
        }
        .onAppear(perform: loadIfNeeded)
        .onChange(of: supervisor.readyGeneration) { _, _ in
            loadIfNeeded()
        }
        .onChange(of: model.generation) { _, _ in
            guard supervisor.phase == .external else { return }
            browser.load(model.address)
        }
        .onChange(of: browser.errorText) { _, text in
            if text != nil {
                supervisor.notePageDidFail()
            }
        }
    }

    private var browserColumn: some View {
        Group {
            if browser.errorText == nil {
                ComposeWebView(webView: browser.webView)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                PageFailedView {
                    browser.reloadPage(fallback: pageAddress)
                }
            }
        }
    }

    private var pageAddress: URL {
        if supervisor.phase == .external {
            return browser.pageURL ?? model.address
        }
        return browser.pageURL ?? supervisor.pageURL
    }

    private func loadIfNeeded() {
        guard supervisor.showsBrowser else { return }
        guard supervisor.readyGeneration != loadedGeneration else { return }
        loadedGeneration = supervisor.readyGeneration
        browser.errorText = nil
        browser.load(pageAddress)
    }
}

private struct StartingView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.small)
            Text(ShellCopy.starting(.current))
                .font(.callout)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct PageFailedView: View {
    let onReload: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(ShellCopy.pageFailedTitle(.current))
                .font(.title3)
                .multilineTextAlignment(.center)
            Text(ShellCopy.pageFailedBody(.current))
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button(ShellCopy.reload(.current), action: onReload)
        }
        .padding(24)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
#endif
