// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation
#if canImport(BlinkyLocalRuntime)
import BlinkyLocalRuntime
#endif

/// Built-in probes, in the order the window shows them. `makeSteps` is the
/// plug-in: replace a step by id (`OnboardingStepID.egoLite` is the browser)
/// or append one via `mergingOnboardingSteps`. Set it before the first recheck.
public enum OnboardingCatalog {
    public static var makeSteps: (OnboardingSignals) -> [OnboardingStep] = builtInOnboardingSteps
}

public func builtInOnboardingSteps(_ signals: OnboardingSignals) -> [OnboardingStep] {
    [
        evaluateCodex(signals),
        evaluateKimi(signals),
        evaluateGrok(signals),
        evaluateEgoLite(signals),
    ]
}

public func mergingOnboardingSteps(
    _ steps: [OnboardingStep],
    replacements: [OnboardingStep]
) -> [OnboardingStep] {
    var result = steps
    for replacement in replacements {
        if let index = result.firstIndex(where: { $0.id == replacement.id }) {
            result[index] = replacement
        } else {
            result.append(replacement)
        }
    }
    return result
}

public func placeholderOnboardingSteps() -> [OnboardingStep] {
    [
        onboardingNamedStep(OnboardingStepID.codex, en: "Codex", zh: "Codex"),
        onboardingNamedStep(OnboardingStepID.kimi, en: "Kimi", zh: "Kimi"),
        onboardingNamedStep(OnboardingStepID.grok, en: "Grok", zh: "Grok"),
        onboardingNamedStep(OnboardingStepID.egoLite, en: "ego(lite) browser", zh: "ego(lite) 浏览器"),
    ]
}

public func showcaseOnboardingSteps() -> [OnboardingStep] {
    [
        OnboardingStep(
            id: OnboardingStepID.codex,
            nameEN: "Codex",
            nameZH: "Codex",
            state: .ready
        ),
        OnboardingStep(
            id: OnboardingStepID.kimi,
            nameEN: "Kimi",
            nameZH: "Kimi",
            state: .needsLogin,
            commandText: "kimi login",
            actions: [onboardingLoginAction(command: "kimi login")]
        ),
        OnboardingStep(
            id: OnboardingStepID.grok,
            nameEN: "Grok",
            nameZH: "Grok",
            state: .notInstalled,
            commandText: "npm install -g @xai-official/grok",
            actions: [
                onboardingInstallAction(command: "npm install -g @xai-official/grok"),
                onboardingLinkAction(
                    url: OnboardingLink.grok,
                    titleEN: OnboardingButtonTitle.instructionsEN,
                    titleZH: OnboardingButtonTitle.instructionsZH
                ),
            ]
        ),
        OnboardingStep(
            id: OnboardingStepID.egoLite,
            nameEN: "ego(lite) browser",
            nameZH: "ego(lite) 浏览器",
            state: .needsOnboarding,
            detailEN: "The app is on this Mac, and the ego-browser command is not available yet. Finish setup inside ego(lite). It usually adds ~/.local/bin/ego-browser.",
            detailZH: "这台 Mac 上已有应用，但还找不到 ego-browser。请在 ego(lite) 里完成它自己的引导，它通常会加入 ~/.local/bin/ego-browser。",
            actions: [onboardingOpenAppAction(path: "/Applications/ego lite.app")]
        ),
    ]
}

public func onboardingStatusQueries(_ signals: OnboardingSignals) -> [OnboardingStatusQuery] {
    guard let codex = resolveOnboardingExecutable(
        name: "codex",
        override: signals.environment["RERUN_CODEX_PATH"],
        signals: signals
    ) else {
        return []
    }
    return [OnboardingStatusQuery(id: OnboardingStepID.codex, executable: codex, arguments: ["login", "status"])]
}

public func evaluateCodex(_ signals: OnboardingSignals) -> OnboardingStep {
    let binary = resolveOnboardingExecutable(
        name: "codex",
        override: signals.environment["RERUN_CODEX_PATH"],
        signals: signals
    )
    guard let binary else {
        return onboardingMissingCLI(
            id: OnboardingStepID.codex,
            nameEN: "Codex",
            nameZH: "Codex",
            npm: "npm install -g @openai/codex",
            brew: "brew install --cask codex",
            curl: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
            docs: OnboardingLink.codex,
            signals: signals
        )
    }
    if onboardingEnvironmentHasCredential(signals.environment, keys: ["CODEX_API_KEY", "OPENAI_API_KEY"]) {
        return onboardingReadyCLI(id: OnboardingStepID.codex, nameEN: "Codex", nameZH: "Codex")
    }
    switch signals.statusExit[OnboardingStepID.codex] {
    case 0:
        return onboardingReadyCLI(id: OnboardingStepID.codex, nameEN: "Codex", nameZH: "Codex")
    case 1:
        return onboardingLoginCLI(id: OnboardingStepID.codex, nameEN: "Codex", nameZH: "Codex", binary: binary, standard: "codex")
    default:
        break
    }
    let root = onboardingTrimmed(signals.environment["CODEX_HOME"]) ?? onboardingChildPath(signals.home, ".codex")
    if onboardingTextHasCredential(signals.readText(onboardingChildPath(root, "auth.json"))) {
        return onboardingReadyCLI(id: OnboardingStepID.codex, nameEN: "Codex", nameZH: "Codex")
    }
    return onboardingLoginCLI(id: OnboardingStepID.codex, nameEN: "Codex", nameZH: "Codex", binary: binary, standard: "codex")
}

