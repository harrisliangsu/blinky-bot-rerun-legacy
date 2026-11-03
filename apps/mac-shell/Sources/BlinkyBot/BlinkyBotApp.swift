// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

@main
struct BlinkyBotApp: App {
    @StateObject private var model = ShellModel()
    @StateObject private var browser = ComposeBrowser()

    var body: some Scene {
        WindowGroup("BlinkyBot") {
            ContentView()
                .environmentObject(model)
                .environmentObject(browser)
                .frame(minWidth: 720, minHeight: 480)
        }
        .defaultSize(width: 1200, height: 800)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About BlinkyBot") {
                    AboutBlinkyBot.show()
                }
            }
            CommandMenu("Compose") {
                Button("Back") { browser.goBack() }
                    .keyboardShortcut("[", modifiers: .command)
                    .disabled(!browser.canGoBack)
                Button("Forward") { browser.goForward() }
                    .keyboardShortcut("]", modifiers: .command)
                    .disabled(!browser.canGoForward)
                Button("Reload") { browser.reloadPage(fallback: model.address) }
                    .keyboardShortcut("r")
                Divider()
                Button("Open configured URL") { browser.load(model.address) }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }

        Settings {
            ComposeSettingsView()
                .environmentObject(model)
        }
    }
}
#else
@main
enum BlinkyBotMain {
    static func main() {
        FileHandle.standardError.write(Data(
            "BlinkyBot is a macOS app and does not run on this OS. See apps/mac-shell/README.md\n".utf8
        ))
        exit(1)
    }
}
#endif
