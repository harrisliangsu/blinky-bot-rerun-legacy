// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
@testable import BlinkyComposeURL

final class ComposeURLTests: XCTestCase {
    func testFallbackIsDockerComposeApp() {
        let url = ComposeURL.resolve(environment: [:], userDefaultsValue: nil, infoPlistValue: nil)
        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:3000")
        XCTAssertEqual(url.host, "127.0.0.1")
        XCTAssertEqual(url.port, 3000)
    }

    func testEnvironmentOverridesSavedAndBundledValues() {
        let url = ComposeURL.resolve(
            environment: [ComposeURL.environmentKey: "http://127.0.0.1:3050"],
            userDefaultsValue: "http://127.0.0.1:3000",
            infoPlistValue: "http://127.0.0.1:9"
        )
        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:3050")
    }

    func testUserDefaultsOverrideInfoPlist() {
        let url = ComposeURL.resolve(
            environment: [:],
            userDefaultsValue: "https://127.0.0.1:8443",
            infoPlistValue: "http://127.0.0.1:3000"
        )
        XCTAssertEqual(url.absoluteString, "https://127.0.0.1:8443")
    }

    func testInfoPlistUsedWhenNothingElseIsSet() {
        let url = ComposeURL.resolve(
            environment: [:],
            userDefaultsValue: nil,
            infoPlistValue: "http://127.0.0.1:3050"
        )
        XCTAssertEqual(url.port, 3050)
    }

    func testBlankAndInvalidCandidatesFallThrough() {
        let url = ComposeURL.resolve(
            environment: [ComposeURL.environmentKey: "   "],
            userDefaultsValue: "ftp://127.0.0.1:3000",
            infoPlistValue: "file:///tmp/compose"
        )
        XCTAssertEqual(url.absoluteString, ComposeURL.fallbackString)
    }

    func testParseTrimsAndRequiresHttpHost() {
        XCTAssertEqual(ComposeURL.parse("  http://127.0.0.1:3050/ ")?.port, 3050)
        XCTAssertNil(ComposeURL.parse(nil))
        XCTAssertNil(ComposeURL.parse(""))
        XCTAssertNil(ComposeURL.parse("127.0.0.1:3000"))
        XCTAssertNil(ComposeURL.parse("http://"))
        XCTAssertNil(ComposeURL.parse("javascript:alert(1)"))
        XCTAssertNil(ComposeURL.parse("data:text/html,hi"))
    }

    func testSaveOverridePersistsCanonicalURL() {
        let suite = "bot.blinky.shell.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertNil(ComposeURL.saveOverride("notaurl", defaults: defaults))
        XCTAssertNil(defaults.string(forKey: ComposeURL.defaultsKey))

        let saved = ComposeURL.saveOverride("  http://127.0.0.1:3050  ", defaults: defaults)
        XCTAssertEqual(saved?.absoluteString, "http://127.0.0.1:3050")
        XCTAssertEqual(defaults.string(forKey: ComposeURL.defaultsKey), "http://127.0.0.1:3050")

        let resolved = ComposeURL.resolve(
            environment: [:],
            userDefaultsValue: defaults.string(forKey: ComposeURL.defaultsKey),
            infoPlistValue: nil
        )
        XCTAssertEqual(resolved.absoluteString, "http://127.0.0.1:3050")

        ComposeURL.clearOverride(defaults: defaults)
        XCTAssertNil(defaults.string(forKey: ComposeURL.defaultsKey))
    }
}
