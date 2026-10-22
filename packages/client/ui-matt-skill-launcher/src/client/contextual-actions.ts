import { receivingInstructions, documentReceiving, draftContextCopy } from './locales.ts'

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
  | 'reasonResearchReady'
  | 'reasonPrototypeReady'
  | 'reasonArchitectureReady'
  | 'reasonDomainReady'
  | 'reasonHandoffReady'

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
  return value.map((block) => {
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
        seq: typeof node.seq === 'number' ? node.seq : i,
        failed: true,
      })
      assistantFound = true
    } else if (kind === 'assistant' && !assistantFound) {
      const text = typeof node.text === 'string' ? node.text : textBlocks(node.blocks)
      if (text.trim()) {
        entries.push({
          role: 'assistant',
          text,
          seq: typeof node.seq === 'number' ? node.seq : i,
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
          seq: typeof node.seq === 'number' ? node.seq : i,
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
  { trigger: /拆分工单|to-tickets|制定计划|writing.plans/i, success: /工单|计划(已|完成|任务|步骤)|implementation plan|tickets? (created|ready)/i, ids: ['execute'], reason: 'reasonPlanReady' },
  { trigger: /执行开发|\/implement\b|^开发|executing.plans/i, success: /实现(完成|完毕)|开发(完成|结束)|implementation completed/i, ids: ['compile', 'review'], reason: 'reasonImplementationReady' },
  { trigger: /修复|Bug 排查|diagnosing.bugs/i, success: /修复(完成|成功|已)|问题(已解决|已修复)|fixed and verified/i, ids: ['compile', 'review'], reason: 'reasonRepairReady' },
  { trigger: /编译|构建|build/i, success: /编译(成功|通过)|构建(成功|通过)|build (passed|succeeded)|0 errors/i, ids: ['commit'], reason: 'reasonBuildReady' },
  { trigger: /\/research\b|资料研究/i, success: /研究(完成|结论)|research (complete|findings)|资料来源/i, ids: ['discussion'], reason: 'reasonResearchReady' },
  { trigger: /\/prototype\b|制作原型/i, success: /原型(完成|结论)|prototype (complete|ready)|验证结论/i, ids: ['discussion'], reason: 'reasonPrototypeReady' },
  { trigger: /improve-codebase-architecture|架构优化/i, success: /候选方案|优化建议|architectur.*(candidates|recommendations)/i, ids: ['discussion'], reason: 'reasonArchitectureReady' },
  { trigger: /domain-modeling|领域建模/i, success: /术语(已|表)|建模完成|glossary.*(updated|complete)/i, ids: ['discussion'], reason: 'reasonDomainReady' },
  { trigger: /\/handoff\b|上下文交接/i, success: /交接文档|handoff.*\.md/i, ids: ['continue'], reason: 'reasonHandoffReady' },
]
const failures = /失败|未完成|中断|无法继续|error:|build failed|tests failed/i
const negative = /没有(发现|检测到).{0,12}(问题|缺陷)|未发现.{0,12}(问题|缺陷)|no (issues|findings|defects)/i
const positiveFinding = /\bP[0-3]\b|(?:问题|缺陷|错误).{0,24}(?:\.ts|\.tsx|\.js|\.py|:\d+)/i

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
  // 已插入的交接摘录不是当前按钮意图，不能再次参与阶段匹配。
  const requestText = user.text.split('\n\n【')[0] ?? user.text
  const request = /^\/[a-z][a-z-]*(?=\s|$)/.exec(requestText)?.[0] ?? requestText
  const failed = assistant.failed === true || failures.test(response)
  for (const link of links) {
    if (!link.trigger.test(request) || !link.success.test(response)) continue
    if (link.reason === 'reasonReviewFindings' && negative.test(response) && !positiveFinding.test(response)) {
      if (failed) break
      return { ids: ['commit'], evidence: response.slice(0, 5000), reason: 'reasonReviewClean' }
    }
    if (failed && link.reason !== 'reasonReviewFindings') break
    return { ids: link.ids, evidence: response.slice(0, 5000), reason: link.reason }
  }
  if (failed) return { ids: ['bug', 'continue'], evidence: response.slice(0, 5000), reason: 'reasonPreviousFailed' }
  return null
}

/**
 * Add action-specific receiving instructions and bounded prior output to an editable draft.
 * @param prompt - Configured action prompt.
 * @param recommendation - Current advisory recommendation.
 * @param actionId - Action being inserted.
 * @param entries - Latest completed exchange, independent of recommendation matching.
 * @param english - Whether the receiving instructions use English.
 * @returns A draft carrying source text, verification requirements and the action's receiving task.
 */
export function withEvidence(
  prompt: string,
  recommendation: Recommendation | null,
  actionId: string,
  entries: readonly ChatEntry[] = [],
  english = false,
): string {
  const instruction = receivingInstructions[actionId] ?? (documentActions.has(actionId) ? documentReceiving : undefined)
  if (!instruction) return prompt
  const assistant = entries[entries.length - 1]
  const user = entries[entries.length - 2]
  const response = assistant?.role === 'assistant' && user?.role === 'user' ? assistant.text : recommendation?.ids.includes(actionId) ? recommendation.evidence : ''
  const copy = draftContextCopy[english ? 'en' : 'zh']
  const bounded = (text: string, limit: number) => text.length <= limit ? text : text.slice(0, limit) + copy.truncated
  const request = response && user?.role === 'user' ? bounded(user.text.split('\n\n【')[0] ?? user.text, 1000) : ''
  const context = response ? copy.heading
    + (request ? copy.request + request + '\n' : '')
    + copy.result + bounded(response, 5000) : ''
  return prompt + context + '\n\n' + instruction[english ? 1 : 0]
    + copy.verify
}

const documentActions = new Set(['api-docs', 'requirements', 'overview', 'outline', 'database', 'doc-merge', 'docx'])
