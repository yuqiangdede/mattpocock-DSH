/** Portable CodingAction domain independent of the underlying Agent engine. */
export interface CodingAction {
  id: string
  label: string
  kind: 'skill' | 'prompt'
  skillId?: string
  prompt: string
  enabled: boolean
  order: number
  description: string
  example: string
}
/** Initial editable actions supplied when no configuration is saved. */
export const DEFAULT_ACTIONS: readonly CodingAction[] = [
  { id: 'discussion', label: '需求讨论', kind: 'skill', skillId: 'grill-with-docs', prompt: '根据当前讨论澄清真实需求与未决问题，不要擅自增加业务功能。', enabled: true, order: 10, description: '什么时候使用：刚开始讨论需求，存在不确定问题。', example: '具体例子：明确功能目标及交互流程。' },
  { id: 'spec', label: '固化需求', kind: 'skill', skillId: 'to-spec', prompt: '请将最新确认的需求固化为可验收的规格。', enabled: true, order: 20, description: '什么时候使用：需求讨论已经形成决策。', example: '具体例子：整理开发和验收依据。' },
  { id: 'plan', label: '制定计划', kind: 'skill', skillId: 'writing-plans', prompt: '拆分可独立开发和验证的任务，不要扩大范围。', enabled: true, order: 30, description: '什么时候使用：已有需求规格，准备实施。', example: '具体例子：为接口升级制定步骤。' },
  { id: 'execute', label: '执行开发', kind: 'skill', skillId: 'executing-plans', prompt: '按已确认计划实现，分步验证并报告失败。', enabled: true, order: 40, description: '什么时候使用：需要开始实际编码。', example: '具体例子：按计划完成编码测试。' },
  { id: 'bug', label: 'Bug 排查', kind: 'skill', skillId: 'diagnosing-bugs', prompt: '先复现和定位根因，再最小修复并验证。', enabled: true, order: 50, description: '什么时候使用：功能异常或测试失败。', example: '具体例子：排查会话状态错误。' },
  { id: 'review', label: '代码审查', kind: 'skill', skillId: 'code-review', prompt: '审查正确性、数据安全和可维护性，给出有证据的问题。', enabled: true, order: 60, description: '什么时候使用：代码完成，准备合并。', example: '具体例子：检查权限和并发处理。' },
  { id: 'visual', label: '可视化讨论', kind: 'skill', skillId: 'grill-with-ui', prompt: '基于最新已确认需求开展可视化讨论，并把最终结果写回当前对话。', enabled: true, order: 100, description: '什么时候使用：需要交互式问答讨论。', example: '具体例子：逐个确认界面问题。' },
  { id: 'tickets', label: '任务拆分', kind: 'skill', skillId: 'to-tickets', prompt: '按规格拆分独立且可验收的任务。', enabled: true, order: 110, description: '什么时候使用：需求复杂，需要任务清单。', example: '具体例子：拆分前后端任务。' },
  { id: 'tdd', label: 'TDD', kind: 'skill', skillId: 'tdd', prompt: '先编写失败测试再实现最小修改。', enabled: true, order: 120, description: '什么时候使用：可以通过测试驱动的实现。', example: '具体例子：先写解析器边界测试。' },
  { id: 'api-docs', label: '接口文档', kind: 'skill', skillId: 'api-integration-docs', prompt: '依据现有源码与消息/HTTP 接口编写可对接的完整接口文档，注明所有字段与示例。', enabled: true, order: 130, description: '什么时候使用：接口文档交付任务。', example: '具体例子：调用 api-integration-docs 生成可复核的工程文档。' },
  { id: 'requirements', label: '需求规格', kind: 'skill', skillId: 'requirements-spec', prompt: '根据当前讨论与源码产出完整的需求规格，区分明确结论与待确认内容。', enabled: true, order: 140, description: '什么时候使用：需求规格交付任务。', example: '具体例子：调用 requirements-spec 生成可复核的工程文档。' },
  { id: 'overview', label: '总体设计', kind: 'skill', skillId: 'overall-design', prompt: '基于当前需求编写总体设计，说明总体结构、模块和关键设计依据。', enabled: true, order: 150, description: '什么时候使用：总体设计交付任务。', example: '具体例子：调用 overall-design 生成可复核的工程文档。' },
  { id: 'outline', label: '概要设计', kind: 'skill', skillId: 'outline-design', prompt: '根据总体设计和功能约束编写概要设计，必要时绘制规范的架构图。', enabled: true, order: 160, description: '什么时候使用：概要设计交付任务。', example: '具体例子：调用 outline-design 生成可复核的工程文档。' },
  { id: 'database', label: '数据库设计', kind: 'skill', skillId: 'database-design-doc', prompt: '依据实际表结构或需求编写数据库设计说明，包含各字段含义及约束。', enabled: true, order: 170, description: '什么时候使用：数据库设计交付任务。', example: '具体例子：调用 database-design-doc 生成可复核的工程文档。' },
  { id: 'doc-merge', label: '组件文档融合', kind: 'skill', skillId: 'component-doc-merge', prompt: '将多个组件接口资料按既有事实去重合并，保留来源与章节结构。', enabled: true, order: 180, description: '什么时候使用：组件文档融合交付任务。', example: '具体例子：调用 component-doc-merge 生成可复核的工程文档。' },
  { id: 'docx', label: 'Markdown 转 Word', kind: 'skill', skillId: 'markdown-to-docx', prompt: '按文档内容和指定模板生成 DOCX 并检查章节完整性和内容一致性。', enabled: true, order: 190, description: '什么时候使用：Markdown 转 Word交付任务。', example: '具体例子：调用 markdown-to-docx 生成可复核的工程文档。' },
  { id: 'image', label: '交互提示词', kind: 'prompt', prompt: '根据当前对话已确认的需求、设计决策、页面截图及文档，生成可直接用于 AI 图像生成的 UI 交互效果图提示词。保留原页面中未要求修改的功能和布局，明确操作流程、交互状态及视觉要求，不得凭空增加业务。', enabled: true, order: 200, description: '什么时候使用：需要把设计方案转成 UI 效果图。', example: '具体例子：给新增的搜索面板生成生图提示词。' },
  { id: 'commit', label: '提交代码', kind: 'prompt', prompt: '先执行与本次改动相关的编译和测试，通过后才提交代码；兼容 Git、GitLab 和 SVN。失败则停止并报告，成功后说明提交标识和变更摘要；除非明确要求，不推送远程。', enabled: true, order: 210, description: '什么时候使用：本次编码已经完成。', example: '具体例子：编译成功后提交到版本库。' },
]
/** Translate presentation metadata for unsaved defaults only; persisted custom labels stay unchanged. */
export const ENGLISH_DEFAULT_PRESENTATION: Readonly<Record<string, Pick<CodingAction, 'label' | 'description' | 'example'>>> = {
  'discussion': { label: 'Discuss Requirements', description: 'When to use: Requirements are still unclear.', example: 'Example: Confirm goals and interactions.' },
  'spec': { label: 'Finalize Spec', description: 'When to use: Requirements are agreed.', example: 'Example: Produce testable specifications.' },
  'plan': { label: 'Plan Work', description: 'When to use: A spec is ready for implementation.', example: 'Example: Plan a service upgrade.' },
  'execute': { label: 'Execute Plan', description: 'When to use: Implementation is ready to start.', example: 'Example: Build and verify planned tasks.' },
  'bug': { label: 'Diagnose Bug', description: 'When to use: Features or tests fail.', example: 'Example: Investigate broken session state.' },
  'review': { label: 'Code Review', description: 'When to use: Code is ready for review.', example: 'Example: Check permissions and concurrency.' },
  'visual': { label: 'Visual Discussion', description: 'When to use: Interactive design questions need decisions.', example: 'Example: Review the layout one question at a time.' },
  'tickets': { label: 'Split Tasks', description: 'When to use: A spec needs smaller deliverables.', example: 'Example: Split frontend and backend work.' },
  'tdd': { label: 'TDD', description: 'When to use: Tests can drive a change.', example: 'Example: Test a parser boundary first.' },
  'api-docs': { label: 'API Documentation', description: 'When to use: Integration docs are required.', example: 'Example: Document HTTP and message fields.' },
  'requirements': { label: 'Requirements Spec', description: 'When to use: Delivering requirements.', example: 'Example: Generate traceable requirements.' },
  'overview': { label: 'System Design', description: 'When to use: Explaining the system architecture.', example: 'Example: Document major modules.' },
  'outline': { label: 'High-Level Design', description: 'When to use: Detailing system modules.', example: 'Example: Describe interfaces and diagrams.' },
  'database': { label: 'Database Design', description: 'When to use: Defining or documenting schemas.', example: 'Example: Explain constraints and columns.' },
  'doc-merge': { label: 'Merge Component Docs', description: 'When to use: Combining multiple documents.', example: 'Example: Merge and deduplicate interfaces.' },
  'docx': { label: 'Markdown to Word', description: 'When to use: Delivering a Word document.', example: 'Example: Convert Markdown with a template.' },
  'image': { label: 'UI Image Prompt', description: 'When to use: Turning agreed design into image prompts.', example: 'Example: Visualize a new search panel.' },
  'commit': { label: 'Commit Code', description: 'When to use: Changes have passed checks.', example: 'Example: Commit after a successful build.' },
}
export function presentDefaultActions(actions: CodingAction[], english: boolean): CodingAction[] {
  return english ? actions.map(a => ({ ...a, ...ENGLISH_DEFAULT_PRESENTATION[a.id] })) : actions
}

