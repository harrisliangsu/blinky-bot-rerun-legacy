// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import XCTest
@testable import BlinkyOnboarding

final class OnboardingTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testGUIPathFindsHomebrewNpmNvmAndLocalBin() {
        let home = "/Users/ada"
        let dirs = onboardingSearchDirectories(home: home, path: "/usr/bin:/bin", entries: { path in
            path.hasSuffix(".nvm/versions/node") ? ["v18.20.0", "v22.9.0", "v22.19.0", "notes"] : []
        })
        XCTAssertEqual(dirs.first, "/usr/bin")
        XCTAssertLessThan(dirs.firstIndex(of: "/usr/bin")!, dirs.firstIndex(of: "/opt/homebrew/bin")!)
        XCTAssertLessThan(dirs.firstIndex(of: "/opt/homebrew/bin")!, dirs.firstIndex(of: "\(home)/.local/bin")!)
        XCTAssertLessThan(
            dirs.firstIndex(of: "\(home)/.nvm/versions/node/v22.19.0/bin")!,
            dirs.firstIndex(of: "\(home)/.nvm/versions/node/v22.9.0/bin")!
        )
        XCTAssertLessThan(
            dirs.firstIndex(of: "\(home)/.nvm/versions/node/v22.9.0/bin")!,
            dirs.firstIndex(of: "\(home)/.nvm/versions/node/v18.20.0/bin")!
        )
        XCTAssertTrue(dirs.contains("\(home)/.npm-global/bin"))
        XCTAssertTrue(dirs.contains("/usr/local/bin"))
        XCTAssertEqual(dirs.filter { $0 == "/opt/homebrew/bin" }.count, 1)

        let repeated = onboardingSearchDirectories(home: home + "/", path: "/opt/homebrew/bin:/usr/bin", entries: { _ in [] })
        XCTAssertEqual(repeated.filter { $0 == "/opt/homebrew/bin" }.count, 1)

