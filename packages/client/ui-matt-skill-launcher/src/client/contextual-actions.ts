/** Read-only recommendations derived from finalized, visible chat messages.
 * Never treats a command invocation alone as proof of successful completion.
 */
export interface ChatEntry { role: 'user' | 'assistant'; text: string; seq: number }
export interface Recommendation { ids: readonly string[]; evidence: string; reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}
function textBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map(block => {
    const item = record(block)
    if (!item) return ''
    if (item.kind === 'text' && typeof item.text === 'string') return item.text
    if (item.type === 'text' && typeof item.text === 'string') return item.text
    return ''
  }).filter(Boolean).join('\n')
}
/** Handle known Chat view node structures without reading private Session stores. */
export function chatEntries(view: unknown): ChatEntry[] {
  const snapshot = record(view)
  if (!snapshot) return []
  const legacy = record(snapshot.legacy)
  const candidates = [legacy?.nodes, snapshot.items, snapshot.entries, snapshot.messages]
  const values = candidates.find(Array.isArray)
  if (!Array.isArray(values)) return []
  const entries: ChatEntry[] = []
  for (const raw of values) {
    const wrapper = record(raw)
    if (!wrapper) continue
    const data = record(wrapper.data) ?? wrapper
    const node = record(data.node) ?? record(data.message) ?? data
    const kind = node.kind ?? node.role ?? wrapper.kind
    const role = kind === 'assistant' ? 'assistant' : kind === 'user' ? 'user' : null
    if (!role) continue
    const text = typeof node.text === 'string' ? node.text
      : textBlocks(role === 'assistant' ? node.blocks : node.content)
    if (!text.trim()) continue
    const seq = typeof node.seq === 'number' ? node.seq : typeof wrapper.anchorSeq === 'number' ? wrapper.anchorSeq : entries.length
    entries.push({ role, text, seq })
  }
  return entries.sort((a, b) => a.seq - b.seq)
}
const links: readonly { trigger: RegExp; success: RegExp; ids: readonly string[]; reason: string }[] = [
  { trigger: /代码审查|code.review/i, success: /审查(完成|结果|结论|发现|报告)|review (complete|findings|result)|\bP[012]\b/i, ids: ['review-fix'], reason: '代码审查报告可供修复' },
  { trigger: /需求讨论|可视化讨论|grill.with/i, success: /需求(已确认|结论|明确|确定)|讨论(结果|结论)|confirmed requirements/i, ids: ['spec'], reason: '需求结论可固化' },
  { trigger: /固化需求|to.spec/i, success: /规格(已|文档|完成)|验收(标准|条件)|specification complete/i, ids: ['plan'], reason: '规格可用于制定计划' },
  { trigger: /制定计划|writing.plans/i, success: /计划(已|完成|任务|步骤)|implementation plan/i, ids: ['execute'], reason: '已有实施计划' },
  { trigger: /执行开发|executing.plans/i, success: /实现(完成|完毕)|开发(完成|结束)|implementation completed/i, ids: ['compile', 'review'], reason: '建议验证实现结果' },
  { trigger: /修复|Bug 排查|diagnosing.bugs/i, success: /修复(完成|成功|已)|问题(已解决|已修复)|fixed and verified/i, ids: ['compile', 'review'], reason: '建议对修复执行回归验证' },
  { trigger: /编译|构建|build/i, success: /编译(成功|通过)|构建(成功|通过)|build (passed|succeeded)|0 errors/i, ids: ['commit'], reason: '构建通过，可检查后提交' },
]
const failures = /失败|未完成|中断|无法继续|error:|build failed|tests failed/i
const negative = /没有(发现|检测到).{0,12}(问题|缺陷)|未发现.{0,12}(问题|缺陷)|no (issues|findings|defects)/i
/**
 * Only a user request followed by its completed assistant response can drive a hint.
 * Recommendations are advisory, never cause automatic execution or submission.
 */
export function recommend(entries: readonly ChatEntry[], running = false): Recommendation | null {
  if (running) return null
  let assistantIndex = -1
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]?.role === 'assistant') { assistantIndex = i; break }
  if (assistantIndex < 0 || assistantIndex !== entries.length - 1) return null
  const response = entries[assistantIndex]!.text
  let userIndex = -1
  for (let i = assistantIndex - 1; i >= 0; i--) if (entries[i]?.role === 'user') { userIndex = i; break }
  if (userIndex < 0) return null
  const request = entries[userIndex]!.text
  for (const link of links) {
    if (!link.trigger.test(request) || !link.success.test(response)) continue
    if (failures.test(response) && !link.ids.includes('review-fix')) break
    if (link.ids.includes('review-fix') && negative.test(response)) return { ids: ['commit'], evidence: response.slice(0, 5000), reason: '审查未发现问题' }
    return { ids: link.ids, evidence: response.slice(0, 5000), reason: link.reason }
  }
  if (failures.test(response)) return { ids: ['bug', 'continue'], evidence: response.slice(0, 5000), reason: '上一操作存在失败或中断' }
  return null
}
/** Context text always remains a draft which the user can inspect before sending. */
export function withEvidence(prompt: string, recommendation: Recommendation | null, actionId: string): string {
  if (!recommendation?.ids.includes(actionId)) return prompt
  return prompt + '\n\n【上一阶段结果摘录（仅作证据，需核实实际文件）】\n' + recommendation.evidence
    + '\n\n请先归纳上述结果中的明确结论、问题编号、文件位置和待验证事项，再执行本按钮任务。若信息不完整或与工作区不一致，先核查，不能编造缺失证据。'
}