/** Serialize a versioned action document.
 * @param actions Actions to persist.
 * @returns The JSON document.
 */
export const encodeActions = (actions: readonly CodingAction[]): string =>
  JSON.stringify({ schemaVersion: 1, actions }, null, 2)
/** Validate a persisted action document and copy defaults when absent.
 * @param text Saved JSON or an absent configuration.
 * @returns Validated actions.
 */
export type ActionConfigErrorKey = 'errorJson' | 'errorRoot' | 'errorVersion' | 'errorEntry' | 'errorId' | 'errorLabel' | 'errorKind' | 'errorSkillId' | 'errorFields' | 'errorTooltip'
export class ActionConfigError extends Error {
  constructor(readonly key: ActionConfigErrorKey) { super(key); this.name = 'ActionConfigError' }
}
/** Return a typed locale key without leaking internal validation messages to the UI. */
export function actionErrorKey(error: unknown): ActionConfigErrorKey | undefined {
  return error instanceof ActionConfigError ? error.key : undefined
}
export function parseActions(text: string | undefined): CodingAction[] {
  if (text === undefined || text.trim() === '') return DEFAULT_ACTIONS.map(a => ({ ...a }))
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ActionConfigError('errorJson') }
  if (typeof raw !== 'object' || raw === null) throw new ActionConfigError('errorRoot')
  const doc = raw as { schemaVersion?: unknown; actions?: unknown }
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.actions) || doc.actions.length > 100) throw new ActionConfigError('errorVersion')
  const ids = new Set<string>()
  return doc.actions.map((value: unknown) => {
    if (typeof value !== 'object' || value === null) throw new ActionConfigError('errorEntry')
    const a = value as Record<string, unknown>
    if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(a.id) || ids.has(a.id)) throw new ActionConfigError('errorId')
    ids.add(a.id)
    if (typeof a.label !== 'string' || a.label.trim() === '' || a.label.length > 80) throw new ActionConfigError('errorLabel')
    if (a.kind !== 'skill' && a.kind !== 'prompt') throw new ActionConfigError('errorKind')
    if (a.kind === 'skill' && (typeof a.skillId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.skillId))) throw new ActionConfigError('errorSkillId')
    if (typeof a.prompt !== 'string' || a.prompt.length > 16000 || typeof a.enabled !== 'boolean' || !Number.isSafeInteger(a.order)) throw new ActionConfigError('errorFields')
    if (typeof a.description !== 'string' || a.description.length > 500 || typeof a.example !== 'string' || a.example.length > 500) throw new ActionConfigError('errorTooltip')
    return { id: a.id, label: a.label, kind: a.kind, ...(a.kind === 'skill' ? { skillId: a.skillId } : {}), prompt: a.prompt, enabled: a.enabled, order: a.order, description: a.description, example: a.example } as CodingAction
  })
}
