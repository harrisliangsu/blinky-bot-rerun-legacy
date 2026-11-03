// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
@testable import BlinkyLocalRuntime

final class RexDetectionTests: XCTestCase {
    private let home = "/Users/ada"
    private let plist = "<plist><key>CFBundleIdentifier</key><string>com.superlogical.rex</string></plist>"

    func testMissingAppAndCommand() {
        let status = detect(path: "/usr/bin", exists: [], executable: [])
        XCTAssertEqual(status.readiness, .notInstalled)
        XCTAssertNil(status.appPath)
        XCTAssertNil(status.cliPath)
    }

    func testAppWithoutCliStaysOff() {
        let app = "/Applications/Rex.app"
        let status = detect(path: "/usr/bin", exists: [app], executable: [])
        XCTAssertEqual(status.readiness, .appOnly)
        XCTAssertEqual(status.appPath, app)
        XCTAssertNil(status.cliPath)
    }

    func testCliWithoutAppStaysOff() {
        let cli = "/opt/homebrew/bin/rex"
        let status = detect(path: "/opt/homebrew/bin:/usr/bin", exists: [], executable: [cli])
        XCTAssertEqual(status.readiness, .cliOnly)
        XCTAssertNil(status.appPath)
        XCTAssertEqual(status.cliPath, cli)
    }

    func testUserApplicationsAndBundledCli() {
        let app = "/Users/ada/Applications/Rex Beta.app"
        let cli = RexDetection.bundledCli(appPath: app)
        let status = detect(path: "/usr/bin", exists: [app], executable: [cli])
        XCTAssertEqual(status.readiness, .ready)
        XCTAssertEqual(status.appPath, app)
        XCTAssertEqual(status.cliPath, cli)
        XCTAssertTrue(cli.contains("Rex Server.rex"))
    }

    func testPathCliWhenTheBundleHelperIsMissing() {
        let app = "/Applications/Rex.app"
        let cli = "/Users/ada/.local/bin/rex"
        let status = detect(path: "/usr/bin", exists: [app], executable: [cli])
        XCTAssertEqual(status.readiness, .ready)
        XCTAssertEqual(status.cliPath, cli)
    }

    func testBundleIdentifierConfirmsARenamedAppAndRejectsALookalike() {
        let renamed = "/Applications/Rex Nightly.app"
        let lookalike = "/Applications/Rex.app"
        let candidates = RexDetection.candidateApps(home: home, applicationNames: ["Rex.app", "Rex Nightly.app"], userApplicationNames: [])
        let status = RexDetection.detect(
            home: home,
            path: "/usr/bin",
            candidates: candidates,
            fileExists: { $0 == renamed || $0 == lookalike },
            isExecutable: { $0 == "/usr/bin/rex" },
            readBundleIdentifier: { path in
                if path == renamed { return "com.superlogical.rex" }
                if path == lookalike { return "com.example.notrex" }
                return nil
            }
        )
        XCTAssertEqual(status.appPath, renamed)
        XCTAssertEqual(status.readiness, .ready)
        XCTAssertEqual(RexDetection.bundleIdentifier(inPlist: plist), "com.superlogical.rex")
        XCTAssertNil(RexDetection.bundleIdentifier(inPlist: "<plist></plist>"))
    }

    func testLoginPathIsPrependedAndUnknownShellsAreIgnored() {
        let path = RexPath.searchPath(loginPath: "/opt/homebrew/bin:/usr/bin", processPath: "/usr/bin", home: home)
        XCTAssertTrue(path.hasPrefix("/opt/homebrew/bin:"))
        XCTAssertEqual(RexPath.loginArguments(shell: "/bin/zsh"), ["-lc", "printf %s \"$PATH\""])
        XCTAssertNil(RexPath.loginArguments(shell: "/usr/bin/python3"))
        XCTAssertEqual(RexDetection.featureMarker, "blinky-rex-watch")
    }

    func testToggleStaysOffUnlessRexIsReady() throws {
        let ready = RexStatus(appPath: "/Applications/Rex.app", cliPath: "/usr/local/bin/rex", readiness: .ready)
        let missing = RexStatus(appPath: nil, cliPath: nil, readiness: .notInstalled)
        XCTAssertEqual(RexWatchStore.file(requested: false, status: ready), RexWatchFile(enabled: false, bin: nil))
        XCTAssertEqual(RexWatchStore.file(requested: true, status: missing), RexWatchFile(enabled: false, bin: nil))
        XCTAssertEqual(RexWatchStore.file(requested: true, status: ready).bin, "/usr/local/bin/rex")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("blinky-rex-\(UUID().uuidString)").path
        try RexWatchStore.publish(root: root, requested: true, status: ready)
        let data = try Data(contentsOf: URL(fileURLWithPath: RexWatchStore.statePath(root)))
        let decoded = try JSONDecoder().decode(RexWatchFile.self, from: data)
        XCTAssertEqual(decoded, RexWatchFile(enabled: true, bin: "/usr/local/bin/rex"))
        XCTAssertEqual(RexWatchStore.latestWarningCode(in: "rex-launch-failed\n"), "rex-launch-failed")
        XCTAssertNil(RexWatchStore.latestWarningCode(in: " \n"))
        try? FileManager.default.removeItem(atPath: root)
    }

    func testCopyCoversBothLanguagesWithoutInternalUrls() {
        XCTAssertEqual(RexCopy.string(.title, preferredLanguages: ["en"]), "Show bot activity in Rex")
        XCTAssertEqual(RexCopy.string(.title, preferredLanguages: ["zh-Hans"]), "在 Rex 中显示 Bot 活动")
        let ready = RexStatus(appPath: "/Applications/Rex.app", cliPath: "/usr/local/bin/rex", readiness: .ready)
        XCTAssertEqual(RexDetection.withVersion(ready, versionOk: true).readiness, .ready)
        XCTAssertEqual(RexDetection.withVersion(ready, versionOk: false).readiness, .versionFailed)
        XCTAssertEqual(RexCopy.string(.beta, preferredLanguages: ["zh-Hant"]), "实验")
        for key in RexCopyKey.allCases {
            let english = RexCopy.string(key, preferredLanguages: ["en"])
            let chinese = RexCopy.string(key, preferredLanguages: ["zh"])
            XCTAssertFalse(english.isEmpty)
            XCTAssertFalse(chinese.isEmpty)
            XCTAssertFalse(english.contains("127.0.0.1"))
            XCTAssertFalse(chinese.contains("127.0.0.1"))
            XCTAssertFalse(english.contains("localhost"))
        }
        XCTAssertTrue(RexCopy.string(.removed, preferredLanguages: ["en"]).contains("no longer available"))
        XCTAssertEqual(RexDetection.website, "https://www.superlogical.com/rex/")
    }

    private func detect(path: String, exists: Set<String>, executable: Set<String>) -> RexStatus {
        RexDetection.detect(
            home: home,
            path: path,
            candidates: RexDetection.standardAppCandidates(home: home),
            fileExists: { exists.contains($0) },
            isExecutable: { executable.contains($0) },
            readBundleIdentifier: { _ in nil }
        )
    }
}
