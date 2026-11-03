// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import Sparkle

extension Notification.Name {
    static let blinkyUpdatesDidChange = Notification.Name("blinky.updates.didChange")
}

/// Sparkle, started only from an app bundle that carries `SUFeedURL`.
/// A `swift run` build has no feed and no framework copy, so it does not check.
@MainActor
final class AppUpdate {
    static let shared = AppUpdate()
    static let automaticChecksKey = "blinky.updates.automatic"

    private var controller: SPUStandardUpdaterController?
    private let relay = UpdaterRelay()

    var canCheck: Bool { controller != nil }

    var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }

    var checksAutomatically: Bool {
        get {
            if UserDefaults.standard.object(forKey: Self.automaticChecksKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: Self.automaticChecksKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.automaticChecksKey)
            controller?.updater.automaticallyChecksForUpdates = newValue
            NotificationCenter.default.post(name: .blinkyUpdatesDidChange, object: self)
        }
    }

    private init() {
        guard
            Bundle.main.bundleURL.pathExtension == "app",
            let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String,
            !feed.isEmpty,
            Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") != nil
        else { return }

        if UserDefaults.standard.object(forKey: Self.automaticChecksKey) == nil {
            UserDefaults.standard.set(true, forKey: Self.automaticChecksKey)
        }
        relay.owner = self
        let controller = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: relay,
            userDriverDelegate: nil
        )
        controller.updater.automaticallyChecksForUpdates = checksAutomatically
        controller.updater.automaticallyDownloadsUpdates = false
        self.controller = controller
    }

    func check() {
        controller?.updater.checkForUpdates()
    }
}

private final class UpdaterRelay: NSObject, SPUUpdaterDelegate {
    weak var owner: AppUpdate?

    func updater(_ updater: SPUUpdater, willInstallUpdate item: SUAppcastItem) {
        // The engine and Compose are child processes whose binaries live in
        // this bundle. Sparkle replaces the bundle as this process quits.
        // Stop them first so Node is not still holding those files open.
        MainActor.assumeIsolated {
            ProcessSupervisor.shared.stop()
        }
    }
}
#endif
