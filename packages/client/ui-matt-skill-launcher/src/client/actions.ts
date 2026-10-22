import { LEGACY_ACTIONS, LEGACY_ENGLISH_PRESENTATION } from './legacy-actions.ts'

/** Portable CodingAction domain independent of the underlying Agent engine. */
export interface CodingAction {
  id: string
  label: string
  kind: 'skill' | 'prompt'
  skillId?: string
  prompt: string
  enabled: boolean
  /** Show this button directly in the launcher; every other enabled button sits under More. */
  pinned?: boolean
  order: number
  description: string
  example: string
}
/** Initial editable actions supplied when no configuration is saved. */
export const DEFAULT_ACTIONS: readonly CodingAction[] = [
  { id: 'initialize', label: '初始化', kind: 'skill', skillId: 'setup-matt-pocock-skills', prompt: '核对当前项目的工程 Skills 配置，先说明现状和缺失内容，修改之前征求确认。', enabled: true, order: 5, description: '什么时候使用：首次为仓库配置工程 Skills。', example: '具体例子：初始化 Issue 跟踪与项目文档约定。' },
  { id: 'ask', label: '咨询', kind: 'skill', skillId: 'ask-matt', prompt: '结合当前问题、项目上下文和实际可用的 Skills 推荐下一步，说明原因和前提；只给建议，不修改工程文件。', enabled: true, order: 8, description: '什么时候使用：不确定接下来应该调用哪个 Skill。', example: '具体例子：咨询该先讨论需求还是排查 Bug。' },
  { id: 'discussion', label: '需求讨论', kind: 'skill', skillId: 'grill-with-docs', prompt: '根据当前讨论澄清真实需求与未决问题，不要擅自增加业务功能。', enabled: true, pinned: true, order: 10, description: '什么时候使用：刚开始讨论需求，存在不确定问题。', example: '具体例子：明确功能目标及交互流程。' },
  { id: 'spec', label: '固化需求', kind: 'skill', skillId: 'to-spec', prompt: '请将最新确认的需求固化为可验收的规格。', enabled: true, pinned: true, order: 20, description: '什么时候使用：需求讨论已经形成决策。', example: '具体例子：整理开发和验收依据。' },
  { id: 'plan', label: '拆分工单', kind: 'skill', skillId: 'to-tickets', prompt: '按已确认规格拆分可独立验收的工单，明确依赖与阻塞关系，不扩大范围。', enabled: true, order: 30, description: '什么时候使用：已有需求规格，需要拆分实施工单。', example: '具体例子：为接口升级拆分工单及验收标准。' },
  { id: 'execute', label: '开发', kind: 'skill', skillId: 'implement', prompt: '按已确认规格或工单实现，分步验证并报告失败。', enabled: true, pinned: true, order: 40, description: '什么时候使用：需要开始实际编码。', example: '具体例子：按工单完成编码和测试。' },
  { id: 'bug', label: 'Bug 排查', kind: 'skill', skillId: 'diagnosing-bugs', prompt: '先复现和定位根因，再最小修复并验证。', enabled: true, pinned: true, order: 50, description: '什么时候使用：功能异常或测试失败。', example: '具体例子：排查会话状态错误。' },
  { id: 'review', label: '代码审查', kind: 'skill', skillId: 'code-review', prompt: '审查正确性、数据安全和可维护性，给出有证据的问题。', enabled: true, pinned: true, order: 60, description: '什么时候使用：代码完成，准备合并。', example: '具体例子：检查权限和并发处理。' },
  { id: 'visual', label: '可视化讨论', kind: 'skill', skillId: 'grill-with-ui', prompt: '基于最新已确认需求开展可视化讨论，并把最终结果写回当前对话。', enabled: true, order: 15, description: '什么时候使用：需要交互式问答讨论。', example: '具体例子：逐个确认界面问题。' },
  { id: 'tdd', label: '测试驱动开发', kind: 'skill', skillId: 'tdd', prompt: '先编写失败测试再实现最小修改。', enabled: true, order: 120, description: '什么时候使用：可以通过测试驱动的实现。', example: '具体例子：先写解析器边界测试。' },
  { id: 'prototype', label: '制作原型', kind: 'skill', skillId: 'prototype', prompt: '围绕当前未决设计问题制作可运行原型，记录结论及适用限制。', enabled: true, order: 125, description: '什么时候使用：需要运行原型来验证设计。', example: '具体例子：验证交互流程或状态模型。' },
  { id: 'architecture', label: '架构优化', kind: 'skill', skillId: 'improve-codebase-architecture', prompt: '在指定范围内寻找有证据的架构优化机会，先呈现候选方案供选择。', enabled: true, order: 126, description: '什么时候使用：模块难以理解、修改或测试。', example: '具体例子：分析最近常改模块的简化机会。' },
  { id: 'api-docs', label: '接口文档', kind: 'skill', skillId: 'api-integration-docs', prompt: '依据现有源码与消息/HTTP 接口编写可对接的完整接口文档，注明所有字段与示例。', enabled: true, order: 130, description: '什么时候使用：接口文档交付任务。', example: '具体例子：调用 api-integration-docs 生成可复核的工程文档。' },
  { id: 'requirements', label: '需求文档', kind: 'skill', skillId: 'requirements-spec', prompt: '根据当前讨论与源码产出完整的需求规格，区分明确结论与待确认内容。', enabled: true, order: 140, description: '什么时候使用：需求规格交付任务。', example: '具体例子：调用 requirements-spec 生成可复核的工程文档。' },
  { id: 'overview', label: '总体设计', kind: 'skill', skillId: 'overall-design', prompt: '基于当前需求编写总体设计，说明总体结构、模块和关键设计依据。', enabled: true, order: 150, description: '什么时候使用：总体设计交付任务。', example: '具体例子：调用 overall-design 生成可复核的工程文档。' },
  { id: 'outline', label: '概要设计', kind: 'skill', skillId: 'outline-design', prompt: '根据总体设计和功能约束编写概要设计，必要时绘制规范的架构图。', enabled: true, order: 160, description: '什么时候使用：概要设计交付任务。', example: '具体例子：调用 outline-design 生成可复核的工程文档。' },
  { id: 'database', label: '数据库设计', kind: 'skill', skillId: 'database-design-doc', prompt: '依据实际表结构或需求编写数据库设计说明，包含各字段含义及约束。', enabled: true, order: 170, description: '什么时候使用：数据库设计交付任务。', example: '具体例子：调用 database-design-doc 生成可复核的工程文档。' },
  { id: 'doc-merge', label: '文档融合', kind: 'skill', skillId: 'component-doc-merge', prompt: '将多个组件接口资料按既有事实去重合并，保留来源与章节结构。', enabled: true, order: 180, description: '什么时候使用：组件文档融合交付任务。', example: '具体例子：调用 component-doc-merge 生成可复核的工程文档。' },
  { id: 'docx', label: 'MD 转 Word', kind: 'skill', skillId: 'markdown-to-docx', prompt: '按文档内容和指定模板生成 DOCX 并检查章节完整性和内容一致性。', enabled: true, order: 190, description: '什么时候使用：Markdown 转 Word交付任务。', example: '具体例子：调用 markdown-to-docx 生成可复核的工程文档。' },
  { id: 'image', label: '交互提示词', kind: 'prompt', prompt: '根据当前对话已确认的需求、设计决策、页面截图及文档，生成可直接用于 AI 图像生成的 UI 交互效果图提示词。保留原页面中未要求修改的功能和布局，明确操作流程、交互状态及视觉要求，不得凭空增加业务。', enabled: true, order: 300, description: '什么时候使用：需要把设计方案转成 UI 效果图。', example: '具体例子：给新增的搜索面板生成生图提示词。' },
  { id: 'commit', label: '提交代码', kind: 'prompt', prompt: '先执行与本次改动相关的编译和测试，通过后才提交代码；兼容 Git、GitLab 和 SVN。失败则停止并报告，成功后说明提交标识和变更摘要；除非明确要求，不推送远程。', enabled: true, pinned: true, order: 210, description: '什么时候使用：本次编码已经完成。', example: '具体例子：编译成功后提交到版本库。' },
  { id: 'review-fix', label: '修复审核问题', kind: 'prompt', prompt: '根据当前对话中已明确的代码审查问题或测试失败证据逐项定位并修复；若没有明确问题则先询问。仅做必要修改并运行相关回归测试。', enabled: true, order: 220, description: '什么时候使用：代码审查或测试发现了明确问题。', example: '具体例子：修复审查报告中的空指针问题。' },
  { id: 'compile', label: '编译', kind: 'prompt', prompt: '核对当前项目的构建脚本、运行环境和依赖，执行合适的编译或构建检查；不要提交代码。失败时定位原因，未经确认不扩大修改范围。', enabled: true, order: 230, description: '什么时候使用：需要验证当前工程是否能够编译。', example: '具体例子：运行项目在 Windows 上的构建命令。' },
  { id: 'continue', label: '继续', kind: 'prompt', prompt: '先核对本会话的未完成任务、最近改动及磁盘实际文件，识别已完成步骤和当前阻塞，再从可靠检查点继续，不覆盖现有工作。', enabled: true, order: 240, description: '什么时候使用：恢复中断的开发任务。', example: '具体例子：从上次失败的构建检查处继续。' },
  { id: 'domain', label: '领域建模', kind: 'skill', skillId: 'domain-modeling', prompt: '澄清当前范围内的领域术语和关系，遵循项目现有术语表和决策记录。', enabled: true, order: 250, description: '什么时候使用：领域概念含糊或命名存在冲突。', example: '具体例子：明确用户与客户的区别。' },
  { id: 'research', label: '资料研究', kind: 'skill', skillId: 'research', prompt: '围绕当前问题研究可信一手资料，记录来源、结论和未验证事项。', enabled: true, order: 260, description: '什么时候使用：需要查证技术资料或外部事实。', example: '具体例子：研究 SDK 的官方兼容性要求。' },
  { id: 'retro', label: '复盘', kind: 'skill', skillId: 'retro', prompt: '复盘当前任务中的问题和验证记录，提出工程环境或工作流程改进建议。', enabled: true, order: 270, description: '什么时候使用：任务结束或出现值得总结的失败。', example: '具体例子：找出可自动检查的重复错误。' },
  { id: 'handoff', label: '上下文交接', kind: 'skill', skillId: 'handoff', prompt: '为接手者编写上下文交接文档，引用已有规格、工单和代码记录，明确未完成事项及下一步。', enabled: true, order: 280, description: '什么时候使用：需要换会话、工作目录或接手者。', example: '具体例子：把当前阻塞及验证情况交给下一会话。' },
]

