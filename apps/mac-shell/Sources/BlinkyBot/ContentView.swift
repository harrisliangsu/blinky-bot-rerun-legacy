// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: ShellModel
    @EnvironmentObject private var browser: ComposeBrowser

    var body: some View {
        VStack(spacing: 0) {
            if let errorText = browser.errorText {
                HStack(alignment: .top, spacing: 12) {
                    Text(errorText)
                        .font(.callout)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Reload") {
                        browser.reloadPage(fallback: model.address)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.bar)
                Divider()
            }
            ComposeWebView(webView: browser.webView)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("BlinkyBot")
        .navigationSubtitle((browser.pageURL ?? model.address).absoluteString)
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
                    browser.reloadPage(fallback: model.address)
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Reload")
                .accessibilityLabel("Reload")

                if browser.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Loading Compose")
                }
            }
        }
        .onAppear {
            browser.load(model.address)
        }
        .onChange(of: model.generation) { _, _ in
            browser.load(model.address)
        }
    }
}
#endif
