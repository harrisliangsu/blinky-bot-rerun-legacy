import { describe, expect, it } from 'vitest'
import { classifyGitFailure } from './git-error.js'

describe('classifyGitFailure', () => {
    it('tells a missing permission apart from an unreachable host', () => {
        expect(classifyGitFailure('fatal: Could not read from remote repository.\nPlease make sure you have the correct access rights', false)).toMatchObject({
            kind: 'permission',
            status: 403,
        })
        expect(classifyGitFailure('Permission denied (publickey).', false).message).toMatch(/does not store git passwords/)
        expect(classifyGitFailure('fatal: unable to access: Could not resolve host: git.example', false).kind).toBe('unreachable')
        expect(classifyGitFailure('slow', true).kind).toBe('timeout')
    })
})
