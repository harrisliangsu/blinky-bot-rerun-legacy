// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum LaunchError: Error {
    case openLog(String, Int32)
    case spawn(String, String)
    case pidFile(String)

    public var bannerText: String {
        switch self {
        case .openLog(let path, _):
            return "Could not open the log at \(path)."
        case .spawn(let executable, let detail):
            return "Could not start \(executable). \(detail)"
        case .pidFile(let path):
            return "Could not write the pid file at \(path)."
        }
    }
}

public final class LaunchSession {
    private final class TrackedChild {
        let role: String
        let pid: Int32
        let pidPath: String
        let spawnedByUs: Bool
        var exitCode: Int32?

        init(role: String, pid: Int32, pidPath: String, spawnedByUs: Bool) {
            self.role = role
            self.pid = pid
            self.pidPath = pidPath
            self.spawnedByUs = spawnedByUs
        }
    }

    private var children: [TrackedChild] = []

    public init() {}

    @discardableResult
    public func spawn(_ request: SpawnRequest) throws -> Int32 {
        try FileManager.default.createDirectory(
            atPath: parentDirectory(request.logPath),
            withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(
            atPath: parentDirectory(request.pidPath),
            withIntermediateDirectories: true
        )

        // Darwin imports the spawn attribute types as pointers. Glibc imports them as values.
        // Swift Foundation uses the same split.
#if canImport(Darwin)
        var attr: posix_spawnattr_t?
        var actions: posix_spawn_file_actions_t?
#else
        var attr = posix_spawnattr_t()
        var actions = posix_spawn_file_actions_t()
#endif
        guard posix_spawnattr_init(&attr) == 0 else {
            throw LaunchError.spawn(request.executable, "could not prepare the process")
        }
        defer { posix_spawnattr_destroy(&attr) }
        guard posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETPGROUP)) == 0,
              posix_spawnattr_setpgroup(&attr, 0) == 0 else {
            throw LaunchError.spawn(request.executable, "could not put the process in its own group")
        }

        guard posix_spawn_file_actions_init(&actions) == 0 else {
            throw LaunchError.spawn(request.executable, "could not prepare output")
        }
        defer { posix_spawn_file_actions_destroy(&actions) }

        let opened = request.logPath.withCString { log in
            posix_spawn_file_actions_addopen(&actions, 1, log, O_WRONLY | O_CREAT | O_APPEND, mode_t(0o644))
        }
        guard opened == 0 else {
            throw LaunchError.openLog(request.logPath, opened)
        }
        guard posix_spawn_file_actions_adddup2(&actions, 1, 2) == 0 else {
            throw LaunchError.openLog(request.logPath, errno)
        }
        let changed = request.currentDirectory.withCString { cwd in
            posix_spawn_file_actions_addchdir_np(&actions, cwd)
        }
        guard changed == 0 else {
            throw LaunchError.spawn(request.executable, "could not set the working directory \(request.currentDirectory)")
        }

        let argv = cStrings([request.executable] + request.arguments)
        defer { freeCStrings(argv) }
        let envp = cStrings(request.environment.keys.sorted().map { "\($0)=\(request.environment[$0] ?? "")" })
        defer { freeCStrings(envp) }

        var pid: pid_t = 0
        let spawned = request.executable.withCString { executable in
            posix_spawn(&pid, executable, &actions, &attr, argv, envp)
        }
        guard spawned == 0, pid > 0 else {
            throw LaunchError.spawn(request.executable, errnoText(spawned))
        }

        do {
            try pidFileText(pid).write(toFile: request.pidPath, atomically: true, encoding: .utf8)
        } catch {
            _ = kill(-pid, SIGKILL)
            var status: Int32 = 0
            _ = waitpid(pid, &status, 0)
            throw LaunchError.pidFile(request.pidPath)
        }
        children.append(TrackedChild(role: request.role, pid: pid, pidPath: request.pidPath, spawnedByUs: true))
        return pid
    }

    public func track(role: String, pid: Int32, pidPath: String) {
        children.append(TrackedChild(role: role, pid: pid, pidPath: pidPath, spawnedByUs: false))
    }

    public func isRunning(role: String) -> Bool {
        guard children.contains(where: { $0.role == role }) else { return false }
        return exitCode(role: role) == nil
    }

    public func exitCode(role: String) -> Int32? {
        guard let child = children.first(where: { $0.role == role }) else { return nil }
        if let code = child.exitCode {
            return code
        }
        if child.spawnedByUs {
            var status: Int32 = 0
            let waited = waitpid(child.pid, &status, WNOHANG)
            if waited == child.pid {
                child.exitCode = decodedExit(status)
                return child.exitCode
            }
            if waited < 0 && errno == ECHILD {
                child.exitCode = 0
                return 0
            }
            return nil
        }
        if !isProcessAlive(child.pid) {
            child.exitCode = 0
            return 0
        }
        return nil
    }

    public func stop(expectedExecutable: String? = nil, pidPaths: [String] = [], grace: TimeInterval = 5) {
        var pids = Set(children.map(\.pid))
        for path in pidPaths {
            guard let text = try? String(contentsOfFile: path, encoding: .utf8), let pid = parsePidFile(text) else {
                continue
            }
            pids.insert(pid)
        }
        let targets = pids.filter { shouldStop($0, expectedExecutable: expectedExecutable) }
        for pid in targets {
            _ = kill(-pid, SIGTERM)
            _ = kill(pid, SIGTERM)
        }
        waitUntilQuiet(targets, grace: grace)
        let survivors = targets.filter { !settled($0) }
        for pid in survivors {
            _ = kill(-pid, SIGKILL)
            _ = kill(pid, SIGKILL)
        }
        waitUntilQuiet(survivors, grace: 1)
        reapOwned(blocking: true)
        for child in children where settled(child.pid) {
            try? FileManager.default.removeItem(atPath: child.pidPath)
        }
        for path in pidPaths {
            guard let text = try? String(contentsOfFile: path, encoding: .utf8), let pid = parsePidFile(text) else {
                try? FileManager.default.removeItem(atPath: path)
                continue
            }
            if !isProcessAlive(pid) || !shouldStop(pid, expectedExecutable: expectedExecutable) {
                try? FileManager.default.removeItem(atPath: path)
            }
        }
    }
}

