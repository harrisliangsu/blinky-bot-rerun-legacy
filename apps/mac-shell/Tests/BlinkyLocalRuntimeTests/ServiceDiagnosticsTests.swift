// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
@testable import BlinkyLocalRuntime

final class ServiceDiagnosticsTests: XCTestCase {
    private let secret = String(repeating: "ab", count: 32)
    private let host = DiagnosticHost(
        appVersion: "0.1.3",
        operatingSystem: "Version 14.5 (Build 23F79)",
        architecture: "arm64"
    )

    func testSimulatedFailedServiceStartShowsErrorView() {
        let log = moduleLog(extra: """
        http://127.0.0.1:3000/api/version
        RERUN_API_KEY=\(secret)
        Authorization: Bearer super-secret-token
        """)
        let window = serviceWindow(
            phase: .failed,
            failure: .exited(role: "Compose", code: 1, logTail: "Compose stopped (exit 1)"),
            engineLog: "",
            uiLog: log,
            language: .english
        )
        guard case .error(let screen) = window else {
            return XCTFail("error view should appear")
        }
        XCTAssertTrue(screen.showsErrorView)
        XCTAssertEqual(screen.viewIdentifier, "blinky.service-error")
        XCTAssertEqual(screen.cause, .missingModule(name: "@swc/helpers"))
        XCTAssertEqual(screen.actions, [.retry, .copyDiagnostics, .openLogs])
        XCTAssertEqual(screen.retryTitle, "Retry")
        XCTAssertEqual(screen.copyTitle, "Copy Diagnostics")
        XCTAssertEqual(screen.logsTitle, "Open Logs Folder")
        XCTAssertEqual(screen.retryIdentifier, "blinky.service-error.retry")
        XCTAssertEqual(screen.copyIdentifier, "blinky.service-error.copy")
        XCTAssertEqual(screen.logsIdentifier, "blinky.service-error.logs")
        XCTAssertLessThanOrEqual(screen.logLines.count, 30)
        XCTAssertFalse(screen.logLines.isEmpty)
        XCTAssertTrue(screen.summary.contains("@swc/helpers"))
        XCTAssertFalse(screen.summary.contains("exit 1"))
        assertNoInternalDetails(screen.summary)
        assertNoInternalDetails(screen.hint)
        assertNoInternalDetails(screen.title)
        assertNoInternalDetails(screen.logText)
        let copied = screen.diagnosticText(host: host)
        XCTAssertTrue(copied.contains("App: BlinkyBot 0.1.3"))
        XCTAssertTrue(copied.contains("macOS: Version 14.5 (Build 23F79)"))
        XCTAssertTrue(copied.contains("Architecture: arm64"))
        XCTAssertTrue(copied.contains("Cause: missing-module"))
        XCTAssertTrue(copied.contains("Module: @swc/helpers"))
        assertNoInternalDetails(copied)

        let chinese = chineseScreen(log: log)
        XCTAssertTrue(chinese.showsErrorView)
        XCTAssertEqual(chinese.retryTitle, "重试")
        XCTAssertEqual(chinese.copyTitle, "复制诊断信息")
        XCTAssertEqual(chinese.logsTitle, "打开日志文件夹")
        XCTAssertTrue(chinese.summary.contains("「@swc/helpers」"))
        assertNoInternalDetails(chinese.summary)
        assertNoInternalDetails(chinese.hint)
        assertNoInternalDetails(chinese.logText)
        assertNoInternalDetails(chinese.diagnosticText(host: host))
    }

    func testExitWithoutALogStillShowsTheErrorView() {
        let window = serviceWindow(
            phase: .failed,
            failure: .exited(role: "Compose", code: 1, logTail: ""),
            engineLog: "",
            uiLog: "",
            language: .english
        )
        guard case .error(let screen) = window else {
            return XCTFail("error view should appear")
        }
        XCTAssertTrue(screen.showsErrorView)
        XCTAssertEqual(screen.cause, .exited(role: "Compose", code: 1))
        XCTAssertTrue(screen.logLines.isEmpty)
        XCTAssertEqual(screen.emptyLog, "No log lines yet.")
        XCTAssertFalse(screen.summary.contains("exit 1"))
        XCTAssertTrue(screen.diagnosticText(host: host).contains("Exit code: 1"))
        XCTAssertEqual(serviceWindow(phase: .ready, failure: nil, engineLog: "", uiLog: "", language: .english), .browser)
        XCTAssertEqual(serviceWindow(phase: .starting, failure: nil, engineLog: "", uiLog: "", language: .english), .starting)
    }

