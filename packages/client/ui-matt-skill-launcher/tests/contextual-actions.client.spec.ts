import { describe, expect, it } from 'vitest'
import { chatEntries, recommend, withEvidence, type ChatEntry } from '../src/client/contextual-actions.ts'

const user = (text: string, seq = 1): ChatEntry => ({ role: 'user', text, seq })
const assistant = (text: string, seq = 2, failed = false): ChatEntry => ({ role: 'assistant', text, seq, failed })

describe('Skill Launcher contextual recommendations', () => {
  it('reads only the latest completed DSH legacy exchange in sequence order', () => {
    expect(chatEntries(null)).toEqual([])
    expect(chatEntries({ legacy: { nodes: null }, items: null })).toEqual([])
    expect(chatEntries({ legacy: { nodes: [
      { kind: 'user', seq: 1, content: [{ type: 'text', text: '更早请求' }] },
      { kind: 'user', seq: 10, content: [{ type: 'text', text: '请代码审查' }] },
      { kind: 'assistant', seq: 20, blocks: [{ kind: 'text', text: '审查完成：P1 空指针问题' }] },
      { kind: 'tool-result', seq: 30, content: [{ type: 'text', text: 'ignore tool text' }] },
    ] } })).toEqual([
      user('请代码审查', 10),
      assistant('审查完成：P1 空指针问题', 20),
    ])
    expect(chatEntries({ legacy: { nodes: [
      { kind: 'assistant', seq: 32, blocks: [{ kind: 'text', text: 'older result' }] },
      { kind: 'user', seq: 33, content: [{ type: 'text', text: 'unanswered latest request' }] },
    ] } })).toEqual([])
  })

  it('supports wrapped and alternate view node collections without including tools', () => {
    expect(chatEntries({ items: [
      { data: { node: { kind: 'user', seq: 4, content: [{ type: 'text', text: 'build' }] } } },
      { data: { message: { role: 'assistant', seq: 5, text: 'build passed' } } },
    ] })).toEqual([user('build', 4), assistant('build passed', 5)])
    expect(chatEntries({ entries: [
      { role: 'user', text: 'hello' },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'world' }, null, { kind: 'image' }] },
    ] }).map(({ role, text }) => [role, text])).toEqual([['user', 'hello'], ['assistant', 'world']])
    expect(chatEntries({ messages: [
      { kind: 'user', text: 'review' },
      { kind: 'turn-error', seq: 7, message: 'request failed' },
    ] })).toEqual([user('review', 0), assistant('request failed', 7, true)])
    expect(chatEntries({ legacy: { nodes: [
      { kind: 'user', seq: 8, content: [{ type: 'text', text: 'review' }] },
      { kind: 'assistant', seq: 9, interrupted: true, blocks: [{ kind: 'text', text: 'interrupted output' }] },
    ] } })[1]?.failed).toBe(true)
  })

  it('recommends the next workflow step for every supported transition', () => {
    expect(recommend([user('请代码审查'), assistant('审查结果：P1 src/a.ts:20 空指针问题')])?.ids).toEqual(['review-fix'])
    expect(recommend([user('需求讨论'), assistant('需求已确认')])?.ids).toEqual(['spec'])
    expect(recommend([user('固化需求'), assistant('规格文档已生成，验收标准完整')])?.ids).toEqual(['plan'])
    expect(recommend([user('制定计划'), assistant('计划已完成')])?.ids).toEqual(['execute'])
    expect(recommend([user('执行开发'), assistant('实现完成')])?.ids).toEqual(['compile', 'review'])
    expect(recommend([user('修复问题'), assistant('修复已成功')])?.ids).toEqual(['compile', 'review'])
    expect(recommend([user('编译'), assistant('编译成功')])?.ids).toEqual(['commit'])
  })

  it('handles running, unrelated, empty, negative, conflicting, and failed results safely', () => {
    expect(recommend([user('请代码审查')])).toBeNull()
    expect(recommend([user('请代码审查'), assistant('审查结果：P1 缺陷')], true)).toBeNull()
    expect(recommend([user('闲聊'), assistant('审查结果：P1 缺陷')])).toBeNull()
    expect(recommend([user('请代码审查'), assistant('   ')])).toBeNull()
    expect(recommend([assistant('审查结果：P1 缺陷'), user('请代码审查')])).toBeNull()
    expect(recommend([user('请代码审查'), assistant('审查完成：未发现任何问题')])?.reason).toBe('reasonReviewClean')
    expect(recommend([user('请代码审查'), assistant('自动检查未发现问题，但人工审查发现 P1 src/a.ts:10 缺陷')])?.ids).toEqual(['review-fix'])
    expect(recommend([user('请代码审查'), assistant('审查中，没有发现结果')])).toBeNull()
    expect(recommend([user('执行开发'), assistant('构建失败')])?.ids).toEqual(['bug', 'continue'])
    expect(recommend([user('其他操作'), assistant('请求中断', 2, true)])?.ids).toEqual(['bug', 'continue'])
    expect(recommend([user('请代码审查'), assistant('审查结果：P1 缺陷', 2, true)])?.ids).toEqual(['review-fix'])
    expect(recommend([user('执行开发'), assistant('实现完成但测试失败')])?.ids).toEqual(['bug', 'continue'])
    expect(recommend([user('请代码审查'), assistant('闲聊')])).toBeNull()
  })

  it('adds only matching recommendation evidence to the editable prompt', () => {
    const result = recommend([user('请代码审查'), assistant('审查结果：P1 src/a.ts:20 空指针问题')])
    expect(withEvidence('修复问题', result, 'review-fix')).toContain('src/a.ts:20')
    expect(withEvidence('编译', result, 'compile')).toBe('编译')
    expect(withEvidence('修复问题', null, 'review-fix')).toBe('修复问题')
  })
})