/** Keep the old built-in visual action adjacent to text discussion without rewriting saved order. */
export function displayOrder(action: CodingAction): number {
  return action.id === 'visual' && action.order === 100 ? 15 : action.order
}

/** Explicit opt-in: leave existing customized buttons untouched. */
export function missingDefaultActions(actions: readonly CodingAction[]): CodingAction[] {
  const ids = new Set(actions.map(action => action.id))
  return DEFAULT_ACTIONS.filter(action => !ids.has(action.id)).map(action => ({ ...action }))
}

/** Translate presentation metadata for unsaved defaults only; persisted custom labels stay unchanged. */
export const ENGLISH_DEFAULT_PRESENTATION: Readonly<Record<string, Pick<CodingAction, 'label' | 'description' | 'example'>>> = {
  'initialize': { label: 'Initialize', description: 'When to use: Set up repository engineering Skills.', example: 'Example: Configure issue tracking and project docs.' },
  'ask': { label: 'Ask', description: 'When to use: Unsure which Skill to run.', example: 'Example: Decide between requirements and debugging.' },
  'discussion': { label: 'Discuss Requirements', description: 'When to use: Requirements are still unclear.', example: 'Example: Confirm goals and interactions.' },
  'spec': { label: 'Finalize Spec', description: 'When to use: Requirements are agreed.', example: 'Example: Produce testable specifications.' },
  'plan': { label: 'Split into Tickets', description: 'When to use: A specification needs implementation tickets.', example: 'Example: Split a service upgrade into tickets and acceptance checks.' },
  'execute': { label: 'Develop', description: 'When to use: Implementation is ready to start.', example: 'Example: Implement and test a ticket.' },
  'bug': { label: 'Diagnose Bug', description: 'When to use: Features or tests fail.', example: 'Example: Investigate broken session state.' },
  'review': { label: 'Code Review', description: 'When to use: Code is ready for review.', example: 'Example: Check permissions and concurrency.' },
  'visual': { label: 'Visual Discussion', description: 'When to use: Interactive design questions need decisions.', example: 'Example: Review the layout one question at a time.' },
  'tdd': { label: 'Test-driven Development', description: 'When to use: Tests can drive a change.', example: 'Example: Test a parser boundary first.' },
  'prototype': { label: 'Prototype', description: 'When to use: A design question needs a runnable answer.', example: 'Example: Explore a workflow or state model.' },
  'architecture': { label: 'Improve Architecture', description: 'When to use: Modules are hard to understand, change or test.', example: 'Example: Inspect frequently changed modules.' },
  'domain': { label: 'Domain Modeling', description: 'When to use: Domain terms are unclear or conflicting.', example: 'Example: Distinguish a user from a customer.' },
  'research': { label: 'Research', description: 'When to use: Facts need primary sources.', example: 'Example: Check official SDK compatibility requirements.' },
  'retro': { label: 'Retrospective', description: 'When to use: A task or failure needs reflection.', example: 'Example: Find repeated errors suitable for automated checks.' },
  'handoff': { label: 'Context Handoff', description: 'When to use: Work moves to a new session or owner.', example: 'Example: Pass blockers and verification results to a fresh session.' },
  'api-docs': { label: 'API Documentation', description: 'When to use: Integration docs are required.', example: 'Example: Document HTTP and message fields.' },
  'requirements': { label: 'Requirements Spec', description: 'When to use: Delivering requirements.', example: 'Example: Generate traceable requirements.' },
  'overview': { label: 'System Design', description: 'When to use: Explaining the system architecture.', example: 'Example: Document major modules.' },
  'outline': { label: 'High-Level Design', description: 'When to use: Detailing system modules.', example: 'Example: Describe interfaces and diagrams.' },
  'database': { label: 'Database Design', description: 'When to use: Defining or documenting schemas.', example: 'Example: Explain constraints and columns.' },
  'doc-merge': { label: 'Merge Component Docs', description: 'When to use: Combining multiple documents.', example: 'Example: Merge and deduplicate interfaces.' },
  'docx': { label: 'Markdown to Word', description: 'When to use: Delivering a Word document.', example: 'Example: Convert Markdown with a template.' },
  'image': { label: 'UI Image Prompt', description: 'When to use: Turning agreed design into image prompts.', example: 'Example: Visualize a new search panel.' },
  'commit': { label: 'Commit Code', description: 'When to use: Changes have passed checks.', example: 'Example: Commit after a successful build.' },
  'review-fix': { label: 'Fix Review Findings', description: 'When to use: Tests or review found a confirmed issue.', example: 'Example: Fix and verify a reported defect.' },
  'compile': { label: 'Build', description: 'When to use: Verify project compilation.', example: 'Example: Run the Windows build.' },
  'continue': { label: 'Continue', description: 'When to use: Resume interrupted work.', example: 'Example: Pick up a blocked build.' },
}
export function presentDefaultActions(actions: CodingAction[], english: boolean): CodingAction[] {
  return english ? actions.map(a => ({ ...a, ...ENGLISH_DEFAULT_PRESENTATION[a.id] })) : actions
}