public func evaluateKimi(_ signals: OnboardingSignals) -> OnboardingStep {
    let binary = resolveOnboardingExecutable(
        name: "kimi",
        override: signals.environment["RERUN_KIMI_PATH"],
        signals: signals
    )
    guard let binary else {
        return onboardingMissingCLI(
            id: OnboardingStepID.kimi,
            nameEN: "Kimi",
            nameZH: "Kimi",
            npm: "npm install -g @moonshot-ai/kimi-code",
            brew: "brew install kimi-code",
            curl: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash",
            docs: OnboardingLink.kimi,
            signals: signals
        )
    }
    if onboardingKimiIsUsable(signals) {
        return onboardingReadyCLI(id: OnboardingStepID.kimi, nameEN: "Kimi", nameZH: "Kimi")
    }
    return onboardingLoginCLI(id: OnboardingStepID.kimi, nameEN: "Kimi", nameZH: "Kimi", binary: binary, standard: "kimi")
}

public func evaluateGrok(_ signals: OnboardingSignals) -> OnboardingStep {
    let binary = resolveOnboardingExecutable(
        name: "grok",
        override: signals.environment["RERUN_GROK_PATH"],
        signals: signals
    )
    guard let binary else {
        return onboardingMissingCLI(
            id: OnboardingStepID.grok,
            nameEN: "Grok",
            nameZH: "Grok",
            npm: "npm install -g @xai-official/grok",
            brew: nil,
            curl: "curl -fsSL https://x.ai/cli/install.sh | bash",
            docs: OnboardingLink.grok,
            signals: signals
        )
    }
    if onboardingEnvironmentHasCredential(signals.environment, keys: ["XAI_API_KEY"]) {
        return onboardingReadyCLI(id: OnboardingStepID.grok, nameEN: "Grok", nameZH: "Grok")
    }
    let root = onboardingTrimmed(signals.environment["GROK_HOME"]) ?? onboardingChildPath(signals.home, ".grok")
    if let object = onboardingJSONObject(signals.readText(onboardingChildPath(root, "auth.json"))),
       onboardingGrokHasLiveKey(object, now: signals.now) || onboardingJSONHasCredential(object) {
        return onboardingReadyCLI(id: OnboardingStepID.grok, nameEN: "Grok", nameZH: "Grok")
    }
    return onboardingLoginCLI(id: OnboardingStepID.grok, nameEN: "Grok", nameZH: "Grok", binary: binary, standard: "grok")
}

/// ego(lite) readiness comes from `EgoLiteDetection`. The expanded PATH is passed
/// in so a GUI launch still finds Homebrew and npm copies; the detector also
/// checks `~/.local/bin`. Not installed links to https://lite.ego.app/download.
public func evaluateEgoLite(_ signals: OnboardingSignals) -> OnboardingStep {
    let status = onboardingEgoStatus(signals)
    switch status.readiness {
    case .ready:
        return OnboardingStep(
            id: OnboardingStepID.egoLite,
            nameEN: "ego(lite) browser",
            nameZH: "ego(lite) 浏览器",
            state: .ready
        )
    case .needsOnboarding:
        return OnboardingStep(
            id: OnboardingStepID.egoLite,
            nameEN: "ego(lite) browser",
            nameZH: "ego(lite) 浏览器",
            state: .needsOnboarding,
            detailEN: EgoLiteCopy.string(.needsOnboarding, preferredLanguages: ["en"]),
            detailZH: EgoLiteCopy.string(.needsOnboarding, preferredLanguages: ["zh-Hans"]),
            actions: status.appPath.map { onboardingOpenAppAction(path: $0) }.map { [$0] } ?? []
        )
    case .notInstalled:
        return OnboardingStep(
            id: OnboardingStepID.egoLite,
            nameEN: "ego(lite) browser",
            nameZH: "ego(lite) 浏览器",
            state: .notInstalled,
            detailEN: EgoLiteCopy.string(.notInstalled, preferredLanguages: ["en"]),
            detailZH: EgoLiteCopy.string(.notInstalled, preferredLanguages: ["zh-Hans"]),
            actions: [
                onboardingLinkAction(
                    url: OnboardingLink.egoLiteDownload,
                    titleEN: OnboardingButtonTitle.downloadEN,
                    titleZH: OnboardingButtonTitle.downloadZH
                ),
            ]
        )
    }
}

public func locateEgoLiteApp(home: String, signals: OnboardingSignals) -> String? {
    onboardingEgoStatus(signals, home: home).appPath
}

