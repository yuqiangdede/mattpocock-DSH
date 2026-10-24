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
  { id: 'initialize', label: '初始化', kind: 'skill', skillId: 'setup-matt-pocock-skills', prompt: '只核对当前项目的工程 Skills 配置，说明现状、缺失项和影响；不创建业务代码，不执行开发任务。需要修改配置或安装 Skill 前先征求确认。', enabled: true, order: 5, description: '首次为仓库配置工程 Skills，或核对现有配置是否完整时使用；只给出诊断和需要确认的改动清单，不写业务代码。', example: '例如：检查 Issue 跟踪、项目文档和代码审查约定是否齐全。' },
  { id: 'ask', label: '咨询', kind: 'skill', skillId: 'ask-matt', prompt: '结合当前问题、项目上下文和实际可用的 Skills 说明现状与可选下一步，给出理由和前提；只给建议，不代替用户执行任何阶段，不修改工程文件。', enabled: true, order: 8, description: '不确定该走哪个流程、该用哪个 Skill 时使用；只比较可选下一步及理由，不执行需求、开发、审查、编译或提交。', example: '例如：判断当前应先补需求文档还是先排查失败测试。' },
  { id: 'discussion', label: '需求讨论', kind: 'skill', skillId: 'grill-with-docs', prompt: '只澄清需求：目标、使用场景、范围、约束、验收标准和未决问题，通过提问消除分歧；不写或改代码，不运行构建和测试，不拆分实现步骤，不提交。需要落地实现时先确认并建议切换开发。', enabled: true, pinned: true, order: 10, description: '需求尚不明确或存在分歧时使用；只收敛目标、范围、约束和验收标准，不改代码、不做实现设计，产出供固化需求使用。', example: '例如：明确搜索功能的入口、权限、空态和验收标准。' },
  { id: 'spec', label: '固化需求', kind: 'skill', skillId: 'to-spec', prompt: '只把最新确认的需求写成可验收的规格：范围、不做事项、验收条件、资料来源和未决问题；不实现代码，不拆分工单，不执行构建或提交。', enabled: true, pinned: true, order: 20, description: '需求讨论已形成结论后使用；只产出可验收的规格文本，明确范围、不做事项和验收条件，不进入实现或工单拆分。', example: '例如：为消息搜索固化范围、权限规则和验收条件。' },
  { id: 'plan', label: '拆分工单', kind: 'skill', skillId: 'to-tickets', prompt: '只按已确认规格拆分可独立验收的工单，标注依赖、阻塞关系和验证方法；不编码、不创建分支、不执行构建测试、不提交。', enabled: true, order: 30, description: '已有可验收规格、需要落地排期时使用；只拆分带依赖和验证方法的工单，不开始编码或提交。', example: '例如：把权限升级拆成迁移、接口和回滚三类工单。' },
  { id: 'execute', label: '开发', kind: 'skill', skillId: 'implement', prompt: '只按已确认的规格或工单实现，并运行与改动直接相关的测试；不重新讨论需求，不做代码审查或代码走读，不执行完整项目编译，不提交（这些分别由对应按钮负责）。规格缺口或阻塞先停下说明。', enabled: true, pinned: true, order: 40, description: '规格或工单已确认、需要落地编码时使用；只改实现并跑相关测试，不做需求讨论、代码走读、完整编译或提交。', example: '例如：按工单完成接口改造并补充对应测试。' },
  { id: 'bug', label: 'Bug 排查', kind: 'skill', skillId: 'diagnosing-bugs', prompt: '先建立稳定复现，定位根因并给出证据；只做最小修复和针对性验证，不做需求变更、代码审查或完整编译，不提交。根因未确认前不扩大改动范围。', enabled: true, pinned: true, order: 50, description: '功能异常、报错或测试失败但原因不明时使用；以复现和根因为主，只做最小修复与针对性验证，不做审查或提交。', example: '例如：定位会话状态偶发丢失的触发条件。' },
  { id: 'review', label: '代码审查', kind: 'skill', skillId: 'code-review', prompt: '只审查正确性、数据安全、并发和可维护性，输出有证据的问题清单：编号、优先级、文件位置、影响和验证方法；不修改代码、不执行修复、不提交，修复交给「修复审核问题」。', enabled: true, pinned: true, order: 60, description: '实现完成、准备合并前使用；只输出可核验的问题清单，不改代码、不做修复，发现问题后由修复审核问题处理。', example: '例如：检查权限判断、并发写入和错误处理。' },
  { id: 'visual', label: '可视化讨论', kind: 'skill', skillId: 'grill-with-ui', prompt: '只通过交互式问答澄清已确认需求中的界面决策，并把结论写回当前对话；不修改代码、不做实现、不提交。', enabled: true, order: 15, description: '界面或交互存在多个待定选项时使用；只通过逐个问题收敛决策并回写结论，不进入实现。', example: '例如：逐个确认搜索面板的筛选条件和空态。' },
  { id: 'tdd', label: '测试驱动开发', kind: 'skill', skillId: 'tdd', prompt: '只按测试驱动实现：先写失败测试复现目标行为，再最小实现并运行相关测试；不做需求讨论、代码审查或提交，也不顺手重构无关代码。', enabled: true, order: 120, description: '行为明确、可以用测试驱动时使用；先失败测试再最小实现，只覆盖目标行为，不做审查或提交。', example: '例如：先补解析器的边界失败测试。' },
  { id: 'prototype', label: '制作原型', kind: 'skill', skillId: 'prototype', prompt: '只围绕当前未决设计问题制作可运行原型并记录结论与限制；原型不并入产品代码，不做代码审查，不提交。', enabled: true, order: 125, description: '需要运行起来验证交互或状态模型时使用；只做一次性原型和结论记录，不并入产品代码。', example: '例如：验证多步表单的返回与草稿恢复。' },
  { id: 'architecture', label: '架构优化', kind: 'skill', skillId: 'improve-codebase-architecture', prompt: '只在指定范围内寻找有证据的架构优化机会，列出候选方案、影响和取舍，先呈现供选择；不直接改代码、不提交。', enabled: true, order: 126, description: '模块难以理解、修改或测试时使用；只给出有证据的候选方案和取舍，选定后再进入开发。', example: '例如：分析最近频繁改动的模块能否收敛入口。' },
  { id: 'api-docs', label: '接口文档', kind: 'skill', skillId: 'api-integration-docs', prompt: '只依据现有源码、消息或 HTTP 接口编写可对接的接口文档，注明字段、示例和依据；不修改接口实现，不提交。', enabled: true, order: 130, description: '需要交付第三方可联调的接口文档时使用；只整理字段、示例和依据，不改接口实现。', example: '例如：整理订单回调的通知字段与重试约定。' },
  { id: 'requirements', label: '需求文档', kind: 'skill', skillId: 'requirements-spec', prompt: '只根据当前讨论与源码产出需求规格，区分已确认结论与待确认内容；不实现功能、不拆分工单、不提交。', enabled: true, order: 140, description: '需要正式需求文档时使用；只产出规格并标注待确认项，不进入实现或工单拆分。', example: '例如：把已确认能力整理成可评审的需求规格。' },
  { id: 'overview', label: '总体设计', kind: 'skill', skillId: 'overall-design', prompt: '只基于已确认需求编写总体设计，说明系统结构、模块划分和关键设计依据；不实现代码、不提交。', enabled: true, order: 150, description: '需要总体设计说明书时使用；只描述结构、模块和依据，不写实现代码。', example: '例如：说明消息链路的模块边界与部署视图。' },
  { id: 'outline', label: '概要设计', kind: 'skill', skillId: 'outline-design', prompt: '只根据总体设计和功能约束编写概要设计，必要时绘制规范架构图；不实现代码、不提交。', enabled: true, order: 160, description: '总体设计已确定、需要细化模块设计时使用；只产出模块接口与流程说明，不写实现代码。', example: '例如：细化权限校验模块的接口和异常分支。' },
  { id: 'database', label: '数据库设计', kind: 'skill', skillId: 'database-design-doc', prompt: '只依据实际表结构或需求编写数据库设计说明，逐项说明字段含义、关系和约束；不修改现有表结构，不执行迁移，不提交。', enabled: true, order: 170, description: '需要数据库设计说明或数据字典时使用；只整理字段、关系和约束，不执行迁移、不改业务代码。', example: '例如：整理会话表的字段含义与索引。' },
  { id: 'doc-merge', label: '文档融合', kind: 'skill', skillId: 'component-doc-merge', prompt: '只把多个组件的接口资料按既有事实去重合并，保留来源和章节结构；不新增未经验证的内容，不实现功能，不提交。', enabled: true, order: 180, description: '多份组件文档需要合成一份时使用；只做去重合并并保留来源，不补充未验证内容。', example: '例如：合并两个组件的鉴权接口说明。' },
  { id: 'docx', label: 'MD 转 Word', kind: 'skill', skillId: 'markdown-to-docx', prompt: '只把已确认的 Markdown 按指定模板转换为 DOCX，并检查章节完整性和内容一致性；不改写事实、不实现功能、不提交。', enabled: true, order: 190, description: '需要交付 Word 版本时使用；只做格式转换和完整性检查，不改写内容事实。', example: '例如：把概要设计转成评审用 Word 文档。' },
  { id: 'doc-supplement', label: '补充文档', kind: 'prompt', prompt: '只把本会话中已确认的需求、设计、数据库和接口结论补充到项目现有的产品资料文档：先回顾本会话的结论、变更和未决问题，再定位并读取现有文档，只增量修改受影响章节；不新建缺失文档（列出来并询问），不重写整份文档；数据库/接口结论必须对照实际 SQL、迁移或源码核实，无法核实的标“待确认”；不改代码、不运行构建测试、不提交或推送。完成后列出改动的文件与章节、未建立的文档和待确认项。', enabled: true, pinned: true, order: 195, description: '需要把本会话的已确认结论补进现有需求/设计/数据库/接口文档时使用；只增量补充，缺失文档只列出，数据库/接口须核对实际 SQL 或源码，不改代码、不提交。', example: '例如：把本次确认的权限规则和接口错误码补进现有需求与接口文档。' },
  { id: 'image', label: '交互提示词', kind: 'prompt', prompt: '只为已确认需求生成可直接用于 AI 生图的 UI 交互效果图提示词，写清页面结构、操作流程、交互状态和视觉约束；保留未要求修改的功能和布局，不新增业务、不修改代码、不提交。', enabled: true, order: 300, description: '需要把界面方案转成生成提示词时使用；只输出提示词并保留未改动区域，不新增业务。', example: '例如：为新增搜索面板生成各交互状态的提示词。' },
  { id: 'commit', label: '提交代码', kind: 'prompt', prompt: '只提交当前改动：核对 diff 和暂存范围，按仓库约定生成提交信息并提交；兼容 Git、GitLab 和 SVN。不执行编译、测试、代码审查或修复，不修改代码，不推送远程；存在未解决冲突或明确未完成的改动时停止并报告。提交后按目录或模块分类汇总本次提交的新增、删除行数和文件数，给出合计与提交标识。', enabled: true, pinned: true, order: 90, description: '改动已准备好入库时使用；只核对 diff 并提交，不跑编译或测试，提交后按目录或模块分类汇总新增、删除行数。', example: '例如：提交本次改动并汇总 src/ 与 tests/ 各新增、删除多少行。' },
  { id: 'review-fix', label: '修复审核问题', kind: 'prompt', prompt: '只修复当前对话中已明确的审查问题或测试失败证据：逐项定位、最小修改并运行相关回归测试；不新增需求、不重构无关代码、不重新做完整代码审查、不提交。没有明确问题清单时先询问再动手。', enabled: true, pinned: true, order: 70, description: '代码审查或测试已给出明确问题时使用；只逐项修复并回归验证，不扩大范围、不重新审查。', example: '例如：逐项修复审查报告中的空指针和越权访问。' },
  { id: 'compile', label: '编译', kind: 'prompt', prompt: '只核对构建脚本、依赖和运行环境，执行合适的编译或构建检查并报告通过、失败与未执行项；不改业务代码、失败时不擅自修复、不提交。', enabled: true, pinned: true, order: 80, description: '需要验证工程能否编译时使用；只执行构建并报告结果，失败时定位原因但不擅自改代码。', example: '例如：在 Windows 上执行完整构建并报告失败项。' },
  { id: 'continue', label: '继续', kind: 'prompt', prompt: '先核对本会话的未完成任务、最近改动及磁盘实际文件，识别已完成步骤和当前阻塞，再从可靠检查点继续原任务；不新增阶段、不扩大范围、不重复已成功的操作。', enabled: true, order: 240, description: '任务中断、需要恢复时使用；只从可靠检查点继续原任务，不新增阶段或扩大范围。', example: '例如：从上次失败的构建检查处继续。' },
  { id: 'domain', label: '领域建模', kind: 'skill', skillId: 'domain-modeling', prompt: '只澄清当前范围内的领域术语和关系，更新术语表或决策记录；不做实现、不提交。', enabled: true, order: 250, description: '领域概念含糊或命名冲突时使用；只收敛术语和关系并记录，不进入实现。', example: '例如：明确用户、账号和成员的区别。' },
  { id: 'research', label: '资料研究', kind: 'skill', skillId: 'research', prompt: '只围绕当前问题查证可信一手资料，记录来源、结论和未验证事项；不改代码、不实现功能、不提交。', enabled: true, order: 260, description: '需要查证技术资料或外部事实时使用；只查证并记录来源与结论，不改代码。', example: '例如：核对 SDK 的官方兼容性要求。' },
  { id: 'retro', label: '复盘', kind: 'skill', skillId: 'retro', prompt: '只复盘当前任务的问题与验证记录，区分事实和改进建议，提出可自动检查的改进；不改代码、不提交。', enabled: true, order: 270, description: '任务结束或出现值得总结的失败时使用；只复盘事实与改进建议，不改代码。', example: '例如：找出重复出现的构建失败是否可自动检查。' },
  { id: 'handoff', label: '上下文交接', kind: 'skill', skillId: 'handoff', prompt: '只为接手者编写上下文交接文档，引用已有规格、工单和代码记录，写明未完成事项、阻塞和下一步；不改代码、不提交、不复制敏感信息。', enabled: true, order: 280, description: '需要换会话、工作目录或接手者时使用；只产出可核查的交接文档，不继续执行原任务。', example: '例如：把当前阻塞和验证结果交给下一会话。' },
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
  'initialize': { label: 'Initialize', description: 'First-time engineering Skills setup or a configuration audit; reports current coverage, gaps and the changes to confirm, without writing product code.', example: 'e.g. Check issue tracking, project docs and review conventions.' },
  'ask': { label: 'Ask', description: 'Use when the next workflow step or Skill is unclear; compares options with reasons and preconditions, without running a stage or editing files.', example: 'e.g. Decide between documenting requirements and debugging a failing test.' },
  'discussion': { label: 'Discuss Requirements', description: 'Use while requirements are unclear or disputed; converge on goals, scope, constraints and acceptance criteria without code, implementation design or builds.', example: 'e.g. Fix the entry points, permissions, empty state and acceptance criteria for search.' },
  'spec': { label: 'Finalize Spec', description: 'Use once requirements are agreed; write a testable specification with scope, exclusions, sources and acceptance criteria, without implementing, splitting tickets or committing.', example: 'e.g. Freeze the scope, permission rules and acceptance criteria for message search.' },
  'plan': { label: 'Split into Tickets', description: 'Use when an accepted specification needs implementation tickets; split independently verifiable work with dependencies, blockers and checks, without coding, branching or committing.', example: 'e.g. Split a permission upgrade into migration, API and rollback tickets.' },
  'execute': { label: 'Develop', description: 'Use when a specification or ticket is confirmed; implement and run only checks related to the change, without re-discussing requirements, reviewing or walking through code, running a full build or committing.', example: 'e.g. Implement the ticket interface change and its related tests.' },
  'bug': { label: 'Diagnose Bug', description: 'Use when a feature fails or errors without a known cause; establish a reproduction, locate the root cause and apply a minimal verified fix, without review, full builds or commits.', example: 'e.g. Find what makes session state disappear intermittently.' },
  'review': { label: 'Code Review', description: 'Use before merging completed work; report evidence-backed findings with IDs, priorities, locations, impact and checks, without editing code or committing. Repair belongs to Fix Review Findings.', example: 'e.g. Check permission checks, concurrent writes and error handling.' },
  'visual': { label: 'Visual Discussion', description: 'Use when screen or interaction decisions remain open; settle them through focused questions and write the outcome back to the conversation, without implementing anything.', example: 'e.g. Confirm filter conditions and the empty state for a search panel.' },
  'tdd': { label: 'Test-driven Development', description: 'Use when behavior is clear enough to test-drive; write the failing test first, then the smallest implementation and its related checks, without review, refactors or commits.', example: 'e.g. Add a failing parser boundary test first.' },
  'prototype': { label: 'Prototype', description: 'Use when a design question needs a runnable answer; build a throwaway prototype and record conclusions and limits, without merging it into product code or committing.', example: 'e.g. Try multi-step form back navigation and draft recovery.' },
  'architecture': { label: 'Improve Architecture', description: 'Use when modules are hard to understand, change or test; present evidence-backed candidates with impact and trade-offs for selection, without editing code or committing.', example: 'e.g. Review entry points in the modules changed most often.' },
  'domain': { label: 'Domain Modeling', description: 'Use when domain terms are ambiguous or conflicting; settle definitions and relationships in the glossary, without implementing or committing.', example: 'e.g. Distinguish user, account and member.' },
  'research': { label: 'Research', description: 'Use when external facts or primary sources are needed; verify and record sources, conclusions and open questions, without editing code or implementing.', example: 'e.g. Check the official SDK compatibility requirements.' },
  'retro': { label: 'Retrospective', description: 'Use after a task or failure worth reflecting on; separate facts from improvement proposals and name checks worth automating, without editing code or committing.', example: 'e.g. Check whether a repeated build failure can be caught automatically.' },
  'handoff': { label: 'Context Handoff', description: 'Use when work moves to a new session, owner or directory; write a verifiable handoff with references, pending work, blockers and next steps, without continuing the task or committing.', example: 'e.g. Pass blockers and verification results to the next session.' },
  'api-docs': { label: 'API Documentation', description: 'Use when third parties need integration documentation; document fields, examples and evidence from current sources without changing the interface or committing.', example: 'e.g. Document order callback fields and retry rules.' },
  'requirements': { label: 'Requirements Spec', description: 'Use when a formal requirements document is required; produce a reviewable specification that separates confirmed and open items, without implementing or splitting tickets.', example: 'e.g. Turn agreed capabilities into a reviewable requirements spec.' },
  'overview': { label: 'System Design', description: 'Use when a system design document is required; describe structure, modules and design rationale without writing implementation code or committing.', example: 'e.g. Describe module boundaries and the deployment view of the message path.' },
  'outline': { label: 'High-Level Design', description: 'Use after the system design is settled; detail module interfaces, flows and exceptions without writing implementation code or committing.', example: 'e.g. Detail permission module interfaces and exception branches.' },
  'database': { label: 'Database Design', description: 'Use when database design or a data dictionary is required; document columns, relationships and constraints without migrating schemas or changing product code.', example: 'e.g. Document session table columns, meanings and indexes.' },
  'doc-merge': { label: 'Merge Component Docs', description: 'Use when several component documents must become one; merge facts, deduplicate and preserve sources and chapter structure without adding unverified content.', example: 'e.g. Merge authentication interfaces from two components.' },
  'docx': { label: 'Markdown to Word', description: 'Use when a Word deliverable is required; convert the agreed Markdown with the requested template and check section completeness without changing facts.', example: 'e.g. Convert the outline design into a review copy in Word.' },
  'doc-supplement': { label: 'Supplement Docs', description: 'Use when confirmed conclusions from this session must be added to existing requirements, design, database or interface documents; supplement existing sections only, list missing documents, verify database and interface claims against actual SQL or source, and never edit code or commit.', example: 'e.g. Add the agreed permission rules and interface error codes to the existing requirements and API documents.' },
  'image': { label: 'UI Image Prompt', description: 'Use when an agreed design should become image-generation prompts; describe layout, interaction states and visual constraints without adding business scope or editing code.', example: 'e.g. Prompt the interaction states of a new search panel.' },
  'commit': { label: 'Commit Code', description: 'Use when changes are ready to commit; verify the diff and staged scope and commit without running builds, tests or code review. Stop and report on unresolved conflicts or unfinished work; do not edit code or push. Summarize added and deleted lines by directory or module.', example: 'e.g. Commit and report added and deleted lines for src and tests separately.' },
  'review-fix': { label: 'Fix Review Findings', description: 'Use when a review or failing test produced explicit findings; locate and fix each with the smallest change and run related regression checks, without new requirements, unrelated refactors, a full re-review or a commit.', example: 'e.g. Fix the null dereference and missing authorization from the review.' },
  'compile': { label: 'Build', description: 'Use when the project build must be verified; run the appropriate build and report passed, failed and not-run items, without changing business code or committing.', example: 'e.g. Run the full Windows build and report failing projects.' },
  'continue': { label: 'Continue', description: 'Use when a task was interrupted; verify pending work, recent changes and actual files, then resume from a reliable checkpoint without adding scope or repeating successful operations.', example: 'e.g. Resume from the last failing build check.' },
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
