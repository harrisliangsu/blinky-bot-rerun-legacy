import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { probeFeatures } from './feature-gates.mjs'

test('feature hooks stay skipped until their code is on the tree', () => {
    const root = tree({})
    const features = probeFeatures(root)
    for (const feature of Object.values(features)) {
        assert.equal(feature.enabled, false)
        assert.match(feature.reason, /^Skipped:/)
    }
})

test('a Sparkle build product does not turn on the menu bar hook', () => {
    const root = tree({
        'apps/mac-shell/.build/debug/Sparkle.framework/Updater.app/Contents/Info.plist': '<key>LSUIElement</key>',
        'apps/mac-shell/Sources/BlinkyBot/ContentView.swift': 'struct ContentView {}',
    })
    const features = probeFeatures(root)
    assert.equal(features.menuBar.enabled, false)
    assert.match(features.menuBar.reason, /^Skipped:/)
})

test('a landed marker enables only that hook', () => {
    const root = tree({
        'apps/mac-shell/Sources/BlinkyBot/FirstRunOnboarding.swift': 'struct FirstRunOnboarding {}',
        'apps/mac-shell/Sources/BlinkyBot/MenuBar.swift': 'MenuBarExtra("BlinkyBot") {}',
        'apps/engine/src/browser/ego.ts': 'const bin = "ego-browser"',
    })
    const features = probeFeatures(root)
    assert.equal(features.onboarding.enabled, true)
    assert.equal(features.menuBar.enabled, true)
    assert.equal(features.crashDiagnostics.enabled, false)
    assert.match(features.crashDiagnostics.reason, /bc-0a7b6354/)
    assert.equal(features.ego.enabled, true)
    assert.match(features.ego.reason, /ego-browser/)
    assert.equal(features.workspaceClone.enabled, false)
    assert.equal(features.rex.enabled, false)
})

test('the service error view turns on crash diagnostics without turning on Rex', () => {
    const root = tree({
        'apps/mac-shell/Sources/BlinkyBot/BlinkyBotApp.swift': 'MenuBarExtra { MenuBarMenu() }',
        'apps/mac-shell/Sources/BlinkyBot/ServiceErrorView.swift': 'struct ServiceErrorView: View {}',
        'apps/mac-shell/Sources/BlinkyLocalRuntime/ServiceDiagnostics.swift': 'title: "That port is already in use"',
    })
    const features = probeFeatures(root)
    assert.equal(features.menuBar.enabled, true)
    assert.equal(features.crashDiagnostics.enabled, true)
    assert.match(features.crashDiagnostics.reason, /That port is already in use|ServiceErrorView/)
    assert.equal(features.rex.enabled, false)
    assert.equal(features.workspaceClone.enabled, false)
})

test('this checkout runs the cases whose code is already on main', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const features = probeFeatures(root)
    assert.equal(features.onboarding.enabled, true)
    assert.equal(features.menuBar.enabled, true)
    assert.equal(features.crashDiagnostics.enabled, true)
    assert.equal(features.ego.enabled, true)
    assert.equal(features.workspaceClone.enabled, false)
    assert.equal(features.rex.enabled, false)
})

function tree(files) {
    const root = mkdtempSync(join(tmpdir(), 'blinky-gates-'))
    for (const [path, body] of Object.entries(files)) {
        const full = join(root, path)
        mkdirSync(join(full, '..'), { recursive: true })
        writeFileSync(full, body)
    }
    return root
}
