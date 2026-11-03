// SPDX-License-Identifier: AGPL-3.0-only
// Hook for the macOS end-to-end suite. The suite skips a feature whose marker
// is not on the tree it is testing.

export function rexGate(files) {
    const hit = files.find(file => file.text.includes('blinky-rex-watch'))
    if (hit) {
        return { id: 'rex-watch', title: 'Watch agents in Rex', enabled: true, reason: `blinky-rex-watch in ${hit.path}` }
    }
    return { id: 'rex-watch', title: 'Watch agents in Rex', enabled: false, reason: 'Skipped: Watch agents in Rex (rex-watch) is not on this tree.' }
}

const published = /(?:^|\s)(?:--listen|--extra-listen|--allow-anonymous|--tailscale|--server|-S)(?:\s|=|$)/

export function assertRexLaunch(log) {
    if (!log.includes('--shell=none') || !log.includes('--keep-open')) {
        throw new Error('Rex was not asked to run the agent in a local terminal.')
    }
    if (published.test(log)) {
        throw new Error('Rex launch tried to publish the server.')
    }
    return 'Rex ran the agent with rex run --shell=none on the local server.'
}
