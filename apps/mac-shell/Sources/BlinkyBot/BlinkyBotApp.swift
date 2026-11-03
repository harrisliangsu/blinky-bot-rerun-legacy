// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import SwiftUI

@main
struct BlinkyBotApp: App {
    @NSApplicationDelegateAdaptor(BlinkyAppDelegate.self) private var appDelegate
    @StateObject private var model = ShellModel()
    @StateObject private var browser = ComposeBrowser()
    @StateObject private var supervisor = ProcessSupervisor.shared
    @StateObject private var onboarding = OnboardingModel()

    var body: some Scene {
        WindowGroup("BlinkyBot", id: "main") {
            ShellRoot()
                .environmentObject(model)
                .environmentObject(browser)
                .environmentObject(supervisor)
                .environmentObject(onboarding)
                .frame(minWidth: 720, minHeight: 480)
        }
        .defaultSize(width: 1200, height: 800)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About BlinkyBot") {
                    AboutBlinkyBot.show()
                }
            }
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") {
                    AppUpdate.shared.check()
                }
                .disabled(!AppUpdate.shared.canCheck)
            }
        }

        MenuBarExtra {
            MenuBarMenu()
        } label: {
            MenuBarGlyph()
        }
        .menuBarExtraStyle(.menu)

        Settings {
            BlinkySettingsView()
                .environmentObject(model)
                .environmentObject(onboarding)
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
