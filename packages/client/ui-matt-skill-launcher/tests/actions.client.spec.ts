import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTIONS, encodeActions, parseActions } from '../src/client/actions.ts'

describe('mattpocock-DSH CodingAction document', () => {
  it('ships skill and prompt rows without automatic execution metadata', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => a.kind === 'skill').length).toBeGreaterThan(4)
    expect(actions.filter(a => a.kind === 'prompt').map(a => a.id)).toEqual(['image','commit'])
    expect(actions.every(a => a.enabled)).toBe(true)
    expect(new Set(actions.map(a => a.id)).size).toBe(actions.length)
  })
  it('roundtrips saved config without changing user-defined labels', () => {
    const actions = DEFAULT_ACTIONS.map((a, index) => ({ ...a, label: index === 0 ? '自定义' : a.label }))
    expect(parseActions(encodeActions(actions))).toEqual(actions)
  })
  it('preserves an intentionally empty action list', () => {
    expect(parseActions(encodeActions([]))).toEqual([])
  })
  it.each([
    '{not-json',
    '{"schemaVersion":2,"actions":[]}',
    '{"schemaVersion":1,"actions":[{"id":"a"}]}',
    '{"schemaVersion":1,"actions":[{"id":"a","kind":"skill","label":"x","skillId":"A","prompt":"","enabled":true,"order":1,"description":"","example":""}]}',
  ])('rejects malformed configuration instead of silently resetting it', (raw) => {
    expect(() => parseActions(raw)).toThrow()
  })
  it('rejects duplicates and invalid sort order', () => {
    const a = DEFAULT_ACTIONS.find(action => action.id === 'discussion')
    if (a === undefined) throw new Error('Missing default discussion action')
    expect(() => parseActions(encodeActions([a,a]))).toThrow()
    expect(() => parseActions(encodeActions([{ ...a, order: Number.NaN }]))).toThrow()
  })
})
