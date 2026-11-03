export const site = {
    name: 'BlinkyBot',
    title: 'BlinkyBot | Local AI coworkers on your Mac',
    titleTemplate: '%s | BlinkyBot',
    description:
        'BlinkyBot is a local-first Mac agent hub. It keeps the Rerun board, Foreman, memory, and approval checks, and runs coworkers through CLIs on your machine.',
    url: 'https://app.rerun.build',
    // Captured from `/render/brand/default`, so the card always matches the React stage. Relative on
    // purpose: `metadataBase` resolves it onto this host, which is the one that serves it.
    ogImage: '/og/brand/default',
    ogImageSize: { width: 2400, height: 1260 },
} as const

export function landingUrl(path: string): string {
    const base = (process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://rerun.build').replace(/\/$/, '')
    return `${base}${path}`
}

export function docsUrl(path = ''): string {
    return `https://docs.rerun.build${path}`
}
