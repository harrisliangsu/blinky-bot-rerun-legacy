// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum EgoLiteReadiness: String, Equatable, Sendable {
    case ready
    case needsOnboarding
    case notInstalled
}

public struct EgoLiteStatus: Equatable, Sendable {
    public var appPath: String?
    public var cliPath: String?
    public var onboarded: Bool
    public var readiness: EgoLiteReadiness

    public init(appPath: String?, cliPath: String?, onboarded: Bool, readiness: EgoLiteReadiness) {
        self.appPath = appPath
        self.cliPath = cliPath
        self.onboarded = onboarded
        self.readiness = readiness
    }
}

/// Looks up ego(lite) for Settings and for a first-run onboarding step.
/// `onboarded` means `ego-browser` is executable. The app registers that command during onboarding, usually at `~/.local/bin`.
public enum EgoLiteDetection {
    public static let appBundleName = "ego lite.app"
    public static let cliName = "ego-browser"
    public static let website = "https://lite.ego.app/"

    public static func appCandidates(home: String) -> [String] {
        [
            "/Applications/" + appBundleName,
            childPath(childPath(home, "Applications"), appBundleName),
        ]
    }

    public static func detect(
        home: String,
        path: String,
        fileExists: (String) -> Bool,
        isExecutable: (String) -> Bool
    ) -> EgoLiteStatus {
        let appPath = appCandidates(home: home).first(where: fileExists)
        var dirs = path.split(separator: ":").map(String.init)
        dirs.append(childPath(home, ".local/bin"))
        var cliPath: String?
        var seen = Set<String>()
        for dir in dirs {
            if !seen.insert(dir).inserted { continue }
            let candidate = childPath(dir, cliName)
            if isExecutable(candidate) {
                cliPath = candidate
                break
            }
        }
        let onboarded = cliPath != nil
        let readiness: EgoLiteReadiness
        if onboarded {
            readiness = .ready
        } else if appPath != nil {
            readiness = .needsOnboarding
        } else {
            readiness = .notInstalled
        }
        return EgoLiteStatus(appPath: appPath, cliPath: cliPath, onboarded: onboarded, readiness: readiness)
    }

    public static func installScriptCandidates(resourcePath: String?) -> [String] {
        guard let resourcePath, !resourcePath.isEmpty else { return [] }
        let root = resourcePath.hasSuffix("/") ? String(resourcePath.dropLast()) : resourcePath
        return [
            childPath(root, "runtime/engine/assets/skills/ego-browser/scripts/install.sh"),
            childPath(root, "ego-lite-install.sh"),
        ]
    }

    public static func locateInstallScript(candidates: [String], isFile: (String) -> Bool) -> String? {
        candidates.first(where: isFile)
    }
}