    func testPortPermissionAndModuleHints() {
        let busy = errorScreen(
            failure: .portBusy(role: "Compose", port: 3000),
            uiLog: "Error: Cannot find module 'stale'\nhttp://localhost:3000\n"
        )
        XCTAssertEqual(busy.cause, .portInUse(port: 3000))
        XCTAssertTrue(busy.summary.contains("3000"))
        assertNoInternalDetails(busy.summary)
        assertNoInternalDetails(busy.logText)

        let address = errorScreen(
            failure: .exited(role: "Compose", code: 1, logTail: ""),
            uiLog: "Error: listen EADDRINUSE: address already in use 127.0.0.1:3000\n"
        )
        XCTAssertEqual(address.cause, .portInUse(port: 3000))
        assertNoInternalDetails(address.logText)
        XCTAssertTrue(address.logText.contains("[address]"))

        let denied = errorScreen(
            failure: .exited(role: "The engine", code: 1, logTail: ""),
            engineLog: "Error: EACCES: permission denied, open '/Users/ada/Library/Application Support/BlinkyBot/logs/engine.log'\n",
            uiLog: ""
        )
        XCTAssertEqual(denied.cause, .permission)
        XCTAssertFalse(denied.summary.contains("/Users/ada"))
        XCTAssertFalse(denied.hint.contains("/Users/ada"))

        let missingNode = errorScreen(failure: .missingNode("/secret/node"), uiLog: "")
        XCTAssertEqual(missingNode.cause, .missingNode)
        XCTAssertFalse(missingNode.summary.contains("/secret/node"))
        XCTAssertFalse(missingNode.hint.contains("/secret/node"))
        XCTAssertFalse(missingNode.diagnosticText(host: host).contains("/secret/node"))

        let folder = errorScreen(failure: .directory("/Users/ada/secret"), uiLog: "")
        XCTAssertEqual(folder.cause, .permission)
        XCTAssertFalse(folder.summary.contains("/Users/ada/secret"))

        let openLog = runtimeFailure(.openLog("/tmp/blinky.log", EACCES))
        XCTAssertEqual(errorScreen(failure: openLog, uiLog: "").cause, .permission)
    }

    func testLogTailKeepsTheLastThirtyLinesAndDropsSecrets() {
        var lines: [String] = []
        for index in 0..<40 {
            lines.append("line \(index)")
        }
        lines.append("Error: Cannot find module '@swc/helpers'")
        lines.append("code: 'MODULE_NOT_FOUND'")
        lines.append("http://127.0.0.1:3000 \(secret)")
        lines[3] = "http://localhost/old"
        let screen = errorScreen(
            failure: .exited(role: "Compose", code: 1, logTail: ""),
            uiLog: lines.joined(separator: "\n")
        )
        XCTAssertEqual(screen.cause, .missingModule(name: "@swc/helpers"))
        XCTAssertLessThanOrEqual(screen.logLines.count, 30)
        XCTAssertTrue(screen.logText.contains("line 39"))
        XCTAssertFalse(screen.logText.contains("line 0"))
        XCTAssertTrue(screen.logText.contains("MODULE_NOT_FOUND"))
        assertNoInternalDetails(screen.logText)
    }

