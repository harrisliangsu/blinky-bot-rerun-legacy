import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { egoSkillDirs, egoSkillSourceDir, ensureEgoBrowserSkill } from './ego-skill.js'

describe('ensureEgoBrowserSkill', () => {
    it('copies the skill into each CLI directory and leaves an existing one alone', async () => {
        const home = mkdtempSync(join(tmpdir(), 'ego-skill-'))
        const source = egoSkillSourceDir()
        expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toContain('ego-browser skill')
        const first = await ensureEgoBrowserSkill(home, source)
        expect(first.sort()).toEqual(egoSkillDirs(home).sort())
        for (const dir of egoSkillDirs(home)) {
            expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('name: ego-browser')
            expect(readFileSync(join(dir, 'scripts', 'install.sh'), 'utf8')).toContain('ego lite')
        }
        const kimi = join(home, '.kimi-code', 'skills', 'ego-browser')
        writeFileSync(join(kimi, 'SKILL.md'), 'already onboarded')
        const second = await ensureEgoBrowserSkill(home, source)
        expect(second).not.toContain(kimi)
        expect(readFileSync(join(kimi, 'SKILL.md'), 'utf8')).toBe('already onboarded')
        expect(second).toHaveLength(0)
    })

    it('does nothing when the bundled skill is missing', async () => {
        const home = mkdtempSync(join(tmpdir(), 'ego-skill-missing-'))
        const source = join(home, 'empty')
        mkdirSync(source)
        expect(await ensureEgoBrowserSkill(home, source)).toEqual([])
    })
})
