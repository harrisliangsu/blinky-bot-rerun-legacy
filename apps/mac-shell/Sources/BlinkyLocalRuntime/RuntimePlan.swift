// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

public struct SpawnRequest: Equatable {
    public var role: String
    public var executable: String
    public var arguments: [String]
    public var currentDirectory: String
    public var environment: [String: String]
    public var logPath: String
    public var pidPath: String
}

public struct StackPlan: Equatable {
    public var support: SupportLayout
    public var uiPort: Int
    public var enginePort: Int
    public var nodePath: String
    public var engineCWD: String
    public var uiCWD: String
    public var uiArguments: [String]
    public var home: String
    public var parentEnvironment: [String: String]

    public var uiOrigin: URL { loopbackOrigin(port: uiPort) }
    public var engineOrigin: URL { loopbackOrigin(port: enginePort) }

    public func engineRequest(apiKey: String) -> SpawnRequest {
        SpawnRequest(
            role: RuntimeRole.engine,
            executable: nodePath,
            arguments: RuntimeCommand.engineArguments,
            currentDirectory: engineCWD,
            environment: engineEnvironment(parent: parentEnvironment, support: support, uiPort: uiPort, enginePort: enginePort, nodePath: nodePath, apiKey: apiKey, home: home),
            logPath: support.engineLog,
            pidPath: support.enginePid
        )
    }

    public func uiRequest(apiKey: String) -> SpawnRequest {
        SpawnRequest(
            role: RuntimeRole.ui,
            executable: nodePath,
            arguments: uiArguments,
            currentDirectory: uiCWD,
            environment: uiEnvironment(parent: parentEnvironment, support: support, uiPort: uiPort, enginePort: enginePort, nodePath: nodePath, apiKey: apiKey, home: home),
            logPath: support.uiLog,
            pidPath: support.uiPid
        )
    }
}

public enum RuntimeCommand {
    public static let engineArguments = ["dist/cli/bin.js", "run"]
    public static let standaloneEntries = ["server.js", "apps/ui/server.js"]
    public static let nextBin = "node_modules/next/dist/bin/next"

    public static func uiArguments(port: Int, uiCWD: String, fileExists: (String) -> Bool) -> [String] {
        for entry in standaloneEntries where fileExists(childPath(uiCWD, entry)) {
            return [entry]
        }
        return [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)]
    }
}

public let strippedChildEnvironmentKeys: Set<String> = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RERUN_PAIR_TOKEN",
    "RERUN_HUB_URL",
    "OPENROUTER_API_KEY",
]

public func resolveStackPlan(
    _ inputs: RuntimeInputs,
    fileExists: (String) -> Bool,
    isExecutable: (String) -> Bool
) -> Result<StackPlan, RuntimeFailure> {
    let supportRoot = firstNonEmpty([
        inputs.environment["BLINKY_SUPPORT_DIR"],
        inputs.saved[RuntimePreferenceKey.supportDir],
    ]) ?? SupportLayout.defaultRoot(applicationSupport: inputs.applicationSupport)

    let uiPort: Int
    switch resolvePort(name: "BLINKY_UI_PORT", environmentKey: "BLINKY_UI_PORT", savedKey: RuntimePreferenceKey.uiPort, fallback: defaultUIPort, inputs: inputs) {
    case .success(let port):
        uiPort = port
    case .failure(let failure):
        return .failure(failure)
    }
    let enginePort: Int
    switch resolvePort(name: "BLINKY_ENGINE_PORT", environmentKey: "BLINKY_ENGINE_PORT", savedKey: RuntimePreferenceKey.enginePort, fallback: defaultEnginePort, inputs: inputs) {
    case .success(let port):
        enginePort = port
    case .failure(let failure):
        return .failure(failure)
    }
    if uiPort == enginePort {
        return .failure(.portsCollide(uiPort))
    }

    let node: String
    switch resolveNode(inputs, isExecutable: isExecutable) {
    case .success(let path):
        node = path
    case .failure(let failure):
        return .failure(failure)
    }

    let repo = lookupRepo(inputs, fileExists: fileExists)
    let engineCWD: String
    switch resolveWorkdir(
        explicit: firstNonEmpty([
            inputs.environment["BLINKY_ENGINE_CWD"],
            inputs.saved[RuntimePreferenceKey.engineCWD],
        ]),
        bundled: inputs.bundledRuntime.map { childPath($0, "engine") },
        repo: repo,
        repoRelative: "apps/engine",
        entries: ["dist/cli/bin.js"],
        fileExists: fileExists,
        missing: { .missingEngineBuild($0) }
    ) {
    case .success(let path):
        engineCWD = path
    case .failure(let failure):
        return .failure(failure)
    }

    let uiCWD: String
    switch resolveWorkdir(
        explicit: firstNonEmpty([
            inputs.environment["BLINKY_UI_CWD"],
            inputs.saved[RuntimePreferenceKey.uiCWD],
        ]),
        bundled: inputs.bundledRuntime.map { childPath($0, "ui") },
        repo: repo,
        repoRelative: "apps/ui",
        entries: RuntimeCommand.standaloneEntries + [RuntimeCommand.nextBin],
        fileExists: fileExists,
        missing: { .missingUIBuild($0) }
    ) {
    case .success(let path):
        uiCWD = path
    case .failure(let failure):
        return .failure(failure)
    }

    return .success(StackPlan(
        support: SupportLayout.resolve(root: supportRoot),
        uiPort: uiPort,
        enginePort: enginePort,
        nodePath: node,
        engineCWD: engineCWD,
        uiCWD: uiCWD,
        uiArguments: RuntimeCommand.uiArguments(port: uiPort, uiCWD: uiCWD, fileExists: fileExists),
        home: inputs.home,
        parentEnvironment: inputs.environment
    ))
}