/** Version written by this client: version 3 adds the optional `pinned` flag, which version-2 clients discard when they save. */
export const ACTION_SCHEMA_VERSION = 3
/** Serialize a versioned action document.
 * @param actions Actions to persist.
 * @returns The JSON document.
 */
export const encodeActions = (actions: readonly CodingAction[]): string =>
  JSON.stringify({ schemaVersion: ACTION_SCHEMA_VERSION, actions }, null, 2)
/** Locale key naming why an action document failed validation. */
export type ActionConfigErrorKey = 'errorJson' | 'errorRoot' | 'errorVersion' | 'errorEntry' | 'errorId' | 'errorLabel' | 'errorKind' | 'errorSkillId' | 'errorFields' | 'errorTooltip'
export class ActionConfigError extends Error {
  constructor(readonly key: ActionConfigErrorKey) { super(key); this.name = 'ActionConfigError' }
}
/** Return a typed locale key without leaking internal validation messages to the UI. */
export function actionErrorKey(error: unknown): ActionConfigErrorKey | undefined {
  return error instanceof ActionConfigError ? error.key : undefined
}
/** Validate a persisted action document and copy defaults when absent.
 * Versions 1, 2, and 3 load as saved; version 1 also upgrades unchanged preset fields.
 * The retired `group` field is ignored and omitted from the parsed actions.
 * @param text Saved JSON or an absent configuration.
 * @returns Validated actions.
 */
