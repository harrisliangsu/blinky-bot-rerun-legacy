// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyOnboarding)
import BlinkyOnboarding
#endif
import SwiftUI

@MainActor
final class OnboardingModel: ObservableObject {
    @Published var isShowing: Bool
    @Published var steps: [OnboardingStep]
    @Published var checking = false
    @Published var language: OnboardingLanguage
    @Published var copiedID: String?
    @Published var notice: String?

    let forcedAppearance: OnboardingAppearance?
    private var generation = 0
    private let useFixture: Bool

    var copy: OnboardingCopy { OnboardingCopy(language: language) }

    var colorScheme: ColorScheme? {
        switch forcedAppearance {
        case .light:
            return .light
        case .dark:
            return .dark
        case nil:
            return nil
        }
    }

    init(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard,
        preferredLanguages: [String] = Locale.preferredLanguages
    ) {
        language = onboardingLanguage(
            preferredLanguages: preferredLanguages,
            override: environment[OnboardingEnvironmentKey.language]
        )
        forcedAppearance = onboardingAppearance(override: environment[OnboardingEnvironmentKey.appearance])
        useFixture = environment[OnboardingEnvironmentKey.fixture] == OnboardingEnvironmentKey.showcase
        let completed = defaults.bool(forKey: OnboardingDefaultsKey.completed)
        isShowing = shouldPresentOnboarding(environment: environment, completed: completed)
        if useFixture {
            steps = showcaseOnboardingSteps()
        } else {
            steps = placeholderOnboardingSteps()
        }
        if isShowing && !useFixture {
            recheck()
        }
    }

    func present() {
        notice = nil
        if useFixture {
            steps = showcaseOnboardingSteps()
            checking = false
        } else {
            recheck()
        }
        isShowing = true
        focusBlinkyMainWindow()
    }

    func complete() {
        UserDefaults.standard.set(true, forKey: OnboardingDefaultsKey.completed)
        notice = nil
        isShowing = false
    }

    func recheck() {
        guard !useFixture else {
            steps = showcaseOnboardingSteps()
            checking = false
            return
        }
        generation += 1
        let ticket = generation
        checking = true
        notice = nil
        let environment = ProcessInfo.processInfo.environment
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let makeSteps = OnboardingCatalog.makeSteps
        Task.detached {
            let probed = probeOnboarding(environment: environment, home: home, makeSteps: makeSteps)
            await MainActor.run {
                guard ticket == self.generation else { return }
                self.steps = probed
                self.checking = false
            }
        }
    }

    func perform(_ action: OnboardingAction) {
        switch action.kind {
        case .terminalInstall, .terminalLogin:
            guard let command = action.command else { return }
            if openOnboardingTerminal(command: command, language: language) {
                notice = nil
            } else {
                notice = copy.terminalError
            }
        case .openURL:
            guard let url = action.url, openOnboardingLink(url) else {
                notice = copy.terminalError
                return
            }
            notice = nil
        case .openApp:
            guard let path = action.appPath, openOnboardingApp(path) else {
                notice = copy.terminalError
                return
            }
            notice = nil
        case .copyCommand:
            guard let command = action.command else { return }
            copyToPasteboard(command, stepID: action.id)
        }
    }

    func copyCommand(for step: OnboardingStep) {
        guard let command = step.commandText else { return }
        copyToPasteboard(command, stepID: step.id)
    }

    private func copyToPasteboard(_ command: String, stepID: String) {
        let board = NSPasteboard.general
        board.clearContents()
        board.setString(command, forType: .string)
        copiedID = stepID
        Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if copiedID == stepID {
                copiedID = nil
            }
        }
    }
}
#endif
