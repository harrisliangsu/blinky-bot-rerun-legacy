// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import AppKit
import SwiftUI

struct MenuBarGlyph: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Image(nsImage: MenuBarIcon.image())
            .renderingMode(.template)
            .frame(width: 18, height: 18)
            .accessibilityLabel("BlinkyBot")
            .onAppear {
                MainWindow.openHandler = { openWindow(id: "main") }
            }
            .onReceive(NotificationCenter.default.publisher(for: .blinkyOpenMainWindow)) { _ in
                MainWindow.open()
            }
    }
}

struct MenuBarMenu: View {
    @ObservedObject private var supervisor = ProcessSupervisor.shared
    @Environment(\.openWindow) private var openWindow

    private var menu: ServiceMenuModel {
        serviceMenuModel(phase: supervisor.phase, language: .current)
    }

    var body: some View {
        Button {
        } label: {
            Label {
                Text(menu.statusTitle)
            } icon: {
                Image(nsImage: StatusDot.image(menu.dot))
            }
        }
        .disabled(true)
        .accessibilityIdentifier("blinky.menu.status")

        Divider()

        Button(menu.openTitle) {
            MainWindow.open()
        }
        .accessibilityIdentifier("blinky.menu.open")

        Button(menu.restartTitle) {
            supervisor.retry()
        }
        .accessibilityIdentifier("blinky.menu.restart")

        Button(menu.logsTitle) {
            SupportActions.openLogs(preferredDirectory: supervisor.logsDirectory)
        }
        .accessibilityIdentifier("blinky.menu.logs")

        Button(menu.updatesTitle) {
            AppUpdate.shared.check()
        }
        .disabled(!AppUpdate.shared.canCheck)
        .accessibilityIdentifier("blinky.menu.updates")

        Divider()

        Button(menu.quitTitle) {
            NSApp.terminate(nil)
        }
        .accessibilityIdentifier("blinky.menu.quit")
        .onAppear {
            MainWindow.openHandler = { openWindow(id: "main") }
        }
    }
}

enum StatusDot {
    static func image(_ dot: ServiceStatusDot) -> NSImage {
        let color: NSColor
        switch dot {
        case .green: color = .systemGreen
        case .orange: color = .systemOrange
        case .gray: color = .systemGray
        case .red: color = .systemRed
        }
        let side: CGFloat = 12
        let image = NSImage(size: NSSize(width: side, height: side), flipped: false) { rect in
            color.setFill()
            NSBezierPath(ovalIn: rect.insetBy(dx: 2, dy: 2)).fill()
            return true
        }
        image.isTemplate = false
        return image
    }
}

enum MenuBarIcon {
    private static let pointSize = NSSize(width: 18, height: 18)

    static func image() -> NSImage {
        if let named = NSImage(named: "MenuBarIcon"), !named.representations.isEmpty {
            named.isTemplate = true
            named.size = pointSize
            return named
        }
        return fallback()
    }

    private static func fallback() -> NSImage {
        let source = NSImage(named: NSImage.applicationIconName) ?? NSApp.applicationIconImage
        let image = NSImage(size: pointSize, flipped: false) { rect in
            source.draw(in: rect.insetBy(dx: 1, dy: 1), from: .zero, operation: .sourceOver, fraction: 1)
            return true
        }
        image.isTemplate = true
        return image
    }
}

extension Notification.Name {
    static let blinkyOpenMainWindow = Notification.Name("blinky.openMainWindow")
}

enum MainWindow {
    static var openHandler: (() -> Void)?

    static func open() {
        NSApp.activate()
        if let window = NSApp.windows.first(where: { isMainWindow($0) && ($0.isVisible || $0.isMiniaturized) }) {
            window.deminiaturize(nil)
            window.makeKeyAndOrderFront(nil)
            return
        }
        openHandler?()
        NSApp.activate()
    }

    private static func isMainWindow(_ window: NSWindow) -> Bool {
        window.canBecomeMain && window.title == "BlinkyBot"
    }
}
#endif
