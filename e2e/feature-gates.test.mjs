import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeFeatures } from './feature-gates.mjs'

test('feature hooks stay skipped until their code is on the tree', () => {
    const root = tree({})
    const features = probeFeatures(root)
    for (const feature of Object.values(features)) {
        assert.equal(feature.enabled, false)
        assert.match(feature.reason, /^Skipped:/)
    }
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
