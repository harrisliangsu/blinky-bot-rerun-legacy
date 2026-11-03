import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) {
    console.error('Usage: node e2e/report.mjs <e2e/out>')
    process.exit(1)
}

const features = readJson('features.json')
const deps = readJson('deps.json')
const sections = [
    ['Launch', readJson('launch.json')],
    ['Window', readJson('window.json')],
    ['Onboarding', readJson('onboarding.json')],
    ['Coworker create', readJson('core.json')],
    ['Chat CLIs', readJson('clis.json')],
    ['Persistence', readJson('persist.json')],
    ['Menu bar', readJson('menubar.json')],
    ['Crash diagnostics', readJson('crash.json')],
    ['Ego routing', readJson('ego.json')],
    ['Ego missing', readJson('ego-missing.json')],
    ['Workspace clone', readJson('workspace.json')],
    ['Rex', readJson('rex.json')],
    ['Sparkle', readJson('sparkle.json')],
]

const lines = ['# BlinkyBot E2E', '']
if (deps) {
    lines.push('## Dependencies', '')
    for (const [name, row] of Object.entries(deps)) {
        lines.push(`- **${name}**: ${row.kind} — ${row.detail}`)
    }
    lines.push('')
}
if (features) {
    lines.push('## Feature hooks', '')
    for (const feature of Object.values(features)) {
        lines.push(`- **${feature.title}** (\`${feature.id}\`): ${feature.enabled ? `enabled — ${feature.reason}` : feature.reason}`)
    }
    lines.push('')
}
for (const [title, body] of sections) {
    if (!body) continue
    lines.push(`## ${title}`, '', verdict(body), '', body.detail || '', '')
}
const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n')
writeFileSync(join(out, 'report.md'), markdown)
writeFileSync(join(out, 'junit.xml'), junit(sections))
writeFileSync(join(out, 'report.html'), html(markdown, sections))
if (process.env.GITHUB_STEP_SUMMARY) {
    const previous = readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8')
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${previous}\n${markdown}\n`)
}
process.stdout.write(markdown)

function verdict(body) {
    if (skipped(body)) return 'Skipped.'
    return body.ok ? 'Passed.' : 'Failed.'
}

function skipped(body) {
    return Boolean(body && body.ok && typeof body.detail === 'string' && body.detail.startsWith('Skipped:'))
}

function junit(rows) {
    const cases = rows.filter(([, body]) => body)
    const failures = cases.filter(([, body]) => body && !body.ok).length
    const skips = cases.filter(([, body]) => skipped(body)).length
    const body = cases
        .map(([title, row]) => {
            const name = escapeXml(title)
            if (!row.ok) return `  <testcase name="${name}" classname="blinky.e2e"><failure message="${name}"><![CDATA[${row.detail || ''}]]></failure></testcase>`
            if (skipped(row)) return `  <testcase name="${name}" classname="blinky.e2e"><skipped message="${escapeXml(row.detail || '')}"/></testcase>`
            return `  <testcase name="${name}" classname="blinky.e2e"/>`
        })
        .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="blinky-e2e" tests="${cases.length}" failures="${failures}" skipped="${skips}">\n${body}\n</testsuite>\n`
}

function html(markdown, rows) {
    const shots = listShots()
    const images = shots.map(name => `<figure><img src="screenshots/${escapeHtml(name)}" alt="${escapeHtml(name)}"><figcaption>${escapeHtml(name)}</figcaption></figure>`).join('\n')
    const rowsHtml = rows
        .filter(([, body]) => body)
        .map(([title, body]) => `<section><h2>${escapeHtml(title)}</h2><p><strong>${escapeHtml(verdict(body))}</strong></p><pre>${escapeHtml(body.detail || '')}</pre></section>`)
        .join('\n')
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BlinkyBot E2E</title>
<style>
body { font: 15px/1.45 -apple-system, BlinkMacSystemFont, sans-serif; margin: 24px; color: #1d1d1f; }
h1 { font-size: 1.6rem; }
table { border-collapse: collapse; width: 100%; max-width: 880px; }
td, th { border-bottom: 1px solid #ddd; text-align: left; padding: 6px 8px; vertical-align: top; }
pre { white-space: pre-wrap; background: #f5f5f7; padding: 12px; border-radius: 8px; }
figure { margin: 0 0 16px; }
img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
</style>
</head>
<body>
<h1>BlinkyBot E2E</h1>
${depsTable()}
${rowsHtml}
<h2>Screenshots</h2>
${images || '<p>No screenshots.</p>'}
<details><summary>Markdown</summary><pre>${escapeHtml(markdown)}</pre></details>
</body>
</html>
`
}

function depsTable() {
    if (!deps) return ''
    const rows = Object.entries(deps)
        .map(([name, row]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.detail)}</td></tr>`)
        .join('')
    return `<h2>Dependencies</h2><table><thead><tr><th>Dependency</th><th>Used</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`
}

function listShots() {
    try {
        return readdirSync(join(out, 'screenshots')).filter(name => name.endsWith('.png')).sort()
    } catch {
        return []
    }
}

function readJson(name) {
    try {
        return JSON.parse(readFileSync(join(out, name), 'utf8'))
    } catch {
        return null
    }
}

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXml(value) {
    return escapeHtml(value).replace(/"/g, '&quot;')
}
