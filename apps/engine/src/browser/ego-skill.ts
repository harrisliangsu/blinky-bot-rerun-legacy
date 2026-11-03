import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Directories the coding CLIs scan for skills. ego(lite) onboarding writes
// ~/.agents/skills and ~/.claude/skills; Kimi also reads ~/.kimi-code/skills
// and ~/.kimi/skills; Grok reads ~/.grok/skills; Codex reads ~/.codex/skills.
export function egoSkillDirs(home: string): string[] {
    return [
        join(home, '.agents', 'skills', 'ego-browser'),
        join(home, '.claude', 'skills', 'ego-browser'),
        join(home, '.codex', 'skills', 'ego-browser'),
        join(home, '.kimi', 'skills', 'ego-browser'),
        join(home, '.kimi-code', 'skills', 'ego-browser'),
        join(home, '.grok', 'skills', 'ego-browser'),
    ]
}

export function egoSkillSourceDir(): string {
    return fileURLToPath(new URL('../../assets/skills/ego-browser/', import.meta.url))
}

export async function ensureEgoBrowserSkill(home = homedir(), sourceDir = egoSkillSourceDir()): Promise<string[]> {
    if (!existsSync(join(sourceDir, 'SKILL.md'))) return []
    const written: string[] = []
    for (const dest of egoSkillDirs(home)) {
        if (existsSync(join(dest, 'SKILL.md'))) continue
        await mkdir(dirname(dest), { recursive: true })
        await cp(sourceDir, dest, { recursive: true })
        written.push(dest)
    }
    return written
}
