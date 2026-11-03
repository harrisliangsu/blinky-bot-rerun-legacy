// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
import AppKit

enum AboutBlinkyBot {
    static func show() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let credits = NSAttributedString(
            string: """
            BlinkyBot starts the local engine and Compose on this Mac, then loads Compose.

            Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only). The license text is the LICENSE file in the BlinkyBot repository.

            A fork of Rerun.
            """,
            attributes: [
                .font: NSFont.systemFont(ofSize: 11),
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: paragraph,
            ]
        )
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "BlinkyBot",
            .applicationVersion: version,
            .credits: credits,
        ])
    }
}
#endif
