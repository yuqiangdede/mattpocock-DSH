import { describe, expect, it } from 'vitest'
import { chatEntries, recommend, withEvidence } from '../src/client/contextual-actions.ts'

const user = (text: string, seq: number) => ({ role: 'user' as const, text, seq })
const assistant = (text: string, seq: number) => ({ role: 'assistant' as const, text, seq })

describe('Skill Launcher contextual recommendations', () => {
  it('reads settled DSH legacy ChatSnapshot text nodes in sequence order', () => {
    const entries = chatEntries({ legacy: { nodes: [
      { kind: 'assistant', seq: 20, blocks: [{ kind: 'text', text: '审查完成：P1 空指针问题' }] },
      { kind: 'user', seq: 10, content: [{ type: 'text', text: '请代码审查' }] },
      { kind: 'tool-result', seq: 30, content: [{ type: 'text', text: 'ignore tool text' }] },
    ] } })
    expect(entries).toEqual([user('请代码审查', 10), assistant('审查完成：P1 空指针问题', 20)])
  })
  it('recommends repair and includes the concrete preceding review evidence', () => {
    const result = recommend([user('请代码审查', 1), assistant('审查结果：P1 src/a.ts:20 空指针问题', 2)])
    expect(result?.ids).toEqual(['review-fix'])
    expect(withEvidence('修复问题', result, 'review-fix')).toContain('src/a.ts:20')
    expect(withEvidence('编译', result, 'compile')).toBe('编译')
  })
  it('does not treat a pending review, unrelated answer, or no-findings result as repair evidence', () => {
    expect(recommend([user('代码审查', 1)], false)).toBeNull()
    expect(recommend([user('代码审查', 1), assistant('审查结果：P1 缺陷', 2)], true)).toBeNull()
    expect(recommend([user('闲聊', 1), assistant('审查结果：P1 缺陷', 2)])).toBeNull()
    expect(recommend([user('代码审查', 1), assistant('审查完成：未发现任何问题', 2)])?.ids).toEqual(['commit'])
  })
  it('recommends the next non-blocking actions for a confirmed stage', () => {
    expect(recommend([user('固化需求', 1), assistant('规格文档已生成，验收标准完整', 2)])?.ids).toEqual(['plan'])
    expect(recommend([user('执行开发', 1), assistant('实现完成', 2)])?.ids).toEqual(['compile','review'])
    expect(recommend([user('编译', 1), assistant('编译成功', 2)])?.ids).toEqual(['commit'])
    expect(recommend([user('执行开发', 1), assistant('构建失败', 2)])?.ids).toEqual(['bug','continue'])
  })
})