        let signals = blank(executables: [
            "/opt/homebrew/bin/codex",
            "\(home)/.local/bin/ego-browser",
            "\(home)/.nvm/versions/node/v22.19.0/bin/kimi",
            "\(home)/.npm-global/bin/grok",
        ], entries: ["\(home)/.nvm/versions/node": ["v22.19.0"]])
        XCTAssertEqual(resolveOnboardingExecutable(name: "codex", override: nil, signals: signals), "/opt/homebrew/bin/codex")
        XCTAssertEqual(resolveOnboardingExecutable(name: "ego-browser", override: nil, signals: signals), "\(home)/.local/bin/ego-browser")
        XCTAssertEqual(resolveOnboardingExecutable(name: "kimi", override: nil, signals: signals), "\(home)/.nvm/versions/node/v22.19.0/bin/kimi")
        XCTAssertEqual(resolveOnboardingExecutable(name: "grok", override: nil, signals: signals), "\(home)/.npm-global/bin/grok")
        XCTAssertTrue(onboardingAugmentedPath(home: home, path: "/usr/bin:/bin", entries: { _ in [] }).contains("\(home)/.local/bin"))
    }

    func testExplicitOverrideHidesPathAndRejectsMissingFile() {
        let signals = blank(
            environment: ["PATH": "/usr/bin:/bin", "RERUN_CODEX_PATH": "/opt/missing/codex"],
            executables: ["/usr/local/bin/codex"]
        )
        XCTAssertNil(resolveOnboardingExecutable(name: "codex", override: signals.environment["RERUN_CODEX_PATH"], signals: signals))
        XCTAssertEqual(evaluateCodex(signals).state, .notInstalled)

        let custom = blank(
            environment: ["PATH": "/usr/bin:/bin", "RERUN_CODEX_PATH": "/opt/My Tools/codex"],
            executables: ["/opt/My Tools/codex"]
        )
        let step = evaluateCodex(custom)
        XCTAssertEqual(step.state, .needsLogin)
        XCTAssertEqual(step.commandText, "'/opt/My Tools/codex' login")
    }

    func testFreshMachineOffersCopyableInstallersAndEgoDownload() {
        let steps = builtInOnboardingSteps(blank())
        XCTAssertEqual(steps.map(\.id), ["codex", "kimi", "grok", "egoLite"])
        XCTAssertEqual(steps.map(\.state), [.notInstalled, .notInstalled, .notInstalled, .notInstalled])
        XCTAssertEqual(steps[0].commandText, "curl -fsSL https://chatgpt.com/codex/install.sh | sh")
        XCTAssertEqual(steps[1].commandText, "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash")
        XCTAssertEqual(steps[2].commandText, "curl -fsSL https://x.ai/cli/install.sh | bash")
        XCTAssertFalse(steps[0].actions.contains { $0.kind == .terminalInstall })
        XCTAssertEqual(steps[3].actions.first?.url, OnboardingLink.egoLiteDownload)
        XCTAssertEqual(steps[3].nameZH, "ego(lite) 浏览器")
        XCTAssertFalse(blob(steps).contains("127.0.0.1"))
        XCTAssertFalse(blob(steps).localizedCaseInsensitiveContains("localhost"))
    }

    func testNpmOnHomebrewPathIsAVisibleInstall() {
        let signals = blank(executables: ["/opt/homebrew/bin/npm"])
        let steps = builtInOnboardingSteps(signals)
        XCTAssertEqual(steps[0].commandText, "npm install -g @openai/codex")
        XCTAssertEqual(steps[1].commandText, "npm install -g @moonshot-ai/kimi-code")
        XCTAssertEqual(steps[2].commandText, "npm install -g @xai-official/grok")
        XCTAssertTrue(steps[0].actions.contains { $0.kind == .terminalInstall })
        XCTAssertEqual(steps[0].actions.first?.titleZH, "在终端中安装")
    }

    func testBrewIsTheFallbackExceptForGrok() {
        let signals = blank(executables: ["/usr/local/bin/brew"])
        let steps = builtInOnboardingSteps(signals)
        XCTAssertEqual(steps[0].commandText, "brew install --cask codex")
        XCTAssertEqual(steps[0].actions.first?.kind, .terminalInstall)
        XCTAssertEqual(steps[1].commandText, "brew install kimi-code")
        XCTAssertEqual(steps[2].commandText, "curl -fsSL https://x.ai/cli/install.sh | bash")
        XCTAssertEqual(steps[2].actions.first?.kind, .copyCommand)
    }

    func testCodexLoginStatusAndCredentialFiles() {
        let binary = ["/opt/homebrew/bin/codex"]
        let loggedIn = blank(executables: Set(binary), status: [OnboardingStepID.codex: 0])
        XCTAssertEqual(evaluateCodex(loggedIn).state, .ready)
        XCTAssertEqual(onboardingStatusQueries(loggedIn).first?.arguments, ["login", "status"])
        XCTAssertEqual(onboardingStatusQueries(loggedIn).first?.executable, "/opt/homebrew/bin/codex")

        let signedOut = blank(
            executables: Set(binary),
            files: ["/Users/ada/.codex/auth.json": #"{"tokens":{"access_token":"access-token-value"}}"#],
            status: [OnboardingStepID.codex: 1]
        )
        XCTAssertEqual(evaluateCodex(signedOut).state, .needsLogin)
        XCTAssertEqual(evaluateCodex(signedOut).commandText, "codex login")

        let apiKey = blank(
            environment: ["PATH": "/usr/bin:/bin", "CODEX_API_KEY": "sk-codex-key"],
            executables: Set(binary),
            status: [OnboardingStepID.codex: 1]
        )
        XCTAssertEqual(evaluateCodex(apiKey).state, .ready)

        let fileOnly = blank(
            executables: Set(binary),
            files: ["/Users/ada/.codex/auth.json": #"{"OPENAI_API_KEY":null,"tokens":{"refresh_token":"refresh-token-value"}}"#]
        )
        XCTAssertEqual(evaluateCodex(fileOnly).state, .ready)

        let empty = blank(
            executables: Set(binary),
            files: ["/Users/ada/.codex/auth.json": #"{"tokens":{"access_token":""}}"#]
        )
        XCTAssertEqual(evaluateCodex(empty).state, .needsLogin)

        let oddExit = blank(
            executables: Set(binary),
            files: ["/Users/ada/.codex/auth.json": #"{"tokens":{"id_token":"id-token-value"}}"#],
            status: [OnboardingStepID.codex: 2]
        )
        XCTAssertEqual(evaluateCodex(oddExit).state, .ready)

        let home = blank(
            environment: ["PATH": "/usr/bin:/bin", "CODEX_HOME": "/tmp/codex-home"],
            executables: Set(binary),
            files: ["/tmp/codex-home/auth.json": #"{"personal_access_token":"pat-token-value"}"#]
        )
        XCTAssertEqual(evaluateCodex(home).state, .ready)
        XCTAssertEqual(onboardingStatusQueries(blank()).count, 0)
    }

    func testKimiCredentialsDoNotTreatABareEnvKeyAsLogin() {
        let binary: Set<String> = ["/opt/homebrew/bin/kimi"]
        let bare = blank(
            environment: ["PATH": "/usr/bin:/bin", "KIMI_API_KEY": "sk-kimi-secret"],
            executables: binary
        )
        XCTAssertEqual(evaluateKimi(bare).state, .needsLogin)
        XCTAssertEqual(evaluateKimi(bare).commandText, "kimi login")

        let wired = blank(
            environment: ["PATH": "/usr/bin:/bin", "KIMI_API_KEY": "sk-kimi-secret"],
            executables: binary,
            files: ["/Users/ada/.kimi-code/config.toml": "api_key_env = \"KIMI_API_KEY\"\n"]
        )
        XCTAssertEqual(evaluateKimi(wired).state, .ready)

        let commented = blank(
            executables: binary,
            files: ["/Users/ada/.kimi-code/config.toml": "# api_key = \"sk-not-a-real-key\"\napi_key = \"short\"\n"]
        )
        XCTAssertEqual(evaluateKimi(commented).state, .needsLogin)

        let inline = blank(
            executables: binary,
            files: ["/Users/ada/.kimi-code/config.toml": "api_key = \"sk-real-key-value\" # note\n"]
        )
        XCTAssertEqual(evaluateKimi(inline).state, .ready)

        let oauth = blank(
            executables: binary,
            files: ["/Users/ada/.kimi-code/credentials/kimi-code.json": #"{"access_token":"kimi-access-token"}"#]
        )
        XCTAssertEqual(evaluateKimi(oauth).state, .ready)

        let moved = blank(
            environment: ["PATH": "/usr/bin:/bin", "KIMI_CODE_HOME": "/srv/kimi"],
            executables: binary,
            files: [
                "/Users/ada/.kimi-code/credentials/kimi-code.json": #"{"access_token":"kimi-access-token"}"#,
                "/srv/kimi/credentials/other.json": #"{"refresh_token":"kimi-refresh-token"}"#,
            ],
            entries: ["/srv/kimi/credentials": ["other.json"]]
        )
        XCTAssertEqual(evaluateKimi(moved).state, .ready)

        let explicit = blank(
            environment: ["PATH": "/usr/bin:/bin", "KIMI_CODE_CREDENTIALS": "/srv/creds.json"],
            executables: binary,
            files: [
                "/Users/ada/.kimi-code/credentials/kimi-code.json": #"{"access_token":"kimi-access-token"}"#,
                "/srv/creds.json": "not json",
            ]
        )
        XCTAssertEqual(evaluateKimi(explicit).state, .needsLogin)
    }

    func testGrokSessionFileAndAPIKey() {
        let binary: Set<String> = ["/usr/local/bin/grok"]
        let live = blank(
            executables: binary,
            files: ["/Users/ada/.grok/auth.json": #"{"https://accounts.x.ai/sign-in":{"key":"grok-session-token","expires_at":"2035-01-01T00:00:00Z"}}"#]
        )
        XCTAssertEqual(evaluateGrok(live).state, .ready)

        let expired = blank(
            executables: binary,
            files: ["/Users/ada/.grok/auth.json": #"{"https://accounts.x.ai/sign-in":{"key":"grok-session-token","expires_at":"2020-01-01T00:00:00Z"}}"#]
        )
        XCTAssertEqual(evaluateGrok(expired).state, .needsLogin)
        XCTAssertEqual(evaluateGrok(expired).commandText, "grok login")

        let key = blank(
            environment: ["PATH": "/usr/bin:/bin", "XAI_API_KEY": "xai-api-key-value"],
            executables: binary,
            files: ["/Users/ada/.grok/auth.json": #"{"https://accounts.x.ai/sign-in":{"key":"grok-session-token","expires_at":"2020-01-01T00:00:00Z"}}"#]
        )
        XCTAssertEqual(evaluateGrok(key).state, .ready)

        let relocated = blank(
            environment: ["PATH": "/usr/bin:/bin", "GROK_HOME": "/srv/grok"],
            executables: binary,
            files: ["/srv/grok/auth.json": #"{"scope":{"key":"grok-session-token"}}"#]
        )
        XCTAssertEqual(evaluateGrok(relocated).state, .ready)
    }

    func testEgoLiteAppAndCommand() {
        let ready = blank(executables: ["/Users/ada/.local/bin/ego-browser"])
        let readyStep = evaluateEgoLite(ready)
        XCTAssertEqual(readyStep.state, .ready)
        XCTAssertTrue(readyStep.actions.isEmpty)

        let appOnly = blank(directories: ["/Applications/ego lite.app"])
        let needs = evaluateEgoLite(appOnly)
        XCTAssertEqual(needs.state, .needsOnboarding)
        XCTAssertEqual(needs.actions.first?.kind, .openApp)
        XCTAssertEqual(needs.actions.first?.appPath, "/Applications/ego lite.app")
        XCTAssertTrue(needs.detailZH?.contains("ego-browser") == true)

        let renamed = blank(directories: ["/Users/ada/Applications/ego lite.app"])
        XCTAssertEqual(evaluateEgoLite(renamed).state, .needsOnboarding)
        XCTAssertEqual(locateEgoLiteApp(home: "/Users/ada", signals: renamed), "/Users/ada/Applications/ego lite.app")

        let missing = evaluateEgoLite(blank())
        XCTAssertEqual(missing.state, .notInstalled)
        XCTAssertEqual(missing.actions.first?.url, "https://lite.ego.app/download")
    }

    func testCatalogReplacesEgoAndAppends() {
        let replacement = OnboardingStep(
            id: OnboardingStepID.egoLite,
            nameEN: "ego(lite) browser",
            nameZH: "ego(lite) 浏览器",
            state: .ready
        )
        let extra = OnboardingStep(id: "future", nameEN: "Future", nameZH: "未来", state: .notInstalled)
        let merged = mergingOnboardingSteps(placeholderOnboardingSteps(), replacements: [replacement, extra])
        XCTAssertEqual(merged.map(\.id), ["codex", "kimi", "grok", "egoLite", "future"])
        XCTAssertEqual(merged[3].state, .ready)
        XCTAssertEqual(OnboardingCatalog.makeSteps(blank()).map(\.id), builtInOnboardingSteps(blank()).map(\.id))
    }

    func testLanguageAppearanceAndFirstRunFlag() {
        XCTAssertEqual(onboardingLanguage(preferredLanguages: ["zh-Hant-TW"]), .zh)
        XCTAssertEqual(onboardingLanguage(preferredLanguages: ["en-US"]), .en)
        XCTAssertEqual(onboardingLanguage(preferredLanguages: ["fr-FR", "zh-CN"]), .en)
        XCTAssertEqual(onboardingLanguage(preferredLanguages: []), .en)
        XCTAssertEqual(onboardingLanguage(preferredLanguages: ["en"], override: "zh-Hans"), .zh)
        XCTAssertEqual(onboardingLanguage(preferredLanguages: ["zh-CN"], override: "  "), .zh)
        XCTAssertEqual(onboardingAppearance(override: "Dark"), .dark)
        XCTAssertNil(onboardingAppearance(override: "blue"))

        XCTAssertTrue(shouldPresentOnboarding(environment: [:], completed: false))
        XCTAssertFalse(shouldPresentOnboarding(environment: [:], completed: true))
        XCTAssertTrue(shouldPresentOnboarding(environment: ["BLINKY_ONBOARDING": "always"], completed: true))
        XCTAssertFalse(shouldPresentOnboarding(environment: ["BLINKY_ONBOARDING": "off"], completed: false))
    }

    func testCopyStaysInLocaleAndHasNoLoopback() {
        let english = OnboardingCopy(language: .en)
        let chinese = OnboardingCopy(language: .zh)
        XCTAssertNotEqual(english.headline, chinese.headline)
        XCTAssertEqual(chinese.headline, "在这台 Mac 上准备工具")
        XCTAssertEqual(chinese.settingsTitle, "编程工具")
        XCTAssertEqual(english.skip, "Skip")
        XCTAssertEqual(chinese.done, "完成")
        for copy in [english, chinese] {
            let text = copy.auditLines.joined(separator: "\n")
            XCTAssertFalse(text.contains("127.0.0.1"))
            XCTAssertFalse(text.localizedCaseInsensitiveContains("localhost"))
            XCTAssertFalse(text.localizedCaseInsensitiveContains("webkit"))
        }
        let showcase = showcaseOnboardingSteps()
        XCTAssertEqual(showcase.map(\.state), [.ready, .needsLogin, .notInstalled, .needsOnboarding])
        XCTAssertFalse(blob(showcase).contains("127.0.0.1"))
    }

    func testTerminalScriptRunsTheCommandAndRefusesPipes() {
        let script = onboardingTerminalScript(command: "npm install -g @openai/codex", language: .zh)
        XCTAssertNotNil(script)
        XCTAssertTrue(script?.contains("\nnpm install -g @openai/codex\n") == true)
        XCTAssertTrue(script?.contains("cd \"$HOME\"") == true)
        XCTAssertTrue(script?.contains("BlinkyBot：已完成。") == true)
        XCTAssertTrue(script?.contains("\"BlinkyBot：命令退出码 $status。\"") == true)
        XCTAssertNil(onboardingTerminalScript(command: "curl -fsSL https://x.ai/cli/install.sh | bash", language: .en))
        XCTAssertNil(onboardingTerminalScript(command: "npm install -g @openai/codex; rm -rf /", language: .en))
        XCTAssertNotNil(onboardingTerminalScript(command: "'/opt/My Tools/codex' login", language: .en))
    }

    func testDirectoryNamedCodexIsNotABinary() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(atPath: root) }
        let bin = root + "/bin"
        try FileManager.default.createDirectory(atPath: bin + "/codex", withIntermediateDirectories: true)
        let file = bin + "/kimi"
        try Data("#!/bin/sh\n".utf8).write(to: URL(fileURLWithPath: file))
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file)
        let signals = OnboardingSignals.readingMachine(
            environment: ["PATH": bin],
            home: root + "/home",
            now: now
        )
        XCTAssertFalse(onboardingFileIsExecutable(bin + "/codex"))
        XCTAssertTrue(onboardingFileIsExecutable(file))
        XCTAssertEqual(evaluateCodex(signals).state, .notInstalled)
        XCTAssertEqual(evaluateKimi(signals).state, .needsLogin)
    }

    func testLiveAuthFileMakesCodexReady() throws {
        let root = temporaryDirectory()
        defer { try? FileManager.default.removeItem(atPath: root) }
        let bin = root + "/bin"
        try FileManager.default.createDirectory(atPath: bin, withIntermediateDirectories: true)
        let codex = bin + "/codex"
        try Data("#!/bin/sh\n".utf8).write(to: URL(fileURLWithPath: codex))
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: codex)
        let home = root + "/codex-home"
        try FileManager.default.createDirectory(atPath: home, withIntermediateDirectories: true)
        try Data(#"{"tokens":{"access_token":"access-token-value"}}"#.utf8).write(to: URL(fileURLWithPath: home + "/auth.json"))
        let signals = OnboardingSignals.readingMachine(
            environment: ["PATH": bin, "CODEX_HOME": home],
            home: root + "/user",
            now: now
        )
        XCTAssertEqual(evaluateCodex(signals).state, .ready)
    }

    private func blank(
        environment: [String: String]? = nil,
        executables: Set<String> = [],
        directories: Set<String> = [],
        files: [String: String] = [:],
        entries: [String: [String]] = [:],
        status: [String: Int32] = [:]
    ) -> OnboardingSignals {
        OnboardingSignals(
            home: "/Users/ada",
            environment: environment ?? ["PATH": "/usr/bin:/bin"],
            now: now,
            isExecutable: { executables.contains($0) },
            isDirectory: { directories.contains($0) },
            readText: { files[$0] },
            entries: { entries[$0] ?? [] },
            statusExit: status
        )
    }

    private func blob(_ steps: [OnboardingStep]) -> String {
        steps.flatMap { step in
            [step.commandText, step.detailEN, step.detailZH, step.nameEN, step.nameZH] + step.actions.flatMap { [$0.command, $0.url, $0.titleEN, $0.titleZH] }
        }
        .compactMap { $0 }
        .joined(separator: "\n")
    }

    private func temporaryDirectory() -> String {
        let dir = FileManager.default.temporaryDirectory.path + "/blinky-onboarding-\(UUID().uuidString)"
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        return dir
    }
}
