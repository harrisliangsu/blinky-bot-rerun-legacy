// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif
import ServiceManagement

enum LoginItem {
    static var isEnabled: Bool {
        if #available(macOS 13.0, *) {
            return LaunchAtLogin.isOn(serviceStatus: statusToken(SMAppService.mainApp.status))
        }
        return false
    }

    static func setEnabled(_ enabled: Bool) throws {
        guard #available(macOS 13.0, *) else { return }
        let service = SMAppService.mainApp
        if enabled {
            if service.status != .enabled {
                try service.register()
            }
        } else if service.status == .enabled {
            try service.unregister()
        }
    }

    @available(macOS 13.0, *)
    private static func statusToken(_ status: SMAppService.Status) -> String {
        switch status {
        case .enabled:
            return "enabled"
        case .notRegistered:
            return "notRegistered"
        case .requiresApproval:
            return "requiresApproval"
        case .notFound:
            return "notFound"
        @unknown default:
            return "unknown"
        }
    }
}
#endif
