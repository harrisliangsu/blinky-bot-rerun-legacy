// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
@testable import BlinkyLocalRuntime

final class LocalRuntimeTests: XCTestCase {
    func testDefaultPlanMatchesPhase1Contract() throws {
        let plan = try XCTUnwrap(checkoutPlan())
        XCTAssertEqual(plan.uiPort, 3000)
        XCTAssertEqual(plan.enginePort, 3001)
        XCTAssertEqual(plan.uiOrigin.absoluteString, "http://127.0.0.1:3000")
        XCTAssertEqual(plan.engineOrigin.absoluteString, "http://127.0.0.1:3001")
        XCTAssertEqual(plan.support.root, "/Users/ada/Library/Application Support/BlinkyBot")
        XCTAssertEqual(plan.support.engineDataDir, "/Users/ada/Library/Application Support/BlinkyBot/engine")
        XCTAssertEqual(plan.support.localAuthDB, "/Users/ada/Library/Application Support/BlinkyBot/local-auth.sqlite")
        XCTAssertEqual(plan.support.apiKeyFile, "/Users/ada/Library/Application Support/BlinkyBot/engine-api-key")
        XCTAssertEqual(plan.support.enginePid, "/Users/ada/Library/Application Support/BlinkyBot/run/engine.pid")
        XCTAssertEqual(plan.support.uiPid, "/Users/ada/Library/Application Support/BlinkyBot/run/ui.pid")
        XCTAssertEqual(plan.support.engineLog, "/Users/ada/Library/Application Support/BlinkyBot/logs/engine.log")
        XCTAssertEqual(plan.support.uiLog, "/Users/ada/Library/Application Support/BlinkyBot/logs/ui.log")
        XCTAssertEqual(plan.engineCWD, "/repo/apps/engine")
        XCTAssertEqual(plan.uiCWD, "/repo/apps/ui")
        XCTAssertEqual(plan.nodePath, "/usr/local/bin/node")

        let engine = plan.engineRequest(apiKey: "abc")
        let ui = plan.uiRequest(apiKey: "abc")
        XCTAssertEqual(engine.executable, "/usr/local/bin/node")
        XCTAssertEqual(engine.arguments, ["dist/cli/bin.js", "run"])
        XCTAssertEqual(engine.currentDirectory, "/repo/apps/engine")
        XCTAssertEqual(ui.arguments, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"])
        XCTAssertEqual(ui.currentDirectory, "/repo/apps/ui")
        XCTAssertFalse(engine.arguments.contains("docker"))
        XCTAssertFalse(ui.arguments.contains("docker"))
        XCTAssertFalse(engine.arguments.joined(separator: " ").contains("docker"))
        XCTAssertFalse(ui.arguments.joined(separator: " ").contains("docker"))

        XCTAssertEqual(engine.environment["RERUN_DATA_DIR"], plan.support.engineDataDir)
        XCTAssertEqual(engine.environment["RERUN_HOST"], "127.0.0.1")
        XCTAssertEqual(engine.environment["RERUN_PORT"], "3001")
        XCTAssertEqual(engine.environment["RERUN_API_KEY"], "abc")
        XCTAssertEqual(engine.environment["RERUN_HUB_BASE_URL"], "http://127.0.0.1:3000")
        XCTAssertEqual(engine.environment["RERUN_CLI_ADAPTERS"], "codex,kimi,grok,claude")
        XCTAssertEqual(engine.environment["RERUN_DESKTOP"], "off")
        XCTAssertEqual(engine.environment["RERUN_LOG_LEVEL"], "info")
        XCTAssertEqual(engine.environment["BLINKY_REX_STATE"], "/Users/ada/Library/Application Support/BlinkyBot/rex-watch.json")
        XCTAssertEqual(engine.environment["BLINKY_REX_WARNING_FILE"], "/Users/ada/Library/Application Support/BlinkyBot/logs/rex-watch.log")
        XCTAssertFalse(engine.environment["BLINKY_REX_STATE"]?.contains("http") == true)
        XCTAssertFalse(engine.environment["BLINKY_REX_WARNING_FILE"]?.contains("http") == true)
        XCTAssertNil(engine.environment["BLINKY_LOCAL_AUTH"])
        XCTAssertNil(engine.environment["NEXT_PUBLIC_SUPABASE_URL"])
        XCTAssertNil(engine.environment["OPENROUTER_API_KEY"])
        XCTAssertNil(engine.environment["RERUN_PAIR_TOKEN"])
        XCTAssertNil(engine.environment["RERUN_HUB_URL"])

        XCTAssertEqual(ui.environment["NODE_ENV"], "production")
        XCTAssertEqual(ui.environment["HOSTNAME"], "127.0.0.1")
        XCTAssertEqual(ui.environment["PORT"], "3000")
        XCTAssertEqual(ui.environment["NEXT_PUBLIC_APP_URL"], "http://127.0.0.1:3000")
        XCTAssertEqual(ui.environment["RERUN_ENGINE_URL"], "http://127.0.0.1:3001")
        XCTAssertEqual(ui.environment["RERUN_ENGINE_BROWSER_URL"], "http://127.0.0.1:3001")
        XCTAssertEqual(ui.environment["RERUN_ENGINE_API_KEY"], "abc")
        XCTAssertEqual(ui.environment["BLINKY_LOCAL_AUTH"], "1")
        XCTAssertEqual(ui.environment["BLINKY_LOCAL_AUTH_DB"], plan.support.localAuthDB)
        XCTAssertNil(ui.environment["NEXT_PUBLIC_SUPABASE_URL"])
        XCTAssertNil(ui.environment["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])
        XCTAssertNil(ui.environment["SUPABASE_SECRET_KEY"])
        XCTAssertNil(ui.environment["OPENROUTER_API_KEY"])
        XCTAssertTrue(ui.environment["PATH"]?.hasPrefix("/usr/local/bin") == true)
        XCTAssertTrue(ui.environment["PATH"]?.contains("/opt/homebrew/bin") == true)
        XCTAssertTrue(ui.environment["PATH"]?.contains("/Users/ada/.local/bin") == true)
        XCTAssertTrue(engine.environment["PATH"]?.contains("/Users/ada/.local/bin") == true)
    }

    func testEnvironmentOverridesPortsPathsAndStripsSupabase() throws {
        var inputs = checkoutInputs()
        inputs.environment["BLINKY_SUPPORT_DIR"] = "/tmp/blinky data"
        inputs.environment["BLINKY_UI_PORT"] = "3100"
        inputs.environment["BLINKY_ENGINE_PORT"] = "3101"
        inputs.environment["BLINKY_NODE"] = "/opt/node"
        inputs.environment["BLINKY_ENGINE_CWD"] = "/opt/engine"
        inputs.environment["BLINKY_UI_CWD"] = "/opt/ui"
        inputs.environment["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54421"
        inputs.environment["OPENROUTER_API_KEY"] = "secret"
        inputs.environment["RERUN_PAIR_TOKEN"] = "pair"
        inputs.environment["RERUN_DESKTOP"] = "on"
        inputs.environment["PATH"] = "/usr/bin"
        let tree = checkoutTree()
        tree.executables.insert("/opt/node")
        tree.files.insert("/opt/engine/dist/cli/bin.js")
        tree.files.insert("/opt/ui/node_modules/next/dist/bin/next")
        let plan = try XCTUnwrap(resolve(inputs, tree))
        XCTAssertEqual(plan.support.root, "/tmp/blinky data")
        XCTAssertEqual(plan.support.engineDataDir, "/tmp/blinky data/engine")
        XCTAssertEqual(plan.uiPort, 3100)
        XCTAssertEqual(plan.enginePort, 3101)
        XCTAssertEqual(plan.nodePath, "/opt/node")
        XCTAssertEqual(plan.engineCWD, "/opt/engine")
        XCTAssertEqual(plan.uiCWD, "/opt/ui")
        let ui = plan.uiRequest(apiKey: "k")
        XCTAssertEqual(ui.arguments.last, "3100")
        XCTAssertEqual(ui.environment["BLINKY_LOCAL_AUTH"], "1")
        XCTAssertNil(ui.environment["NEXT_PUBLIC_SUPABASE_URL"])
        XCTAssertNil(ui.environment["OPENROUTER_API_KEY"])
        XCTAssertNil(ui.environment["RERUN_PAIR_TOKEN"])
        XCTAssertEqual(plan.engineRequest(apiKey: "k").environment["RERUN_DESKTOP"], "off")
        XCTAssertEqual(plan.engineRequest(apiKey: "k").environment["RERUN_PORT"], "3101")
    }

    func testSavedPortsLoseToEnvironmentAndBeatDefaults() throws {
        var inputs = checkoutInputs()
        inputs.saved[RuntimePreferenceKey.uiPort] = "3200"
        inputs.saved[RuntimePreferenceKey.enginePort] = "3201"
        inputs.environment["BLINKY_UI_PORT"] = "3300"
        let plan = try XCTUnwrap(resolve(inputs, checkoutTree()))
        XCTAssertEqual(plan.uiPort, 3300)
        XCTAssertEqual(plan.enginePort, 3201)
    }

    func testBundledRuntimeWinsOverCheckout() throws {
        var inputs = checkoutInputs()
        inputs.bundledRuntime = "/App/Contents/Resources/runtime"
        let tree = checkoutTree()
        tree.executables.insert("/App/Contents/Resources/runtime/node/bin/node")
        tree.files.insert("/App/Contents/Resources/runtime/engine/dist/cli/bin.js")
        tree.files.insert("/App/Contents/Resources/runtime/ui/node_modules/next/dist/bin/next")
        let plan = try XCTUnwrap(resolve(inputs, tree))
        XCTAssertEqual(plan.nodePath, "/App/Contents/Resources/runtime/node/bin/node")
        XCTAssertEqual(plan.engineCWD, "/App/Contents/Resources/runtime/engine")
        XCTAssertEqual(plan.uiCWD, "/App/Contents/Resources/runtime/ui")
        XCTAssertEqual(plan.uiArguments, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"])
    }

    func testStandaloneServerReplacesNextStart() throws {
        var inputs = checkoutInputs()
        inputs.bundledRuntime = "/App/Contents/Resources/runtime"
        let tree = checkoutTree()
        tree.executables.insert("/App/Contents/Resources/runtime/node/bin/node")
        tree.files.insert("/App/Contents/Resources/runtime/engine/dist/cli/bin.js")
        tree.files.insert("/App/Contents/Resources/runtime/ui/apps/ui/server.js")
        tree.files.insert("/App/Contents/Resources/runtime/ui/node_modules/next/dist/bin/next")
        let plan = try XCTUnwrap(resolve(inputs, tree))
        XCTAssertEqual(plan.uiCWD, "/App/Contents/Resources/runtime/ui")
        XCTAssertEqual(plan.uiRequest(apiKey: "k").arguments, ["apps/ui/server.js"])
    }

    func testFlatStandaloneServer() throws {
        var inputs = checkoutInputs()
        inputs.bundledRuntime = "/App/Contents/Resources/runtime"
        let tree = checkoutTree()
        tree.executables.insert("/App/Contents/Resources/runtime/node/bin/node")
        tree.files.insert("/App/Contents/Resources/runtime/engine/dist/cli/bin.js")
        tree.files.insert("/App/Contents/Resources/runtime/ui/server.js")
        let plan = try XCTUnwrap(resolve(inputs, tree))
        XCTAssertEqual(plan.uiRequest(apiKey: "k").arguments, ["server.js"])
    }

    func testExplicitMissingNodeDoesNotSearchPath() {
        var inputs = checkoutInputs()
        inputs.environment["BLINKY_NODE"] = "/missing/node"
        let failure = resolveFailure(inputs, checkoutTree())
        XCTAssertEqual(failure, .missingNode("/missing/node"))
    }

    func testMissingBuildsNameTheEntryFile() {
        let inputs = checkoutInputs()
        let tree = FakeTree()
        tree.files.insert("/repo/pnpm-workspace.yaml")
        tree.files.insert("/repo/apps/engine/package.json")
        tree.executables.insert("/usr/local/bin/node")
        let failure = resolveFailure(inputs, tree)
        XCTAssertEqual(failure, .missingEngineBuild("/repo/apps/engine/dist/cli/bin.js"))
    }

    func testInvalidAndCollidingPorts() {
        var inputs = checkoutInputs()
        inputs.environment["BLINKY_UI_PORT"] = "zero"
        XCTAssertEqual(resolveFailure(inputs, checkoutTree()), .invalidPort(name: "BLINKY_UI_PORT", raw: "zero"))
        inputs.environment["BLINKY_UI_PORT"] = "3001"
        inputs.environment["BLINKY_ENGINE_PORT"] = "3001"
        XCTAssertEqual(resolveFailure(inputs, checkoutTree()), .portsCollide(3001))
    }

    func testRepoRootWalkAndRejection() {
        let tree = checkoutTree()
        XCTAssertEqual(
            findRepoRoot(starts: ["/repo/apps/mac-shell/Sources"], fileExists: tree.exists),
            "/repo"
        )
        var inputs = checkoutInputs()
        inputs.environment["BLINKY_REPO_ROOT"] = "/not-a-checkout"
        inputs.walkFrom = ["/repo"]
        let failure = resolveFailure(inputs, tree)
        XCTAssertEqual(failure, .missingEngineBuild("/not-a-checkout/apps/engine/dist/cli/bin.js"))
    }

    func testLaunchChoicesAdoptLivePidsAndRefuseForeignPorts() {
        XCTAssertEqual(chooseLaunch(pid: .alive(4), portListening: true), .adopt(4))
        XCTAssertEqual(chooseLaunch(pid: .alive(4), portListening: false), .adopt(4))
        XCTAssertEqual(chooseLaunch(pid: .dead(4), portListening: false), .spawn)
        XCTAssertEqual(chooseLaunch(pid: .empty, portListening: true), .portBusy)
        let blocked = planLaunches(
            engine: .empty,
            ui: .dead(9),
            enginePortListening: false,
            uiPortListening: true,
            enginePort: 3001,
            uiPort: 3000
        )
        XCTAssertEqual(blocked, .failure(.portBusy(role: "Compose", port: 3000)))
        let ready = planLaunches(
            engine: .alive(8),
            ui: .empty,
            enginePortListening: true,
            uiPortListening: false,
            enginePort: 3001,
            uiPort: 3000
        )
        XCTAssertEqual(ready, .success(LaunchChoices(engine: .adopt(8), ui: .spawn)))
    }

    func testReadyBodiesAndPoll() {
        XCTAssertTrue(ReadyBody.composeVersion(status: 200, body: " {\"buildSha\":null}\n"))
        XCTAssertFalse(ReadyBody.composeVersion(status: 200, body: "{\"status\":\"ok\"}"))
        XCTAssertFalse(ReadyBody.composeVersion(status: 500, body: "{\"buildSha\":null}"))
        XCTAssertTrue(ReadyBody.engineHealth(status: 200, body: "{\"status\": \"ok\", \"activeAgents\":0}"))
        XCTAssertFalse(ReadyBody.engineHealth(status: 200, body: "{\"buildSha\":null}"))
        XCTAssertEqual(
            pollOutcome(
                elapsed: 1,
                timeout: 30,
                uiReady: true,
                engineReady: true,
                engineRunning: true,
                uiRunning: true,
                engineCode: 0,
                uiCode: 0,
                engineLogTail: "",
                uiLogTail: ""
            ),
            .ready
        )
        XCTAssertEqual(
            pollOutcome(
                elapsed: 30,
                timeout: 30,
                uiReady: false,
                engineReady: true,
                engineRunning: true,
                uiRunning: true,
                engineCode: 0,
                uiCode: 0,
                engineLogTail: "",
                uiLogTail: ""
            ),
            .timedOut
        )
        XCTAssertEqual(
            pollOutcome(
                elapsed: 1,
                timeout: 30,
                uiReady: false,
                engineReady: false,
                engineRunning: false,
                uiRunning: true,
                engineCode: 1,
                uiCode: 0,
                engineLogTail: "EADDRINUSE",
                uiLogTail: ""
            ),
            .exited(role: "The engine", code: 1, logTail: "EADDRINUSE")
        )
        XCTAssertEqual(logTail("a\n\nb\nc", maxLines: 2, maxCharacters: 100), "b\nc")
        XCTAssertEqual(RuntimeFailure.timedOut(engineLog: "e", uiLog: "u").bannerText.contains("30 seconds"), true)
        XCTAssertEqual(RuntimeFailure.portBusy(role: "the engine", port: 3001).bannerText.contains("3001"), true)
        XCTAssertEqual(RuntimeFailure.missingNode(nil).bannerText.contains("Node"), true)
    }

    func testSuperviseFlagAndPidText() {
        XCTAssertTrue(superviseEnabled([:]))
        XCTAssertFalse(superviseEnabled(["BLINKY_SUPERVISE": "0"]))
        XCTAssertFalse(superviseEnabled(["BLINKY_SUPERVISE": " off "]))
        XCTAssertTrue(superviseEnabled(["BLINKY_SUPERVISE": "1"]))
        XCTAssertEqual(parsePidFile("42\n"), 42)
        XCTAssertEqual(pidFileText(42), "42\n")
        XCTAssertNil(parsePidFile("nope"))
        XCTAssertFalse(shouldSignal(expectedExecutable: "/bin/node", runningExecutable: "/bin/chrome"))
        XCTAssertTrue(shouldSignal(expectedExecutable: nil, runningExecutable: "/bin/chrome"))
        XCTAssertEqual(readyTimeoutSeconds, 30)
    }

    func testAPIKeyFileIsPrivateAndStable() throws {
        let dir = temporaryDirectory()
        defer { try? FileManager.default.removeItem(atPath: dir) }
        let path = childPath(dir, "engine-api-key")
        let created = try XCTUnwrap(value(APIKeyFile.loadOrCreate(at: path, randomBytes: { Array(repeating: 0xab, count: 32) })))
        XCTAssertEqual(created, String(repeating: "ab", count: 32))
        XCTAssertEqual(posixPermissions(at: path), 0o600)
        let again = try XCTUnwrap(value(APIKeyFile.loadOrCreate(at: path, randomBytes: { Array(repeating: 0, count: 32) })))
        XCTAssertEqual(again, created)
        try "short".write(toFile: path, atomically: true, encoding: .utf8)
        XCTAssertEqual(APIKeyFile.loadOrCreate(at: path), .failure(.apiKey(path)))
        XCTAssertNil(APIKeyFile.parse("zz"))
        XCTAssertEqual(APIKeyFile.parse(created), created)
    }

    func testStopSignalsTheProcessGroupAndRemovesThePidFile() throws {
        let dir = temporaryDirectory()
        let session = LaunchSession()
        defer {
            session.stop(grace: 1)
            try? FileManager.default.removeItem(atPath: dir)
        }
        let child = childPath(dir, "child.pid")
        let pid = try session.spawn(SpawnRequest(
            role: "sleep",
            executable: "/bin/sh",
            arguments: ["-c", "sleep 30 & wait"],
            currentDirectory: dir,
            environment: ["PATH": "/usr/bin:/bin"],
            logPath: childPath(dir, "sleep.log"),
            pidPath: child
        ))
        XCTAssertEqual(getpgid(pid), pid)
        XCTAssertEqual(try String(contentsOfFile: child, encoding: .utf8), pidFileText(pid))
        XCTAssertEqual(readPidState(at: child, expectedExecutable: "/bin/sh"), .alive(pid))
        XCTAssertEqual(readPidState(at: child, expectedExecutable: "/bin/not-the-shell"), .dead(pid))
        var grandchildren: [Int32] = []
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            grandchildren = processGroupMembers(pid)
            if grandchildren.count > 1 { break }
            Thread.sleep(forTimeInterval: 0.05)
        }
        XCTAssertGreaterThan(grandchildren.count, 1)
        session.stop(expectedExecutable: "/bin/sh", grace: 2)
        XCTAssertFalse(isProcessAlive(pid))
        XCTAssertFalse(FileManager.default.fileExists(atPath: child))
        for member in grandchildren {
            XCTAssertFalse(isProcessAlive(member))
        }
    }

    func testPortProbeSeesABoundSocket() throws {
        let fd = socket(AF_INET, blinkyStreamSocketType, 0)
        XCTAssertGreaterThanOrEqual(fd, 0)
        var address = sockaddr_in()
        memset(&address, 0, MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        address.sin_port = 0
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                // Inside this closure, unqualified `bind` is a Swift instance method.
                darwinBind(fd, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        XCTAssertEqual(bound, 0)
        XCTAssertEqual(darwinListen(fd, 1), 0)
        var stored = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &stored) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                darwinGetsockname(fd, socketAddress, &length)
            }
        }
        XCTAssertEqual(named, 0)
        let port = Int(UInt16(bigEndian: stored.sin_port))
        XCTAssertTrue(PortProbe.isListening(port: port))
        XCTAssertEqual(darwinClose(fd), 0)
        XCTAssertFalse(PortProbe.isListening(port: port))
    }

    private func checkoutPlan() -> StackPlan? {
        resolve(checkoutInputs(), checkoutTree())
    }

    private func resolve(_ inputs: RuntimeInputs, _ tree: FakeTree) -> StackPlan? {
        if case .success(let plan) = resolveStackPlan(inputs, fileExists: tree.exists, isExecutable: tree.executable) {
            return plan
        }
        return nil
    }

    private func resolveFailure(_ inputs: RuntimeInputs, _ tree: FakeTree) -> RuntimeFailure? {
        if case .failure(let failure) = resolveStackPlan(inputs, fileExists: tree.exists, isExecutable: tree.executable) {
            return failure
        }
        return nil
    }

    private func checkoutInputs() -> RuntimeInputs {
        RuntimeInputs(
            environment: ["PATH": "/usr/bin:/bin"],
            applicationSupport: "/Users/ada/Library/Application Support",
            walkFrom: ["/repo/apps/mac-shell"],
            home: "/Users/ada"
        )
    }

    private func checkoutTree() -> FakeTree {
        let tree = FakeTree()
        tree.files.insert("/repo/pnpm-workspace.yaml")
        tree.files.insert("/repo/apps/engine/package.json")
        tree.files.insert("/repo/apps/engine/dist/cli/bin.js")
        tree.files.insert("/repo/apps/ui/node_modules/next/dist/bin/next")
        tree.executables.insert("/usr/local/bin/node")
        return tree
    }

    private func temporaryDirectory() -> String {
        let dir = childPath(FileManager.default.temporaryDirectory.path, "blinky-runtime-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        return dir
    }

    private func value(_ result: Result<String, RuntimeFailure>) -> String? {
        if case .success(let value) = result { return value }
        return nil
    }

    private func processGroupMembers(_ pgid: Int32) -> [Int32] {
        if let names = try? FileManager.default.contentsOfDirectory(atPath: "/proc") {
            let members = names.compactMap { name -> Int32? in
                guard let pid = Int32(name), getpgid(pid) == pgid else { return nil }
                return pid
            }
            if !members.isEmpty { return members }
        }
        return processGroupMembersFromPS(pgid)
    }

    private func processGroupMembersFromPS(_ pgid: Int32) -> [Int32] {
        let pipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/ps")
        process.arguments = ["-ax", "-o", "pid=,pgid="]
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return []
        }
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let text = String(data: data, encoding: .utf8) else { return [] }
        return text.split(separator: "\n").compactMap { line in
            let fields = line.split(whereSeparator: { $0 == " " || $0 == "\t" })
            guard fields.count >= 2,
                  let pid = Int32(fields[0]),
                  let group = Int32(fields[1]),
                  group == pgid else {
                return nil
            }
            return pid
        }
    }
}

private func darwinBind(_ fd: Int32, _ address: UnsafePointer<sockaddr>, _ length: socklen_t) -> Int32 {
#if canImport(Darwin)
    Darwin.bind(fd, address, length)
#else
    bind(fd, address, length)
#endif
}

private func darwinListen(_ fd: Int32, _ backlog: Int32) -> Int32 {
#if canImport(Darwin)
    Darwin.listen(fd, backlog)
#else
    listen(fd, backlog)
#endif
}

private func darwinGetsockname(_ fd: Int32, _ address: UnsafeMutablePointer<sockaddr>, _ length: UnsafeMutablePointer<socklen_t>) -> Int32 {
#if canImport(Darwin)
    Darwin.getsockname(fd, address, length)
#else
    getsockname(fd, address, length)
#endif
}

private func darwinClose(_ fd: Int32) -> Int32 {
#if canImport(Darwin)
    Darwin.close(fd)
#else
    close(fd)
#endif
}

private final class FakeTree {
    var files: Set<String> = []
    var executables: Set<String> = []

    func exists(_ path: String) -> Bool {
        files.contains(path) || executables.contains(path)
    }

    func executable(_ path: String) -> Bool {
        executables.contains(path)
    }
}
