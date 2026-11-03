// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum ComposeURL {
    public static let defaultsKey = "composeBaseURL"
    public static let infoPlistKey = "BlinkyComposeBaseURL"
    public static let environmentKey = "BLINKY_COMPOSE_URL"
    public static let fallbackString = "http://127.0.0.1:3000"

    public static func resolve(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        userDefaultsValue: String? = UserDefaults.standard.string(forKey: defaultsKey),
        infoPlistValue: String? = Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String
    ) -> URL {
        let candidates = [
            environment[environmentKey],
            userDefaultsValue,
            infoPlistValue,
            fallbackString,
        ]
        for candidate in candidates {
            if let url = parse(candidate) {
                return url
            }
        }
        preconditionFailure("ComposeURL.fallbackString must stay a valid http URL")
    }

    public static func parse(_ raw: String?) -> URL? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return nil }
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return nil
        }
        guard let host = url.host, !host.isEmpty else { return nil }
        return url
    }

    @discardableResult
    public static func saveOverride(_ raw: String, defaults: UserDefaults = .standard) -> URL? {
        guard let url = parse(raw) else { return nil }
        defaults.set(url.absoluteString, forKey: defaultsKey)
        return url
    }

    public static func clearOverride(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: defaultsKey)
    }
}