public func prepareSupport(_ layout: SupportLayout) -> Result<Void, RuntimeFailure> {
    for path in layout.directories {
        do {
            try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        } catch {
            return .failure(.directory(path))
        }
    }
    return .success(())
}

func engineEnvironment(
    parent: [String: String],
    support: SupportLayout,
    uiPort: Int,
    enginePort: Int,
    nodePath: String,
    apiKey: String,
    home: String
) -> [String: String] {
    var env = baseEnvironment(parent: parent, nodePath: nodePath, home: home)
    env["RERUN_DATA_DIR"] = support.engineDataDir
    env["RERUN_HOST"] = "127.0.0.1"
    env["RERUN_PORT"] = String(enginePort)
    env["RERUN_API_KEY"] = apiKey
    env["RERUN_HUB_BASE_URL"] = loopbackOrigin(port: uiPort).absoluteString
    env["RERUN_CLI_ADAPTERS"] = "codex,kimi,grok,claude"
    env["RERUN_DESKTOP"] = "off"
    env["RERUN_LOG_LEVEL"] = "info"
    return env
}

func uiEnvironment(
    parent: [String: String],
    support: SupportLayout,
    uiPort: Int,
    enginePort: Int,
    nodePath: String,
    apiKey: String,
    home: String
) -> [String: String] {
    var env = baseEnvironment(parent: parent, nodePath: nodePath, home: home)
    let uiOrigin = loopbackOrigin(port: uiPort).absoluteString
    let engineOrigin = loopbackOrigin(port: enginePort).absoluteString
    env["NODE_ENV"] = "production"
    env["HOSTNAME"] = "127.0.0.1"
    env["PORT"] = String(uiPort)
    env["NEXT_PUBLIC_APP_URL"] = uiOrigin
    env["RERUN_ENGINE_URL"] = engineOrigin
    env["RERUN_ENGINE_BROWSER_URL"] = engineOrigin
    env["RERUN_ENGINE_API_KEY"] = apiKey
    env["BLINKY_LOCAL_AUTH"] = "1"
    env["BLINKY_LOCAL_AUTH_DB"] = support.localAuthDB
    return env
}

private func baseEnvironment(parent: [String: String], nodePath: String, home: String) -> [String: String] {
    var env = parent
    for key in strippedChildEnvironmentKeys {
        env.removeValue(forKey: key)
    }
    env.removeValue(forKey: "RERUN_PAIR_TOKEN")
    env.removeValue(forKey: "RERUN_HUB_URL")
    env["PATH"] = augmentedPath(existing: parent["PATH"], nodePath: nodePath, home: home)
    return env
}

func augmentedPath(existing: String?, nodePath: String, home: String) -> String {
    var dirs = [parentDirectory(nodePath)]
    dirs.append(contentsOf: extraBinDirectories(home: home))
    if let existing {
        dirs.append(contentsOf: existing.split(separator: ":").map(String.init))
    }
    var seen = Set<String>()
    var unique: [String] = []
    for dir in dirs where !dir.isEmpty {
        if seen.insert(dir).inserted {
            unique.append(dir)
        }
    }
    return unique.joined(separator: ":")
}

