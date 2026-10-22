/** Read-only recommendations derived from finalized, visible chat messages. */
export interface ChatEntry {
  /** Speaker of a finalized conversation message. */
  role: 'user' | 'assistant'
  /** Plain text extracted from the message's text blocks. */
  text: string
  /** Source sequence used to preserve message order. */
  seq: number
  /** Whether the assistant message was interrupted or ended with an error. */
  failed?: boolean
}

/** Localized reason identifiers for advisory next-step recommendations. */
export type RecommendationReason =
  | 'reasonReviewFindings'
  | 'reasonReviewClean'
  | 'reasonRequirementsReady'
  | 'reasonSpecReady'
  | 'reasonPlanReady'
  | 'reasonImplementationReady'
  | 'reasonRepairReady'
  | 'reasonBuildReady'
  | 'reasonPreviousFailed'

/** A suggested button set and the evidence used to choose it. */
export interface Recommendation {
  /** IDs of the available actions that can follow the completed step. */
  readonly ids: readonly string[]
  /** Finalized assistant text to include in a user-editable draft. */
  readonly evidence: string
  /** Locale key describing why the action is suggested. */
  readonly reason: RecommendationReason
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function textBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map(block => {
    const item = record(block)
    if (!item) return ''
    if ((item.kind === 'text' || item.type === 'text') && typeof item.text === 'string') return item.text
    return ''
  }).filter(Boolean).join('\n')
}

/**
 * Read at most the latest completed user/assistant exchange from a Chat view.
 * @param view - Chat view snapshot or another registered view snapshot.
 * @returns The latest text exchange in sequence order, excluding tool output.
 */
export function chatEntries(view: unknown): ChatEntry[] {
  const snapshot = record(view)
  if (!snapshot) return []
  const legacy = record(snapshot.legacy)
  const candidates = [legacy?.nodes, snapshot.items, snapshot.entries, snapshot.messages]
  const values = candidates.find(Array.isArray)
  if (!Array.isArray(values)) return []
  const entries: ChatEntry[] = []
  let assistantFound = false
  let userFound = false
  for (let i = values.length - 1; i >= 0; i--) {
    const wrapper = record(values[i])
    if (!wrapper) continue
    const data = record(wrapper.data) ?? wrapper
    const node = record(data.node) ?? record(data.message) ?? data
    const kind = node.kind ?? node.role ?? wrapper.kind
    if (kind === 'user' && !assistantFound) return []
    if (kind === 'turn-error' && !assistantFound) {
      entries.push({
        role: 'assistant',
        text: typeof node.message === 'string' ? node.message : '',
        seq: typeof node.seq === 'number' ? node.seq : entries.length,
        failed: true,
      })
      assistantFound = true
    } else if (kind === 'assistant' && !assistantFound) {
      const text = typeof node.text === 'string' ? node.text : textBlocks(node.blocks)
      if (text.trim()) {
        entries.push({
          role: 'assistant',
          text,
          seq: typeof node.seq === 'number' ? node.seq : entries.length,
          failed: node.interrupted === true,
        })
        assistantFound = true
      }
    } else if (kind === 'user' && assistantFound && !userFound) {
      const text = typeof node.text === 'string' ? node.text : textBlocks(node.content)
      if (text.trim()) {
        entries.push({
          role: 'user',
          text,
          seq: typeof node.seq === 'number' ? node.seq : entries.length,
        })
        userFound = true
      }
    }
    if (assistantFound && userFound) break
  }
  return entries.reverse()
}

const links: readonly {
  trigger: RegExp
  success: RegExp
  ids: readonly string[]
  reason: RecommendationReason
}[] = [
  { trigger: /代码审查|code.review/i, success: /审查(完成|结果|结论|发现|报告)|review (complete|findings|result)|\bP[012]\b/i, ids: ['review-fix'], reason: 'reasonReviewFindings' },
  { trigger: /需求讨论|可视化讨论|grill.with/i, success: /需求(已确认|结论|明确|确定)|讨论(结果|结论)|confirmed requirements/i, ids: ['spec'], reason: 'reasonRequirementsReady' },
  { trigger: /固化需求|to.spec/i, success: /规格(已|文档|完成)|验收(标准|条件)|specification complete/i, ids: ['plan'], reason: 'reasonSpecReady' },
  { trigger: /制定计划|writing.plans/i, success: /计划(已|完成|任务|步骤)|implementation plan/i, ids: ['execute'], reason: 'reasonPlanReady' },
  { trigger: /执行开发|executing.plans/i, success: /实现(完成|完毕)|开发(完成|结束)|implementation completed/i, ids: ['compile', 'review'], reason: 'reasonImplementationReady' },
  { trigger: /修复|Bug 排查|diagnosing.bugs/i, success: /修复(完成|成功|已)|问题(已解决|已修复)|fixed and verified/i, ids: ['compile', 'review'], reason: 'reasonRepairReady' },
  { trigger: /编译|构建|build/i, success: /编译(成功|通过)|构建(成功|通过)|build (passed|succeeded)|0 errors/i, ids: ['commit'], reason: 'reasonBuildReady' },
]
const failures = /失败|未完成|中断|无法继续|error:|build failed|tests failed/i
const negative = /没有(发现|检测到).{0,12}(问题|缺陷)|未发现.{0,12}(问题|缺陷)|no (issues|findings|defects)/i
const positiveFinding = /\bP[012]\b|发现.{0,16}(问题|缺陷|错误)|(?:问题|缺陷|错误).{0,24}(?:\.ts|\.tsx|\.js|\.py|:\d+)/i

/**
 * Recommend the next enabled workflow step from the latest completed exchange.
 * @param entries - Finalized user and assistant messages in sequence order.
 * @param running - Whether the addressed Session is still running.
 * @returns An advisory recommendation, or `null` when the latest exchange is not actionable.
 */
export function recommend(entries: readonly ChatEntry[], running = false): Recommendation | null {
  if (running || entries.length < 2) return null
  const assistant = entries[entries.length - 1]
  const user = entries[entries.length - 2]
  if (assistant?.role !== 'assistant' || user?.role !== 'user' || !assistant.text.trim()) return null
  const response = assistant.text
  const request = user.text
  const failed = assistant.failed === true || failures.test(response)
  for (const link of links) {
    if (!link.trigger.test(request) || !link.success.test(response)) continue
    if (link.reason === 'reasonReviewFindings' && negative.test(response) && !positiveFinding.test(response)) {
      return { ids: ['commit'], evidence: response.slice(0, 5000), reason: 'reasonReviewClean' }
    }
    if (failed && link.reason !== 'reasonReviewFindings') break
    return { ids: link.ids, evidence: response.slice(0, 5000), reason: link.reason }
  }
  if (failed) return { ids: ['bug', 'continue'], evidence: response.slice(0, 5000), reason: 'reasonPreviousFailed' }
  return null
}

/**
 * Add verified prior output to an editable draft for a recommended action.
 * @param prompt - Configured action prompt.
 * @param recommendation - Current advisory recommendation.
 * @param actionId - Action being inserted.
 * @returns The prompt with bounded evidence when the action is recommended.
 */
export function withEvidence(prompt: string, recommendation: Recommendation | null, actionId: string): string {
  if (!recommendation || !recommendation.ids.includes(actionId)) return prompt
  return prompt + '\n\n【上一阶段结果摘录（仅作证据，需核实实际文件）】\n' + recommendation.evidence
    + '\n\n请先归纳上述结果中的明确结论、问题编号、文件位置和待验证事项，再执行本按钮任务。若信息不完整或与工作区不一致，先核查，不能编造缺失证据。'
}