export function parseActions(text: string | undefined): CodingAction[] {
  if (text === undefined || text.trim() === '') return DEFAULT_ACTIONS.map(a => ({ ...a }))
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ActionConfigError('errorJson') }
  if (typeof raw !== 'object' || raw === null) throw new ActionConfigError('errorRoot')
  const doc = raw as { schemaVersion?: unknown; actions?: unknown }
  if ((doc.schemaVersion !== 1 && doc.schemaVersion !== 2 && doc.schemaVersion !== 3) || !Array.isArray(doc.actions) || doc.actions.length > 100) throw new ActionConfigError('errorVersion')
  const ids = new Set<string>()
  const actions = doc.actions.map((value: unknown) => {
    if (typeof value !== 'object' || value === null) throw new ActionConfigError('errorEntry')
    const a = value as Record<string, unknown>
    if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(a.id) || ids.has(a.id)) throw new ActionConfigError('errorId')
    ids.add(a.id)
    if (typeof a.label !== 'string' || a.label.trim() === '' || a.label.length > 80) throw new ActionConfigError('errorLabel')
    if (a.kind !== 'skill' && a.kind !== 'prompt') throw new ActionConfigError('errorKind')
    if (a.kind === 'skill' && (typeof a.skillId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.skillId))) throw new ActionConfigError('errorSkillId')
    if (typeof a.prompt !== 'string' || a.prompt.length > 16000 || typeof a.enabled !== 'boolean' || !Number.isSafeInteger(a.order)) throw new ActionConfigError('errorFields')
    if (typeof a.description !== 'string' || a.description.length > 500 || typeof a.example !== 'string' || a.example.length > 500) throw new ActionConfigError('errorTooltip')
    if (a.pinned !== undefined && typeof a.pinned !== 'boolean') throw new ActionConfigError('errorFields')
    return { id: a.id, label: a.label, kind: a.kind, ...(a.kind === 'skill' ? { skillId: a.skillId } : {}), prompt: a.prompt, enabled: a.enabled, ...(a.pinned === undefined ? {} : { pinned: a.pinned }), order: a.order, description: a.description, example: a.example } as CodingAction
  })
  return doc.schemaVersion === 1 ? migrateActions(actions) : actions
}