func extraBinDirectories(home: String) -> [String] {
    [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        childPath(home, ".volta/bin"),
        childPath(home, "Library/pnpm"),
        childPath(home, ".local/share/pnpm"),
    ]
}

private func resolvePort(
    name: String,
    environmentKey: String,
    savedKey: String,
    fallback: Int,
    inputs: RuntimeInputs
) -> Result<Int, RuntimeFailure> {
    guard let raw = firstNonEmpty([inputs.environment[environmentKey], inputs.saved[savedKey]]) else {
        return .success(fallback)
    }
    guard let port = parsePort(raw) else {
        return .failure(.invalidPort(name: name, raw: raw))
    }
    return .success(port)
}

private func resolveNode(_ inputs: RuntimeInputs, isExecutable: (String) -> Bool) -> Result<String, RuntimeFailure> {
    if let explicit = firstNonEmpty([inputs.environment["BLINKY_NODE"], inputs.saved[RuntimePreferenceKey.nodePath]]) {
        if isExecutable(explicit) {
            return .success(explicit)
        }
        return .failure(.missingNode(explicit))
    }
    if let bundled = inputs.bundledRuntime {
        let path = childPath(bundled, "node/bin/node")
        if isExecutable(path) {
            return .success(path)
        }
    }
    let path = inputs.environment["PATH"] ?? ""
    if let found = searchExecutable(name: "node", path: path, home: inputs.home, isExecutable: isExecutable) {
        return .success(found)
    }
    return .failure(.missingNode(nil))
}

func searchExecutable(name: String, path: String, home: String, isExecutable: (String) -> Bool) -> String? {
    var dirs = path.split(separator: ":").map(String.init)
    dirs.append(contentsOf: extraBinDirectories(home: home))
    var seen = Set<String>()
    for dir in dirs {
        if !seen.insert(dir).inserted { continue }
        let candidate = childPath(dir, name)
        if isExecutable(candidate) {
            return candidate
        }
    }
    return nil
}

private enum RepoLookup {
    case found(String)
    case rejected(String)
    case absent
}

private func lookupRepo(_ inputs: RuntimeInputs, fileExists: (String) -> Bool) -> RepoLookup {
    if let explicit = firstNonEmpty([
        inputs.environment["BLINKY_REPO_ROOT"],
        inputs.saved[RuntimePreferenceKey.repoRoot],
    ]) {
        return isRepoRoot(explicit, fileExists: fileExists) ? .found(explicit) : .rejected(explicit)
    }
    if let found = findRepoRoot(starts: inputs.walkFrom, fileExists: fileExists) {
        return .found(found)
    }
    return .absent
}

func findRepoRoot(starts: [String], fileExists: (String) -> Bool) -> String? {
    for start in starts {
        var current = stripTrailingSlash(start)
        var seen = Set<String>()
        while seen.insert(current).inserted {
            if isRepoRoot(current, fileExists: fileExists) {
                return current
            }
            if current == "/" || current.isEmpty {
                break
            }
            let parent = (current as NSString).deletingLastPathComponent
            if parent == current {
                break
            }
            current = parent
        }
    }
    return nil
}

func isRepoRoot(_ path: String, fileExists: (String) -> Bool) -> Bool {
    fileExists(childPath(path, "pnpm-workspace.yaml")) && fileExists(childPath(path, "apps/engine/package.json"))
}

private func resolveWorkdir(
    explicit: String?,
    bundled: String?,
    repo: RepoLookup,
    repoRelative: String,
    entries: [String],
    fileExists: (String) -> Bool,
    missing: (String) -> RuntimeFailure
) -> Result<String, RuntimeFailure> {
    let named = entries[0]
    func ready(_ cwd: String) -> Bool {
        entries.contains { fileExists(childPath(cwd, $0)) }
    }
    if let explicit {
        if ready(explicit) {
            return .success(stripTrailingSlash(explicit))
        }
        return .failure(missing(childPath(explicit, named)))
    }
    if let bundled {
        let cwd = stripTrailingSlash(bundled)
        if ready(cwd) {
            return .success(cwd)
        }
    }
    switch repo {
    case .found(let root):
        let cwd = childPath(root, repoRelative)
        if ready(cwd) {
            return .success(cwd)
        }
        return .failure(missing(childPath(cwd, named)))
    case .rejected(let root):
        return .failure(missing(childPath(childPath(root, repoRelative), named)))
    case .absent:
        if let bundled {
            return .failure(missing(childPath(bundled, named)))
        }
        return .failure(missing("Contents/Resources/runtime/\(repoRelative)/\(named)"))
    }
}
