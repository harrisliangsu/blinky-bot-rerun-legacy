// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyComposeURL)
import BlinkyComposeURL
#endif
import SwiftUI
import WebKit

final class ComposeBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    @Published var isLoading = false
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var pageURL: URL?
    @Published var errorText: String?

    private var currentURL = ComposeURL.resolve()

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        configuration.applicationNameForUserAgent = "BlinkyBot/\(version)"
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        webView.setAccessibilityLabel("Compose")
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let frame = navigationAction.targetFrame
        if frame == nil || frame?.isMainFrame == true, let url = navigationAction.request.url {
            currentURL = url
        }
        decisionHandler(.allow)
    }

    private var pendingNewBot = false

    func requestNewBot() {
        pendingNewBot = true
        deliverNewBot()
    }

    private func deliverNewBot() {
        guard pendingNewBot else { return }
        let script = "try{sessionStorage.setItem('blinky.newBot','1');window.dispatchEvent(new Event('blinky-new-bot'))}catch(e){}"
        webView.evaluateJavaScript(script) { _, error in
            if error == nil {
                self.pendingNewBot = false
            }
        }
    }

    func load(_ url: URL) {
        currentURL = url
        errorText = nil
        webView.load(URLRequest(url: url))
    }

    func reloadPage(fallback: URL) {
        errorText = nil
        if webView.url == nil {
            load(fallback)
        } else {
            webView.reload()
        }
    }

    func goBack() {
        guard webView.canGoBack else { return }
        webView.goBack()
    }

    func goForward() {
        guard webView.canGoForward else { return }
        webView.goForward()
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        syncNavigation()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        pageURL = webView.url
        syncNavigation()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        deliverNewBot()
        isLoading = false
        errorText = nil
        pageURL = webView.url
        syncNavigation()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        report(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        report(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoading = false
        errorText = "The page process stopped. Reload Compose."
        syncNavigation()
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    private func report(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        isLoading = false
        errorText = "failed"
        syncNavigation()
    }

    private func syncNavigation() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }
}

struct ComposeWebView: NSViewRepresentable {
    let webView: WKWebView

    func makeNSView(context: Context) -> WKWebView {
        webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
