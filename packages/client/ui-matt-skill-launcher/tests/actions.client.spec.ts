import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTIONS, encodeActions, parseActions, resolveActionGroup, missingDefaultActions, displayOrder } from '../src/client/actions.ts'

describe('mattpocock-DSH CodingAction document', () => {
  it('ships skill and prompt rows without automatic execution metadata', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => a.kind === 'skill').length).toBeGreaterThan(4)
    expect(actions.filter(a => a.kind === 'prompt').map(a => a.id)).toEqual(['ask','image','commit','review-fix','compile','continue'])
    expect(actions.every(a => a.enabled)).toBe(true)
    expect(new Set(actions.map(a => a.id)).size).toBe(actions.length)
  })
  it('exposes both discussion modes and all seven document Skills', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => resolveActionGroup(a) === 'development').map(a => a.id))
      .toEqual(['initialize', 'ask', 'discussion', 'spec', 'plan', 'execute', 'bug', 'review', 'visual'])
    expect(actions.filter(a => resolveActionGroup(a) === 'document').map(a => a.id))
      .toEqual(['api-docs','requirements','overview','outline','database','doc-merge','docx'])
    expect(actions.filter(a => resolveActionGroup(a) === 'more').map(a => a.id))
      .toEqual(['tickets','tdd'])
  })
  it('supports legacy saved config without forcing reset', () => {
    const previous = DEFAULT_ACTIONS.filter(a => !['initialize','ask','review-fix','compile','continue'].includes(a.id))
    const loaded = parseActions(encodeActions(previous))
    expect(loaded.filter(a => resolveActionGroup(a) === 'document')).toHaveLength(7)
    const visual = loaded.find(a => a.id === 'visual')
    expect(visual).toBeDefined()
    expect(resolveActionGroup(visual!)).toBe('development')
    expect(displayOrder({ ...visual!, order: 100 })).toBe(15)
    expect(missingDefaultActions(loaded).map(a => a.id)).toEqual(['initialize','ask','review-fix','compile','continue'])
    expect(missingDefaultActions([...loaded,...missingDefaultActions(loaded)])).toEqual([])
  })
  it('honors explicit groups for custom actions and rejects invalid groups', () => {
    const base = DEFAULT_ACTIONS[0]!
    const custom = { ...base, id: 'custom-one', order: 300, group: 'utility' as const }
    expect(resolveActionGroup(parseActions(encodeActions([custom]))[0]!)).toBe('utility')
    expect(resolveActionGroup({ ...custom, group: undefined })).toBe('more')
    expect(() => parseActions(encodeActions([{...custom, group: 'unexpected' as typeof custom.group}]))).toThrow()
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
