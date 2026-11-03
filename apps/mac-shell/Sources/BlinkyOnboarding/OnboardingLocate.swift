// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

/// Directories a GUI app should search. Finder does not pass a login-shell
/// `PATH`, so Homebrew, npm globals, `~/.local/bin`, and version managers are
/// appended after the process `PATH`.
public func onboardingSearchDirectories(
    home: String,
    path: String?,
    entries: (String) -> [String]
) -> [String] {
    let root = onboardingNormalizedHome(home)
    var dirs: [String] = []
    if let path {
        for part in path.split(separator: ":", omittingEmptySubsequences: true) {
            dirs.append(String(part))
        }
    }
    dirs.append(contentsOf: [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        onboardingChildPath(root, ".local/bin"),
        onboardingChildPath(root, ".npm-global/bin"),
        onboardingChildPath(root, ".local/share/npm/bin"),
        onboardingChildPath(root, "Library/pnpm"),
        onboardingChildPath(root, "Library/pnpm/bin"),
        onboardingChildPath(root, ".local/share/pnpm"),
        onboardingChildPath(root, ".volta/bin"),
        onboardingChildPath(root, ".bun/bin"),
        onboardingChildPath(root, ".asdf/shims"),
        onboardingChildPath(root, "Library/Application Support/fnm/aliases/default/bin"),
        onboardingChildPath(root, ".fnm/aliases/default/bin"),
        onboardingChildPath(root, ".local/share/fnm/aliases/default/bin"),
    ])
    let nvmRoot = onboardingChildPath(root, ".nvm/versions/node")
    let versions = entries(nvmRoot).sorted(by: onboardingNvmNewer)
    for name in versions where !name.hasPrefix(".") {
        dirs.append(onboardingChildPath(onboardingChildPath(nvmRoot, name), "bin"))
    }
    var seen = Set<String>()
    var unique: [String] = []
    for dir in dirs where !dir.isEmpty {
        if seen.insert(dir).inserted {
            unique.append(dir)
        }
    }
    return unique
}

public func onboardingAugmentedPath(
    home: String,
    path: String?,
    entries: (String) -> [String]
) -> String {
    onboardingSearchDirectories(home: home, path: path, entries: entries).joined(separator: ":")
}

/// An explicit override is used alone, matching `RERUN_*_PATH` in the engine.
/// Otherwise the first executable in `onboardingSearchDirectories` wins.
public func resolveOnboardingExecutable(
    name: String,
    override: String?,
    signals: OnboardingSignals
) -> String? {
    if let override = onboardingTrimmed(override) {
        return signals.isExecutable(override) ? override : nil
    }
    let dirs = onboardingSearchDirectories(
        home: signals.home,
        path: signals.environment["PATH"],
        entries: signals.entries
    )
    for dir in dirs {
        let candidate = onboardingChildPath(dir, name)
        if signals.isExecutable(candidate) {
            return candidate
        }
    }
    return nil
}

func onboardingNvmNewer(_ lhs: String, _ rhs: String) -> Bool {
    let left = onboardingVersionParts(lhs)
    let right = onboardingVersionParts(rhs)
    if left.isEmpty { return false }
    if right.isEmpty { return true }
    let count = max(left.count, right.count)
    for index in 0..<count {
        let lvalue = index < left.count ? left[index] : 0
        let rvalue = index < right.count ? right[index] : 0
        if lvalue != rvalue { return lvalue > rvalue }
    }
    return lhs > rhs
}

private func onboardingVersionParts(_ name: String) -> [Int] {
    let trimmed = name.hasPrefix("v") || name.hasPrefix("V") ? String(name.dropFirst()) : name
    let parts = trimmed.split(separator: ".").compactMap { Int($0) }
    if parts.isEmpty || parts.count != trimmed.split(separator: ".").count {
        return []
    }
    return parts
}

func onboardingShellName(resolved: String, standard: String) -> String {
    if resolved.contains("'") || resolved.contains(" ") {
        return "'" + resolved.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
    let base = (resolved as NSString).lastPathComponent
    if base == standard {
        return standard
    }
    return resolved
}
