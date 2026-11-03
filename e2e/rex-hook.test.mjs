import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertRexLaunch, rexGate } from './rex-hook.mjs'

test('the rex hook stays skipped until the marker is on the tree', () => {
    const skipped = rexGate([{ path: 'apps/mac-shell/Sources/BlinkyBot/ContentView.swift', text: 'Compose' }])
    assert.equal(skipped.enabled, false)
    assert.match(skipped.reason, /^Skipped:/)
    const enabled = rexGate([{ path: 'apps/mac-shell/Sources/BlinkyLocalRuntime/RexDetection.swift', text: 'blinky-rex-watch' }])
    assert.equal(enabled.enabled, true)
    assert.match(enabled.reason, /RexDetection.swift/)
})

test('a rex launch has to stay on the local server', () => {
    const local = 'rex run --json --keep-open --shell=none --focus=false -s session:blinky'
    assert.match(assertRexLaunch(local), /local server/)
    assert.throws(() => assertRexLaunch('rex run --extra-listen tcp://0.0.0.0:7681 --keep-open --shell=none'), /publish/)
    assert.throws(() => assertRexLaunch('rex run --shell=none'), /local terminal/)
})
