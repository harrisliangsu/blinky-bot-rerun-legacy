// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum APIKeyFile {
    public static let byteCount = 32

    public static func loadOrCreate(at path: String, randomBytes: () -> [UInt8] = urandomBytes) -> Result<String, RuntimeFailure> {
        if FileManager.default.fileExists(atPath: path) {
            guard let text = try? String(contentsOfFile: path, encoding: .utf8), let key = parse(text) else {
                return .failure(.apiKey(path))
            }
            return .success(key)
        }
        let bytes = randomBytes()
        guard bytes.count == byteCount else {
            return .failure(.apiKey(path))
        }
        let key = hex(bytes)
        guard writeExclusive(key, to: path) else {
            if FileManager.default.fileExists(atPath: path),
               let text = try? String(contentsOfFile: path, encoding: .utf8),
               let existing = parse(text) {
                return .success(existing)
            }
            return .failure(.apiKey(path))
        }
        return .success(key)
    }

    public static func parse(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count == byteCount * 2 else { return nil }
        let allowed = CharacterSet(charactersIn: "0123456789abcdefABCDEF")
        guard trimmed.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        return trimmed.lowercased()
    }

    public static func hex(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02x", $0) }.joined()
    }

    public static func urandomBytes() -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let fd = open("/dev/urandom", O_RDONLY)
        if fd < 0 {
            return []
        }
        defer { _ = close(fd) }
        let count = bytes.withUnsafeMutableBytes { buffer in
            read(fd, buffer.baseAddress, byteCount)
        }
        guard count == byteCount else { return [] }
        return bytes
    }
}

private func writeExclusive(_ key: String, to path: String) -> Bool {
    let fd = open(path, O_CREAT | O_EXCL | O_WRONLY, mode_t(0o600))
    if fd < 0 {
        return false
    }
    defer { _ = close(fd) }
    _ = fchmod(fd, mode_t(0o600))
    let payload = Data((key + "\n").utf8)
    let wrote = payload.withUnsafeBytes { buffer in
        write(fd, buffer.baseAddress, buffer.count)
    }
    return wrote == payload.count
}

public func posixPermissions(at path: String) -> Int? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: path),
          let mode = attributes[.posixPermissions] as? NSNumber else {
        return nil
    }
    return mode.intValue & 0o777
}
