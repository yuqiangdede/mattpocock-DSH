import { describe, expect, it } from 'vitest'
import { ACTION_SCHEMA_VERSION, DEFAULT_ACTIONS, encodeActions, parseActions, missingDefaultActions, displayOrder, presentDefaultActions } from '../src/client/actions.ts'
import { LEGACY_ACTIONS, LEGACY_ENGLISH_PRESENTATION } from '../src/client/legacy-actions.ts'

describe('mattpocock-DSH CodingAction document', () => {
  it('ships skill and prompt rows without automatic execution metadata', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => a.kind === 'skill').length).toBeGreaterThan(4)
    expect(actions.filter(a => a.kind === 'prompt').map(a => a.id)).toEqual(['doc-supplement','image','commit','review-fix','compile','continue'])
    expect(actions.every(a => a.enabled)).toBe(true)
    expect(new Set(actions.map(a => a.id)).size).toBe(actions.length)
  })
  it('shows the workflow shortcuts and leaves every other button under More', () => {
    const actions = parseActions(undefined)
    expect(actions.filter(a => a.pinned).map(a => a.id))
      .toEqual(['discussion', 'spec', 'execute', 'bug', 'review', 'doc-supplement', 'commit', 'review-fix', 'compile'])
    expect(actions.filter(a => a.pinned).sort((a, b) => displayOrder(a) - displayOrder(b)).map(a => a.id))
      .toEqual(['discussion', 'spec', 'execute', 'bug', 'review', 'review-fix', 'compile', 'commit', 'doc-supplement'])
    expect(actions.filter(a => !a.pinned).map(a => a.id))
      .toContain('ask')
    expect(actions.find(a => a.id === 'ask')?.skillId).toBe('ask-matt')
    expect(actions.find(a => a.id === 'plan')?.skillId).toBe('to-tickets')
    expect(actions.find(a => a.id === 'execute')?.skillId).toBe('implement')
  })
  it('writes tooltips without instructional labels and keeps stage boundaries in prompts', () => {
    const actions = presentDefaultActions(parseActions(undefined), true)
    for (const action of [...DEFAULT_ACTIONS, ...actions]) {
      expect(action.description).not.toMatch(/什么时候使用|具体例子|When to use|Example:/)
      expect(action.example).not.toMatch(/什么时候使用|具体例子|When to use|Example:/)
    }
    expect(actions.filter(action => /[\u4e00-\u9fff]/.test(action.description + action.example)).map(action => action.id)).toEqual([])
    const prompt = (id: string) => actions.find(action => action.id === id)?.prompt ?? ''
    expect(prompt('discussion')).toContain('不写或改代码')
    expect(prompt('execute')).toContain('不做代码审查或代码走读')
    expect(prompt('execute')).toContain('不执行完整项目编译')
    expect(prompt('review')).toContain('不修改代码')
    expect(prompt('review-fix')).toContain('不提交')
    expect(prompt('compile')).toContain('不改业务代码')
    expect(prompt('commit')).toContain('不修改代码')
    expect(prompt('commit')).toContain('不执行编译')
    expect(prompt('commit')).toContain('分类汇总')
    expect(prompt('plan')).toContain('不编码')
    expect(prompt('spec')).toContain('不实现代码')
  })
  it('adds the document supplement prompt with its evidence boundary', () => {
    const action = parseActions(undefined).find(a => a.id === 'doc-supplement')
    expect(action).toMatchObject({ kind: 'prompt', pinned: true, order: 195, enabled: true })
    expect(action?.prompt).toContain('增量修改')
    expect(action?.prompt).toContain('不新建缺失文档')
    expect(action?.prompt).toContain('待确认')
    expect(action?.prompt).toContain('不提交')
    const english = presentDefaultActions(parseActions(undefined), true).find(a => a.id === 'doc-supplement')
    expect(english?.label).toBe('Supplement Docs')
    expect(english?.description).not.toMatch(/[\u4e00-\u9fff]/)
  })
  it('keeps the old built-in visual action adjacent to text discussion without rewriting saved order', () => {
    const visual = DEFAULT_ACTIONS.find(action => action.id === 'visual')
    if (visual === undefined) throw new Error('Missing default visual action')
    expect(visual.order).toBe(15)
    expect(displayOrder(visual)).toBe(15)
    expect(displayOrder({ ...visual, order: 100 })).toBe(15)
    expect(displayOrder({ ...visual, order: 100, pinned: true })).toBe(15)
  })
  it('supports legacy saved config without forcing reset', () => {
    const previous = DEFAULT_ACTIONS.filter(a => !['initialize','ask','review-fix','compile','continue'].includes(a.id))
    const loaded = parseActions(encodeActions(previous))
    expect(loaded.map(a => a.id)).toEqual(previous.map(a => a.id))
    const visual = loaded.find(a => a.id === 'visual')
    expect(visual).toBeDefined()
    expect(displayOrder(visual!)).toBe(15)
    expect(missingDefaultActions(loaded).map(a => a.id)).toEqual(['initialize','ask','review-fix','compile','continue'])
    expect(missingDefaultActions([...loaded,...missingDefaultActions(loaded)])).toEqual([])
  })
  it('ignores the retired group field and stops writing it', () => {
    const base = DEFAULT_ACTIONS[0]
    if (base === undefined) throw new Error('Missing default action')
    const doc = (group: unknown) => JSON.stringify({ schemaVersion: 3, actions: [{ ...base, group }] })
    expect(parseActions(doc('utility'))[0]).not.toHaveProperty('group')
    expect(() => parseActions(doc('unexpected'))).not.toThrow()
    expect(encodeActions(parseActions(doc('utility')))).not.toContain('"group"')
  })
  it('roundtrips saved config without changing user-defined labels', () => {
    const actions = DEFAULT_ACTIONS.map((a, index) => ({ ...a, label: index === 0 ? '自定义' : a.label }))
    expect(parseActions(encodeActions(actions))).toEqual(actions)
  })
  it('writes shown buttons under the schema version that carries them', () => {
    expect(ACTION_SCHEMA_VERSION).toBe(3)
    expect(encodeActions([])).toContain(`"schemaVersion": ${String(ACTION_SCHEMA_VERSION)}`)
    const shown = DEFAULT_ACTIONS.map(a => ({ ...a, pinned: true }))
    expect(parseActions(encodeActions(shown)).every(a => a.pinned === true)).toBe(true)
  })
  it('keeps reading the earlier saved versions', () => {
    // A version-2 writer never persisted `pinned`, so an upgrade keeps its saved state unchanged.
    const version2 = JSON.stringify({ schemaVersion: 2, actions: DEFAULT_ACTIONS.map(a => ({ ...a, pinned: undefined })) })
    expect(parseActions(version2)).toHaveLength(DEFAULT_ACTIONS.length)
    expect(parseActions(version2).some(a => a.pinned)).toBe(false)
  })
  it('preserves an intentionally empty action list', () => {
    expect(parseActions(encodeActions([]))).toEqual([])
  })
  it.each([
    '{not-json',
    '{"schemaVersion":4,"actions":[]}',
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
    const old = LEGACY_ACTIONS.map(a => ({ ...a, ...(a.id === 'execute' ? { label: '自定义开发', enabled: false } : {}) }))
    const migrated = parseActions(JSON.stringify({ schemaVersion: 1, actions: old }))
    expect(migrated.find(a => a.id === 'execute')).toMatchObject({ label: '自定义开发', enabled: false, skillId: 'implement' })
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
