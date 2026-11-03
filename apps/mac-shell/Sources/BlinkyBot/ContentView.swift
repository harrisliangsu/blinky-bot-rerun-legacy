// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: ShellModel
    @EnvironmentObject private var browser: ComposeBrowser
    @EnvironmentObject private var supervisor: ProcessSupervisor

    var body: some View {
        VStack(spacing: 0) {
            if let errorText = bannerText {
                HStack(alignment: .top, spacing: 12) {
                    Text(errorText)
                        .font(.callout)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if supervisor.phase == .failed || supervisor.failureText != nil {
                        Button("Retry", action: supervisor.retry)
                    }
                    if supervisor.showsBrowser {
                        Button("Reload") {
                            browser.reloadPage(fallback: pageAddress)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.bar)
                Divider()
            }
            if supervisor.showsBrowser {
                ComposeWebView(webView: browser.webView)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 12) {
                    if supervisor.phase == .starting || supervisor.phase == .idle {
                        ProgressView()
                            .controlSize(.small)
                        Text("Starting the local engine and Compose…")
                            .font(.callout)
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Compose is not open yet.")
                            .font(.callout)
                            .multilineTextAlignment(.center)
                    }
                    Text(pageAddress.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("BlinkyBot")
        .navigationSubtitle(pageAddress.absoluteString)
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button {
                    browser.goBack()
                } label: {
                    Image(systemName: "chevron.backward")
                }
                .disabled(!browser.canGoBack)
                .help("Back")
                .accessibilityLabel("Back")

                Button {
                    browser.goForward()
                } label: {
                    Image(systemName: "chevron.forward")
                }
                .disabled(!browser.canGoForward)
                .help("Forward")
                .accessibilityLabel("Forward")

                Button {
                    browser.reloadPage(fallback: pageAddress)
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Reload")
                .accessibilityLabel("Reload")

                if browser.isLoading || supervisor.phase == .starting {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Loading Compose")
                }
            }
        }
        .task {
            supervisor.start()
        }
        .onChange(of: supervisor.phase) { _, phase in
            guard phase == .ready || phase == .external else { return }
            browser.load(pageAddress)
        }
        .onChange(of: model.generation) { _, _ in
            guard supervisor.phase == .external else { return }
            browser.load(model.address)
        }
    }

    private var pageAddress: URL {
        if supervisor.phase == .external {
            return browser.pageURL ?? model.address
        }
        return browser.pageURL ?? supervisor.pageURL
    }

    private var bannerText: String? {
        if let failure = supervisor.failureText {
            return failure
        }
        if supervisor.showsBrowser {
            return browser.errorText
        }
        return nil
    }
}
#endif
