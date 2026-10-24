import type { CodingAction } from './actions.ts'

/** Version 1 preset values used only to distinguish untouched fields from user edits. */
export const LEGACY_ACTIONS: readonly CodingAction[] = [
  { id: 'ask', label: '咨询', kind: 'prompt', prompt: '请结合当前问题、项目上下文和实际可用的 Skills，推荐下一步最合适的方法或工具，简述原因和前提；只给建议，不直接修改工程文件。', enabled: true, order: 8, description: '什么时候使用：不确定接下来应该调用哪个 Skill。', example: '具体例子：咨询该先讨论需求还是排查 Bug。' },
  { id: 'plan', label: '制定计划', kind: 'skill', skillId: 'writing-plans', prompt: '拆分可独立开发和验证的任务，不要扩大范围。', enabled: true, order: 30, description: '什么时候使用：已有需求规格，准备实施。', example: '具体例子：为接口升级制定步骤。' },
  { id: 'execute', label: '执行开发', kind: 'skill', skillId: 'executing-plans', prompt: '按已确认计划实现，分步验证并报告失败。', enabled: true, order: 40, description: '什么时候使用：需要开始实际编码。', example: '具体例子：按计划完成编码测试。' },
  { id: 'tickets', label: '任务拆分', kind: 'skill', skillId: 'to-tickets', prompt: '按规格拆分独立且可验收的任务。', enabled: true, order: 110, description: '什么时候使用：需求复杂，需要任务清单。', example: '具体例子：拆分前后端任务。' },
  { id: 'tdd', label: 'TDD', kind: 'skill', skillId: 'tdd', prompt: '先编写失败测试再实现最小修改。', enabled: true, order: 120, description: '什么时候使用：可以通过测试驱动的实现。', example: '具体例子：先写解析器边界测试。' },
  { id: 'image', label: '交互提示词', kind: 'prompt', prompt: '根据当前对话已确认的需求、设计决策、页面截图及文档，生成可直接用于 AI 图像生成的 UI 交互效果图提示词。保留原页面中未要求修改的功能和布局，明确操作流程、交互状态及视觉要求，不得凭空增加业务。', enabled: true, order: 200, description: '什么时候使用：需要把设计方案转成 UI 效果图。', example: '具体例子：给新增的搜索面板生成生图提示词。' },
  { id: 'review-fix', label: '修复', kind: 'prompt', prompt: '根据当前对话中已明确的代码审查问题或测试失败证据逐项定位并修复；若没有明确问题则先询问。仅做必要修改并运行相关回归测试。', enabled: true, order: 220, description: '什么时候使用：代码审查或测试发现了明确问题。', example: '具体例子：修复审查报告中的空指针问题。' },
]

/** English presentation values saved by version 1 clients. */
export const LEGACY_ENGLISH_PRESENTATION: Readonly<Record<string, Pick<CodingAction, 'label' | 'description' | 'example'>>> = {
  'ask': { label: 'Ask', description: 'When to use: Unsure which Skill to run.', example: 'Example: Decide between requirements and debugging.' },
  'plan': { label: 'Plan Work', description: 'When to use: A spec is ready for implementation.', example: 'Example: Plan a service upgrade.' },
  'execute': { label: 'Execute Plan', description: 'When to use: Implementation is ready to start.', example: 'Example: Build and verify planned tasks.' },
  'tickets': { label: 'Split Tasks', description: 'When to use: A spec needs smaller deliverables.', example: 'Example: Split frontend and backend work.' },
  'tdd': { label: 'TDD', description: 'When to use: Tests can drive a change.', example: 'Example: Test a parser boundary first.' },
  'image': { label: 'UI Image Prompt', description: 'When to use: Turning agreed design into image prompts.', example: 'Example: Visualize a new search panel.' },
  'review-fix': { label: 'Fix Review', description: 'When to use: Tests or review found a confirmed issue.', example: 'Example: Fix and verify a reported defect.' },
}