    func testMenuShowsStatusAndTheRequiredItems() {
        let chinese = serviceMenuModel(phase: .failed, language: .chinese)
        XCTAssertEqual(chinese.status, .error)
        XCTAssertEqual(chinese.dot, .red)
        XCTAssertEqual(chinese.statusTitle, "服务出错")
        XCTAssertEqual(chinese.openTitle, "打开 BlinkyBot")
        XCTAssertEqual(chinese.newBotTitle, "新建 Bot")
        XCTAssertEqual(chinese.restartTitle, "重启服务")
        XCTAssertEqual(chinese.logsTitle, "打开日志文件夹")
        XCTAssertEqual(chinese.updatesTitle, "检查更新")
        XCTAssertEqual(chinese.quitTitle, "退出")

        XCTAssertEqual(serviceMenuModel(phase: .ready, language: .english).statusTitle, "Service running")
        XCTAssertEqual(serviceMenuModel(phase: .ready, language: .english).dot, .green)
        XCTAssertEqual(serviceMenuModel(phase: .starting, language: .english).status, .starting)
        XCTAssertEqual(serviceMenuModel(phase: .starting, language: .english).dot, .orange)
        XCTAssertEqual(serviceMenuModel(phase: .idle, language: .english).status, .stopped)
        XCTAssertEqual(serviceMenuModel(phase: .idle, language: .english).dot, .gray)
        XCTAssertEqual(serviceMenuModel(phase: .external, language: .english).status, .running)
        XCTAssertEqual(serviceMenuModel(phase: .external, language: .english).openTitle, "Open BlinkyBot")
        XCTAssertEqual(serviceMenuModel(phase: .external, language: .english).newBotTitle, "New Bot")
        XCTAssertEqual(serviceMenuModel(phase: .external, language: .english).quitTitle, "Quit")
    }

    func testLaunchAtLoginIsOffUntilTheServiceIsEnabled() {
        XCTAssertFalse(LaunchAtLogin.isOn(serviceStatus: "notRegistered"))
        XCTAssertFalse(LaunchAtLogin.isOn(serviceStatus: "notFound"))
        XCTAssertFalse(LaunchAtLogin.isOn(serviceStatus: "requiresApproval"))
        XCTAssertFalse(LaunchAtLogin.isOn(serviceStatus: ""))
        XCTAssertTrue(LaunchAtLogin.isOn(serviceStatus: "enabled"))
        XCTAssertEqual(ShellLanguage.resolve(["zh-Hans-CN", "en-US"]), .chinese)
        XCTAssertEqual(ShellLanguage.resolve(["en-US"]), .english)
        XCTAssertEqual(ShellLanguage.resolve([]), .english)
    }

    private func errorScreen(failure: RuntimeFailure, engineLog: String = "", uiLog: String) -> ServiceErrorScreen {
        let window = serviceWindow(
            phase: .failed,
            failure: failure,
            engineLog: engineLog,
            uiLog: uiLog,
            language: .english
        )
        guard case .error(let screen) = window else {
            XCTFail("error view should appear")
            return ServiceErrorScreen(
                showsErrorView: false,
                viewIdentifier: "",
                title: "",
                summary: "",
                hint: "",
                logHeading: "",
                logLines: [],
                emptyLog: "",
                retryTitle: "",
                copyTitle: "",
                logsTitle: "",
                copiedTitle: "",
                retryIdentifier: "",
                copyIdentifier: "",
                logsIdentifier: "",
                cause: .other,
                actions: []
            )
        }
        return screen
    }

    private func chineseScreen(log: String) -> ServiceErrorScreen {
        let window = serviceWindow(
            phase: .failed,
            failure: .exited(role: "Compose", code: 1, logTail: ""),
            engineLog: "",
            uiLog: log,
            language: .chinese
        )
        guard case .error(let screen) = window else {
            XCTFail("error view should appear")
            return errorScreen(failure: .spawn(""), uiLog: "")
        }
        return screen
    }

    private func moduleLog(extra: String) -> String {
        """
        > next start
        \(extra)
        Error: Cannot find module '@swc/helpers/_/_interop_require_default'
        Require stack:
        - /Applications/BlinkyBot.app/Contents/Resources/runtime/ui/server.js
          code: 'MODULE_NOT_FOUND'
        """
    }

    private func assertNoInternalDetails(_ text: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertNil(text.range(of: "127.0.0.1"), file: file, line: line)
        XCTAssertNil(text.range(of: "localhost", options: .caseInsensitive), file: file, line: line)
        XCTAssertNil(text.range(of: "0.0.0.0"), file: file, line: line)
        XCTAssertNil(text.range(of: "http://", options: .caseInsensitive), file: file, line: line)
        XCTAssertNil(text.range(of: "https://", options: .caseInsensitive), file: file, line: line)
        XCTAssertFalse(text.contains(secret), file: file, line: line)
        XCTAssertFalse(text.contains("super-secret-token"), file: file, line: line)
    }
}