private func onboardingEgoStatus(_ signals: OnboardingSignals, home: String? = nil) -> EgoLiteStatus {
    let root = onboardingNormalizedHome(home ?? signals.home)
    let path = onboardingAugmentedPath(
        home: root,
        path: signals.environment["PATH"],
        entries: signals.entries
    )
    return EgoLiteDetection.detect(
        home: root,
        path: path,
        fileExists: signals.isDirectory,
        isExecutable: signals.isExecutable
    )
}

private func onboardingKimiIsUsable(_ signals: OnboardingSignals) -> Bool {
    let root = onboardingTrimmed(signals.environment["KIMI_CODE_HOME"]) ?? onboardingChildPath(signals.home, ".kimi-code")
    if let config = signals.readText(onboardingChildPath(root, "config.toml")) {
        let inline = onboardingTomlValues(key: "api_key", in: config) + onboardingTomlValues(key: "KIMI_API_KEY", in: config)
        if inline.contains(where: onboardingIsCredential) {
            return true
        }
        for name in onboardingTomlValues(key: "api_key_env", in: config) {
            if let value = signals.environment[name], onboardingIsCredential(value) {
                return true
            }
        }
    }
    if let explicit = onboardingTrimmed(signals.environment["KIMI_CODE_CREDENTIALS"])
        ?? onboardingTrimmed(signals.environment["KIMI_CREDENTIALS"]) {
        return onboardingTextHasCredential(signals.readText(explicit))
    }
    let credentials = onboardingChildPath(root, "credentials")
    if onboardingTextHasCredential(signals.readText(onboardingChildPath(credentials, "kimi-code.json"))) {
        return true
    }
    for name in signals.entries(credentials) where name.hasSuffix(".json") {
        if onboardingTextHasCredential(signals.readText(onboardingChildPath(credentials, name))) {
            return true
        }
    }
    return false
}

private func onboardingMissingCLI(
    id: String,
    nameEN: String,
    nameZH: String,
    npm: String,
    brew: String?,
    curl: String,
    docs: String,
    signals: OnboardingSignals
) -> OnboardingStep {
    let link = onboardingLinkAction(
        url: docs,
        titleEN: OnboardingButtonTitle.instructionsEN,
        titleZH: OnboardingButtonTitle.instructionsZH
    )
    let npmPath = resolveOnboardingExecutable(name: "npm", override: nil, signals: signals)
    let brewPath = resolveOnboardingExecutable(name: "brew", override: nil, signals: signals)
    if npmPath != nil {
        return OnboardingStep(
            id: id,
            nameEN: nameEN,
            nameZH: nameZH,
            state: .notInstalled,
            commandText: npm,
            actions: [onboardingInstallAction(command: npm), link]
        )
    }
    if brewPath != nil, let brew {
        return OnboardingStep(
            id: id,
            nameEN: nameEN,
            nameZH: nameZH,
            state: .notInstalled,
            commandText: brew,
            actions: [onboardingInstallAction(command: brew), link]
        )
    }
    return OnboardingStep(
        id: id,
        nameEN: nameEN,
        nameZH: nameZH,
        state: .notInstalled,
        commandText: curl,
        actions: [
            OnboardingAction(kind: .copyCommand, command: curl, titleEN: "Copy", titleZH: "复制"),
            link,
        ]
    )
}

private func onboardingReadyCLI(id: String, nameEN: String, nameZH: String) -> OnboardingStep {
    OnboardingStep(id: id, nameEN: nameEN, nameZH: nameZH, state: .ready)
}

private func onboardingLoginCLI(
    id: String,
    nameEN: String,
    nameZH: String,
    binary: String,
    standard: String
) -> OnboardingStep {
    let command = onboardingShellName(resolved: binary, standard: standard) + " login"
    return OnboardingStep(
        id: id,
        nameEN: nameEN,
        nameZH: nameZH,
        state: .needsLogin,
        commandText: command,
        actions: [onboardingLoginAction(command: command)]
    )
}

private func onboardingNamedStep(_ id: String, en: String, zh: String) -> OnboardingStep {
    OnboardingStep(id: id, nameEN: en, nameZH: zh, state: .notInstalled, isPlaceholder: true)
}

private func onboardingInstallAction(command: String) -> OnboardingAction {
    OnboardingAction(
        kind: .terminalInstall,
        command: command,
        titleEN: OnboardingButtonTitle.installEN,
        titleZH: OnboardingButtonTitle.installZH
    )
}

private func onboardingLoginAction(command: String) -> OnboardingAction {
    OnboardingAction(
        kind: .terminalLogin,
        command: command,
        titleEN: OnboardingButtonTitle.loginEN,
        titleZH: OnboardingButtonTitle.loginZH
    )
}

private func onboardingLinkAction(url: String, titleEN: String, titleZH: String) -> OnboardingAction {
    OnboardingAction(kind: .openURL, url: url, titleEN: titleEN, titleZH: titleZH)
}

private func onboardingOpenAppAction(path: String) -> OnboardingAction {
    OnboardingAction(
        kind: .openApp,
        appPath: path,
        titleEN: OnboardingButtonTitle.openEgoEN,
        titleZH: OnboardingButtonTitle.openEgoZH
    )
}
