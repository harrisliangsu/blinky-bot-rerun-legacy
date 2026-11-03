import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const report = fileURLToPath(new URL('./report.mjs', import.meta.url))

test('the report lists real and stubbed dependencies and skips', () => {
    const out = mkdtempSync(join(tmpdir(), 'blinky-report-'))
    writeFileSync(join(out, 'deps.json'), JSON.stringify({
        codex: { kind: 'stub', detail: 'e2e stub' },
        'ego-browser': { kind: 'real', detail: 'helper from the disk image' },
        rex: { kind: 'absent', detail: 'not on this tree' },
    }))
    writeFileSync(join(out, 'launch.json'), JSON.stringify({ ok: true, detail: 'up' }))
    writeFileSync(join(out, 'rex.json'), JSON.stringify({ ok: true, detail: 'Skipped: Rex toggle (rex) is not on this tree.' }))
    writeFileSync(join(out, 'crash.json'), JSON.stringify({ ok: false, detail: 'no friendly title' }))
    const run = spawnSync(process.execPath, [report, out], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const junit = readFileSync(join(out, 'junit.xml'), 'utf8')
    assert.match(junit, /failures="1"/)
    assert.match(junit, /<skipped message="Skipped: Rex/)
    assert.match(junit, /<failure message="Crash diagnostics">/)
    const html = readFileSync(join(out, 'report.html'), 'utf8')
    assert.match(html, /ego-browser/)
    assert.match(html, />real</)
    assert.match(html, />stub</)
    assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /ego-browser\*\*: real/)
})
