import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTIONS, encodeActions, parseActions, resolveActionGroup, missingDefaultActions, displayOrder } from '../src/client/actions.ts'
import { LEGACY_ACTIONS, LEGACY_ENGLISH_PRESENTATION } from '../src/client/legacy-actions.ts'

describe('mattpocock-DSH CodingAction document', () => {
  it('ships skill and prompt rows without automatic execution metadata', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => a.kind === 'skill').length).toBeGreaterThan(4)
    expect(actions.filter(a => a.kind === 'prompt').map(a => a.id)).toEqual(['image','commit','review-fix','compile','continue'])
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
      .toEqual(['tdd','prototype','architecture'])
    const utilities = actions.filter(a => resolveActionGroup(a) === 'utility').sort((a,b) => a.order - b.order)
    expect(utilities.map(a => a.id)).toEqual(['commit','review-fix','compile','continue','domain','research','retro','handoff','image'])
    expect(actions.find(a => a.id === 'ask')?.skillId).toBe('ask-matt')
    expect(actions.find(a => a.id === 'plan')?.skillId).toBe('to-tickets')
    expect(actions.find(a => a.id === 'execute')?.skillId).toBe('implement')
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
    const { group: ignoredGroup, ...ungrouped } = custom
    expect(ignoredGroup).toBe('utility')
    expect(resolveActionGroup(ungrouped)).toBe('more')
    expect(() => parseActions(encodeActions([{ ...custom, group: 'unexpected' as typeof custom.group }]))).toThrow()
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
    '{"schemaVersion":3,"actions":[]}',
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
  it('migrates only old preset fields and preserves user edits and disabled actions', () => {
    const old = LEGACY_ACTIONS.map(a => ({ ...a, ...(a.id === 'execute' ? { label: '自定义开发', enabled: false, group: 'utility' as const } : {}) }))
    const migrated = parseActions(JSON.stringify({ schemaVersion: 1, actions: old }))
    expect(migrated.find(a => a.id === 'execute')).toMatchObject({ label: '自定义开发', enabled: false, group: 'utility', skillId: 'implement' })
    expect(migrated.find(a => a.id === 'plan')).toMatchObject({ label: '拆分工单', skillId: 'to-tickets' })
    expect(migrated.some(a => a.id === 'tickets')).toBe(false)
    expect(migrated.find(a => a.id === 'image')?.order).toBe(300)
    expect(migrated.find(a => a.id === 'tdd')?.label).toBe('测试驱动开发')
    expect(migrated.find(a => a.id === 'handoff')?.label).toBe('上下文交接')
    expect(migrated.filter(a => ['prototype','architecture','domain','research','retro','handoff'].includes(a.id))).toHaveLength(6)
    expect(parseActions(encodeActions(migrated))).toEqual(migrated)
    expect(parseActions(encodeActions(migrated.filter(a => a.id !== 'handoff'))).some(a => a.id === 'handoff')).toBe(false)
  })
  it('migrates English presets and keeps customized retired buttons', () => {
    const old = LEGACY_ACTIONS.map(a => ({ ...a, ...LEGACY_ENGLISH_PRESENTATION[a.id], ...(a.id === 'tickets' ? { prompt: '我的任务提示词' } : {}) }))
    const migrated = parseActions(JSON.stringify({ schemaVersion: 1, actions: old }))
    expect(migrated.find(a => a.id === 'execute')?.label).toBe('Develop')
    expect(migrated.find(a => a.id === 'tickets')?.prompt).toBe('我的任务提示词')
    expect(migrated.find(a => a.id === 'handoff')?.label).toBe('Context Handoff')
    expect(parseActions('{"schemaVersion":1,"actions":[]}')).toEqual([])
  })
})
