import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) {
    console.error('Usage: node e2e/report.mjs <e2e/out>')
    process.exit(1)
}

const features = readJson('features.json')
const sections = [
    ['Launch', readJson('launch.json')],
    ['Window', readJson('window.json')],
    ['Core flow', readJson('core.json')],
    ['Persistence', readJson('persist.json')],
    ['Menu bar', readJson('menubar.json')],
    ['Crash diagnostics', readJson('crash.json')],
    ['Sparkle', readJson('sparkle.json')],
]

const lines = ['# BlinkyBot E2E', '']
if (features) {
    lines.push('## Feature hooks', '')
    for (const feature of Object.values(features)) {
        lines.push(`- **${feature.title}** (\`${feature.id}\`): ${feature.enabled ? `enabled — ${feature.reason}` : feature.reason}`)
    }
    lines.push('')
}
for (const [title, body] of sections) {
    if (!body) continue
    lines.push(`## ${title}`, '', body.ok ? 'Passed.' : 'Failed.', '', body.detail || '', '')
}
const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n')
writeFileSync(join(out, 'report.md'), markdown)
if (process.env.GITHUB_STEP_SUMMARY) {
    const previous = readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8')
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${previous}\n${markdown}\n`)
}
process.stdout.write(markdown)

function readJson(name) {
    try {
        return JSON.parse(readFileSync(join(out, name), 'utf8'))
    } catch {
        return null
    }
}
