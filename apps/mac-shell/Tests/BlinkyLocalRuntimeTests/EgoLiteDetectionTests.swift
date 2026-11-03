// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
@testable import BlinkyLocalRuntime

final class EgoLiteDetectionTests: XCTestCase {
    func testMissingAppAndCommand() {
        let status = EgoLiteDetection.detect(home: "/Users/ada", path: "/usr/bin", fileExists: { _ in false }, isExecutable: { _ in false })
        XCTAssertEqual(status.readiness, .notInstalled)
        XCTAssertFalse(status.onboarded)
        XCTAssertNil(status.appPath)
        XCTAssertNil(status.cliPath)
    }

    func testInstalledAppStillNeedsOnboarding() {
        let app = "/Applications/ego lite.app"
        let status = EgoLiteDetection.detect(
            home: "/Users/ada",
            path: "/usr/bin",
            fileExists: { $0 == app },
            isExecutable: { _ in false }
        )
        XCTAssertEqual(status.readiness, .needsOnboarding)
        XCTAssertEqual(status.appPath, app)
        XCTAssertFalse(status.onboarded)
    }

    func testCommandInLocalBinCountsAsOnboardedWithoutBeingOnPath() {
        let cli = "/Users/ada/.local/bin/ego-browser"
        let status = EgoLiteDetection.detect(
            home: "/Users/ada",
            path: "/usr/bin:/bin",
            fileExists: { _ in false },
            isExecutable: { $0 == cli }
        )
        XCTAssertEqual(status.readiness, .ready)
        XCTAssertTrue(status.onboarded)
        XCTAssertEqual(status.cliPath, cli)
        XCTAssertNil(status.appPath)
    }

    func testUserApplicationsAndPathCommand() {
        let app = "/Users/ada/Applications/ego lite.app"
        let cli = "/opt/homebrew/bin/ego-browser"
        let status = EgoLiteDetection.detect(
            home: "/Users/ada",
            path: "/opt/homebrew/bin:/usr/bin",
            fileExists: { $0 == app },
            isExecutable: { $0 == cli }
        )
        XCTAssertEqual(status.readiness, .ready)
        XCTAssertEqual(status.appPath, app)
        XCTAssertEqual(status.cliPath, cli)
    }

    func testInstallScriptCandidatesPreferTheBundledEngineCopy() {
        let candidates = EgoLiteDetection.installScriptCandidates(resourcePath: "/App/Contents/Resources")
        XCTAssertEqual(candidates, [
            "/App/Contents/Resources/runtime/engine/assets/skills/ego-browser/scripts/install.sh",
            "/App/Contents/Resources/ego-lite-install.sh",
        ])
        XCTAssertEqual(EgoLiteDetection.locateInstallScript(candidates: candidates, isFile: { $0.hasSuffix("install.sh") }), candidates[0])
        XCTAssertNil(EgoLiteDetection.locateInstallScript(candidates: candidates, isFile: { _ in false }))
        XCTAssertEqual(EgoLiteDetection.installScriptCandidates(resourcePath: nil), [])
    }

    func testCopyFollowsThePreferredLanguage() {
        XCTAssertEqual(EgoLiteCopy.language(preferredLanguages: ["zh-Hans-CN", "en"]), .zh)
        XCTAssertEqual(EgoLiteCopy.language(preferredLanguages: ["en-US"]), .en)
        XCTAssertEqual(EgoLiteCopy.string(.title, preferredLanguages: ["zh-Hant"]), "ego(lite)")
        XCTAssertTrue(EgoLiteCopy.string(.notInstalled, preferredLanguages: ["zh-Hans"]).contains("尚未安装"))
        XCTAssertTrue(EgoLiteCopy.string(.confirmRun, preferredLanguages: ["en"]).contains("Nothing downloads until you confirm"))
        XCTAssertFalse(EgoLiteCopy.string(.summary, preferredLanguages: ["en"]).contains("127.0.0.1"))
        for key in EgoLiteCopyKey.allCases {
            XCTAssertFalse(EgoLiteCopy.string(key, preferredLanguages: ["en"]).isEmpty)
            XCTAssertFalse(EgoLiteCopy.string(key, preferredLanguages: ["zh"]).isEmpty)
        }
    }
}