/** Upgrade old preset fields while preserving custom fields and intentionally empty lists. */
function migrateActions(actions: CodingAction[]): CodingAction[] {
  if (actions.length === 0) return actions
  const usesEnglish = (action: CodingAction) => {
    const english = LEGACY_ENGLISH_PRESENTATION[action.id]
    const legacy = LEGACY_ACTIONS.find(a => a.id === action.id)
    return english !== undefined && legacy !== undefined
      && (['label', 'description', 'example'] as const).some(key => english[key] !== legacy[key] && action[key] === english[key])
  }
  const fields = ['label', 'kind', 'skillId', 'prompt', 'order', 'description', 'example'] as const
  const matches = (action: CodingAction, legacy: CodingAction, key: typeof fields[number]) => {
    const english = LEGACY_ENGLISH_PRESENTATION[action.id]
    return action[key] === legacy[key] || (english !== undefined && (key === 'label' || key === 'description' || key === 'example') && action[key] === english[key])
  }
  const migrated = actions.flatMap((action) => {
    const legacy = LEGACY_ACTIONS.find(a => a.id === action.id)
    if (!legacy) return [action]
    const wasEnglish = usesEnglish(action)
    if (action.id === 'tickets') {
      const isPreset = fields.every(key => matches(action, legacy, key))
      return isPreset ? [] : [action]
    }
    const current = DEFAULT_ACTIONS.find(a => a.id === action.id)
    if (!current) return [action]
    const target = wasEnglish ? { ...current, ...ENGLISH_DEFAULT_PRESENTATION[action.id] } : current
    const updated = { ...action }
    for (const key of fields) {
      if (matches(action, legacy, key)) Object.assign(updated, { [key]: target[key] })
    }
    return [updated]
  })
  const addedIds = new Set(['prototype', 'architecture', 'domain', 'research', 'retro', 'handoff'])
  const english = actions.some(usesEnglish)
  const additions = presentDefaultActions(missingDefaultActions(actions).filter(a => addedIds.has(a.id)), english)
  return [...migrated, ...additions.slice(0, 100 - migrated.length)]
}