public func readPidState(at path: String, expectedExecutable: String?) -> PidState {
    guard let text = try? String(contentsOfFile: path, encoding: .utf8), let pid = parsePidFile(text) else {
        return .empty
    }
    if isProcessAlive(pid) && shouldSignal(expectedExecutable: expectedExecutable, runningExecutable: runningExecutable(pid: pid)) {
        return .alive(pid)
    }
    return .dead(pid)
}

public func isProcessAlive(_ pid: Int32) -> Bool {
    guard pid > 0 else { return false }
    if kill(pid, 0) == 0 {
        return true
    }
    return errno != ESRCH
}

#if os(macOS)
@_silgen_name("proc_pidpath")
private func blinkyProcPidPath(_ pid: Int32, _ buffer: UnsafeMutablePointer<CChar>, _ buffersize: UInt32) -> Int32
#endif

public func runningExecutable(pid: Int32) -> String? {
    let link = "/proc/\(pid)/exe"
    var buffer = [CChar](repeating: 0, count: 4096)
    let count = readlink(link, &buffer, buffer.count - 1)
    if count > 0 {
        buffer[Int(count)] = 0
        return String(cString: buffer)
    }
    #if os(macOS)
    var path = [CChar](repeating: 0, count: 4096)
    let wrote = blinkyProcPidPath(pid, &path, UInt32(path.count))
    if wrote > 0 {
        return String(cString: path)
    }
    #endif
    return nil
}

public enum PortProbe {
    public static func isListening(port: Int, host: String = "127.0.0.1") -> Bool {
        let fd = socket(AF_INET, blinkyStreamSocketType, 0)
        if fd < 0 {
            return false
        }
        defer { _ = close(fd) }
        var timeout = timeval(tv_sec: 0, tv_usec: 200_000)
        _ = setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        var address = sockaddr_in()
        memset(&address, 0, MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(port).bigEndian)
        address.sin_addr.s_addr = inet_addr(host)
        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                connect(fd, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return connected == 0
    }
}

// The macOS 14 SDK imports SOCK_STREAM as Int32. Older overlays, including
// the Linux one this package still builds with, expose it as a raw value.
public var blinkyStreamSocketType: Int32 {
#if canImport(Darwin)
    SOCK_STREAM
#else
    Int32(SOCK_STREAM.rawValue)
#endif
}

private func shouldStop(_ pid: Int32, expectedExecutable: String?) -> Bool {
    guard isProcessAlive(pid) else { return false }
    return shouldSignal(expectedExecutable: expectedExecutable, runningExecutable: runningExecutable(pid: pid))
}

private extension LaunchSession {
    func settled(_ pid: Int32) -> Bool {
        if let child = children.first(where: { $0.pid == pid }), child.spawnedByUs {
            _ = exitCode(role: child.role)
            return child.exitCode != nil
        }
        return !isProcessAlive(pid)
    }

    func waitUntilQuiet(_ pids: Set<Int32>, grace: TimeInterval) {
        let deadline = Date().addingTimeInterval(grace)
        while Date() < deadline && pids.contains(where: { !self.settled($0) }) {
            Thread.sleep(forTimeInterval: 0.05)
        }
    }

    func reapOwned(blocking: Bool) {
        for child in children where child.spawnedByUs && child.exitCode == nil {
            var status: Int32 = 0
            let flags = blocking ? Int32(0) : WNOHANG
            let waited = waitpid(child.pid, &status, flags)
            if waited == child.pid {
                child.exitCode = decodedExit(status)
            }
        }
    }
}

private func decodedExit(_ status: Int32) -> Int32 {
    if status & 0x7f == 0 {
        return (status >> 8) & 0xff
    }
    return 128 + (status & 0x7f)
}

private func errnoText(_ code: Int32) -> String {
    guard code != 0, let text = strerror(code) else { return "error \(code)" }
    return String(cString: text)
}

private func cStrings(_ values: [String]) -> [UnsafeMutablePointer<CChar>?] {
    values.map { value in
        value.withCString { strdup($0) }
    } + [nil]
}

private func freeCStrings(_ values: [UnsafeMutablePointer<CChar>?]) {
    for pointer in values {
        free(pointer)
    }
}
