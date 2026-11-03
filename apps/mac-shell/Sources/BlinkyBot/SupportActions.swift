// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import AppKit

enum SupportActions {
    static func copyToPasteboard(_ text: String) {
        let board = NSPasteboard.general
        board.clearContents()
        board.setString(text, forType: .string)
    }

    static func openLogs(preferredDirectory: String?) {
        let path = preferredDirectory ?? defaultLogsDirectory()
        let url = URL(fileURLWithPath: path, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.open(url)
    }

    static func defaultLogsDirectory() -> String {
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.path
            ?? childPath(NSHomeDirectory(), "Library/Application Support")
        return SupportLayout.resolve(root: SupportLayout.defaultRoot(applicationSupport: applicationSupport)).logsDir
    }
}
#endif
