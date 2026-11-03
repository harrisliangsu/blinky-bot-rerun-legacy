// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public enum RuntimeFailure: Error, Equatable {
    case missingNode(String?)
    case missingEngineBuild(String)
    case missingUIBuild(String)
    case portBusy(role: String, port: Int)
    case invalidPort(name: String, raw: String)
    case portsCollide(Int)
    case exited(role: String, code: Int32, logTail: String)
    case timedOut(engineLog: String, uiLog: String)
    case directory(String)
    case apiKey(String)
    case spawn(String)

    public var bannerText: String {
        switch self {
        case .missingNode(let path):
            if let path {
                return "Node is missing at \(path). Install Node 22 or set BLINKY_NODE to the node binary."
            }
            return "Node is missing. BlinkyBot looks in the app at Contents/Resources/runtime/node/bin/node, then on PATH. Install Node 22 or set BLINKY_NODE."
        case .missingEngineBuild(let path):
            return "The engine build is missing at \(path). From the checkout run pnpm --filter rerun-engine build, or ship runtime/engine inside the app."
        case .missingUIBuild(let path):
            return "The Compose build is missing at \(path). From the checkout run pnpm --filter rerun build, or ship runtime/ui inside the app."
        case .portBusy(let role, let port):
            return "Port \(port) is already in use, so \(role) did not start. BlinkyBot leaves that process alone. Free the port, or set a different port and open BlinkyBot again."
        case .invalidPort(let name, let raw):
            return "\(name) must be a port from 1 to 65535. \(raw) is not a port."
        case .portsCollide(let port):
            return "Compose and the engine are both set to port \(port). Give them different ports."
        case .exited(let role, let code, let logTail):
            let detail = logTail.isEmpty ? "The log is empty." : logTail
            return "\(role) stopped (exit \(code)). \(detail)"
        case .timedOut(let engineLog, let uiLog):
            return "Compose and the engine did not both answer within 30 seconds. Engine log: \(engineLog). Compose log: \(uiLog)."
        case .directory(let path):
            return "Could not create \(path)."
        case .apiKey(let path):
            return "Could not read or create the engine API key at \(path)."
        case .spawn(let detail):
            return detail
        }
    }
}

public enum PidState: Equatable {
    case empty
    case alive(Int32)
    case dead(Int32)
}

public enum LaunchChoice: Equatable {
    case adopt(Int32)
    case spawn
    case portBusy
}

public struct LaunchChoices: Equatable {
    public var engine: LaunchChoice
    public var ui: LaunchChoice
}

public func chooseLaunch(pid: PidState, portListening: Bool) -> LaunchChoice {
    if case .alive(let pid) = pid {
        return .adopt(pid)
    }
    if portListening {
        return .portBusy
    }
    return .spawn
}

public func planLaunches(
    engine: PidState,
    ui: PidState,
    enginePortListening: Bool,
    uiPortListening: Bool,
    enginePort: Int,
    uiPort: Int
) -> Result<LaunchChoices, RuntimeFailure> {
    let engineChoice = chooseLaunch(pid: engine, portListening: enginePortListening)
    let uiChoice = chooseLaunch(pid: ui, portListening: uiPortListening)
    if case .portBusy = engineChoice {
        return .failure(.portBusy(role: "the engine", port: enginePort))
    }
    if case .portBusy = uiChoice {
        return .failure(.portBusy(role: "Compose", port: uiPort))
    }
    return .success(LaunchChoices(engine: engineChoice, ui: uiChoice))
}

public enum PollOutcome: Equatable {
    case ready
    case keepWaiting
    case timedOut
    case exited(role: String, code: Int32, logTail: String)
}

public func pollOutcome(
    elapsed: TimeInterval,
    timeout: TimeInterval,
    uiReady: Bool,
    engineReady: Bool,
    engineRunning: Bool,
    uiRunning: Bool,
    engineCode: Int32,
    uiCode: Int32,
    engineLogTail: String,
    uiLogTail: String
) -> PollOutcome {
    if uiReady && engineReady {
        return .ready
    }
    if !engineRunning {
        return .exited(role: "The engine", code: engineCode, logTail: engineLogTail)
    }
    if !uiRunning {
        return .exited(role: "Compose", code: uiCode, logTail: uiLogTail)
    }
    if elapsed >= timeout {
        return .timedOut
    }
    return .keepWaiting
}

public enum ReadyBody {
    public static func composeVersion(status: Int, body: String) -> Bool {
        guard status == 200 else { return false }
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasPrefix("{") && trimmed.hasSuffix("}") && trimmed.contains("\"buildSha\"")
    }

    public static func engineHealth(status: Int, body: String) -> Bool {
        guard status == 200 else { return false }
        let compact = body.replacingOccurrences(of: " ", with: "")
        return compact.contains("\"status\":\"ok\"")
    }
}

public func logTail(_ text: String, maxLines: Int = 12, maxCharacters: Int = 500) -> String {
    let lines = text.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    let tail = lines.suffix(maxLines).joined(separator: "\n")
    if tail.count <= maxCharacters {
        return tail
    }
    return String(tail.suffix(maxCharacters))
}

public func pidFileText(_ pid: Int32) -> String {
    "\(pid)\n"
}

public func parsePidFile(_ text: String) -> Int32? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let first = trimmed.split(whereSeparator: \.isNewline).first.map(String.init) ?? trimmed
    guard let pid = Int32(first), pid > 0 else { return nil }
    return pid
}

public func shouldSignal(expectedExecutable: String?, runningExecutable: String?) -> Bool {
    guard let expected = expectedExecutable, let running = runningExecutable else { return true }
    return resolvedPath(expected) == resolvedPath(running)
}

func resolvedPath(_ path: String) -> String {
    URL(fileURLWithPath: path).resolvingSymlinksInPath().path
}
