// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 BlinkyBot contributors.

import Foundation

#if os(macOS)
#if canImport(BlinkyOnboarding)
import BlinkyOnboarding
#endif
import AppKit
import SwiftUI

struct OnboardingScreen: View {
    @EnvironmentObject private var model: OnboardingModel

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 24)
                    .padding(.top, 22)
                    .padding(.bottom, 16)
                Divider()
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(model.steps) { step in
                            stepCard(step)
                        }
                    }
                    .padding(20)
                }
                Divider()
                footer
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
            }
            .frame(maxWidth: 680, maxHeight: .infinity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityAddTraits(.isModal)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 48, height: 48)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.copy.headline)
                        .font(.title2.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(model.copy.subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let notice = model.notice {
                Text(notice)
                    .font(.callout)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.copy.footer)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    recheckButton
                    Spacer(minLength: 12)
                    skipButton
                    doneButton
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        skipButton
                        doneButton
                    }
                    recheckButton
                }
            }
        }
    }

    private var recheckButton: some View {
        Button(action: { model.recheck() }) {
            if model.checking {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text(model.copy.checking)
                }
            } else {
                Text(model.copy.recheck)
            }
        }
        .disabled(model.checking)
        .controlSize(.large)
    }

    private var skipButton: some View {
        Button(model.copy.skip, action: { model.complete() })
            .keyboardShortcut(.cancelAction)
            .controlSize(.large)
    }

    private var doneButton: some View {
        Button(model.copy.done, action: { model.complete() })
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
    }

    private func stepCard(_ step: OnboardingStep) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol(step))
                    .font(.title2)
                    .foregroundStyle(statusColor(step))
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.copy.name(step))
                        .font(.headline)
                    Text(statusLine(step))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            if let detail = model.copy.detail(step), !(model.checking && step.isPlaceholder) {
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let command = step.commandText, !(model.checking && step.isPlaceholder) {
                commandWell(command, step: step)
            }
            let buttons = step.actions.filter { $0.kind != .copyCommand }
            if !buttons.isEmpty && !(model.checking && step.isPlaceholder) {
                actionRow(buttons)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func commandWell(_ command: String, step: OnboardingStep) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(command)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(model.copiedID == step.id ? model.copy.copied : model.copy.copy) {
                model.copyCommand(for: step)
            }
            .controlSize(.small)
        }
        .padding(8)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func actionRow(_ actions: [OnboardingAction]) -> some View {
        let primary = actions.first?.id
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                ForEach(actions) { action in
                    actionButton(action, prominent: action.id == primary && action.kind != .openURL)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(actions) { action in
                    actionButton(action, prominent: action.id == primary && action.kind != .openURL)
                }
            }
        }
    }

    @ViewBuilder
    private func actionButton(_ action: OnboardingAction, prominent: Bool) -> some View {
        let label = model.copy.actionTitle(action)
        let busy = model.checking && (action.kind == .terminalInstall || action.kind == .terminalLogin)
        if prominent {
            Button(label) { model.perform(action) }
                .disabled(busy)
                .buttonStyle(.borderedProminent)
        } else {
            Button(label) { model.perform(action) }
                .disabled(busy)
                .buttonStyle(.bordered)
        }
    }

    private func statusLine(_ step: OnboardingStep) -> String {
        if model.checking && step.isPlaceholder {
            return model.copy.checking
        }
        return model.copy.status(step.state)
    }

    private func symbol(_ step: OnboardingStep) -> String {
        if model.checking && step.isPlaceholder {
            return "ellipsis.circle"
        }
        switch step.state {
        case .ready:
            return "checkmark.circle.fill"
        case .needsLogin:
            return "exclamationmark.circle.fill"
        case .needsOnboarding:
            return "arrow.right.circle.fill"
        case .notInstalled:
            return "arrow.down.circle"
        }
    }

    private func statusColor(_ step: OnboardingStep) -> Color {
        if model.checking && step.isPlaceholder {
            return .secondary
        }
        switch step.state {
        case .ready:
            return .green
        case .needsLogin, .needsOnboarding:
            return .orange
        case .notInstalled:
            return .secondary
        }
    }
}

#endif
