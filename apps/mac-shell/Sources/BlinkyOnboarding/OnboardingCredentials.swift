// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

func onboardingIsCredential(_ raw: String) -> Bool {
    let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.count < 8 { return false }
    switch value.lowercased() {
    case "null", "none", "nil", "undefined", "changeme", "your-api-key", "todo", "example":
        return false
    default:
        return true
    }
}

func onboardingEnvironmentHasCredential(_ environment: [String: String], keys: [String]) -> Bool {
    for key in keys {
        if let value = environment[key], onboardingIsCredential(value) {
            return true
        }
    }
    return false
}

func onboardingJSONObject(_ text: String?) -> Any? {
    guard let text, let data = text.data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data)
}

private let onboardingCredentialFields: Set<String> = [
    "access_token",
    "refresh_token",
    "token",
    "api_key",
    "apiKey",
    "OPENAI_API_KEY",
    "personal_access_token",
    "id_token",
]

func onboardingJSONHasCredential(_ value: Any) -> Bool {
    if let object = value as? [String: Any] {
        for (key, item) in object {
            if onboardingCredentialFields.contains(key), let text = item as? String, onboardingIsCredential(text) {
                return true
            }
            if onboardingJSONHasCredential(item) {
                return true
            }
        }
        return false
    }
    if let list = value as? [Any] {
        for item in list where onboardingJSONHasCredential(item) {
            return true
        }
    }
    return false
}

func onboardingTextHasCredential(_ text: String?) -> Bool {
    guard let object = onboardingJSONObject(text) else { return false }
    return onboardingJSONHasCredential(object)
}

/// Grok stores a session under a provider key. `key` is the token. An
/// `expires_at` in the past does not count; a missing or unreadable expiry does.
func onboardingGrokHasLiveKey(_ value: Any, now: Date) -> Bool {
    if let object = value as? [String: Any] {
        if let key = object["key"] as? String, onboardingIsCredential(key) {
            if let expiry = object["expires_at"], let date = onboardingParseExpiry(expiry), date <= now {
                // This entry lapsed. Sibling entries are still checked below.
            } else {
                return true
            }
        }
        for item in object.values where onboardingGrokHasLiveKey(item, now: now) {
            return true
        }
        return false
    }
    if let list = value as? [Any] {
        for item in list where onboardingGrokHasLiveKey(item, now: now) {
            return true
        }
    }
    return false
}

func onboardingParseExpiry(_ value: Any) -> Date? {
    if let number = value as? NSNumber {
        return onboardingDateFromUnix(number.doubleValue)
    }
    if let text = value as? String {
        return onboardingDateFromString(text)
    }
    return nil
}

private func onboardingDateFromString(_ text: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: text) {
        return date
    }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: text)
}

private func onboardingDateFromUnix(_ number: Double) -> Date? {
    if number > 1_000_000_000_000 {
        return Date(timeIntervalSince1970: number / 1000)
    }
    if number > 1_000_000_000 {
        return Date(timeIntervalSince1970: number)
    }
    return nil
}

func onboardingTomlValues(key: String, in text: String) -> [String] {
    var found: [String] = []
    for raw in text.split(whereSeparator: \.isNewline) {
        let line = onboardingStripTomlComment(String(raw)).trimmingCharacters(in: .whitespaces)
        if line.isEmpty { continue }
        let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        guard parts.count == 2, parts[0] == key else { continue }
        found.append(onboardingUnquote(parts[1]))
    }
    return found
}

private func onboardingStripTomlComment(_ line: String) -> String {
    var inSingle = false
    var inDouble = false
    var result = ""
    for character in line {
        if character == "'" && !inDouble {
            inSingle.toggle()
        } else if character == "\"" && !inSingle {
            inDouble.toggle()
        } else if character == "#" && !inSingle && !inDouble {
            break
        }
        result.append(character)
    }
    return result
}

private func onboardingUnquote(_ raw: String) -> String {
    var text = raw.trimmingCharacters(in: .whitespaces)
    guard text.count >= 2 else { return text }
    let first = text.first
    let last = text.last
    if (first == "\"" && last == "\"") || (first == "'" && last == "'") {
        text.removeFirst()
        text.removeLast()
    }
    return text
}
