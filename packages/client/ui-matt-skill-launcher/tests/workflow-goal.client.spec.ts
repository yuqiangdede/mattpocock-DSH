import { describe, expect, it } from 'vitest'
import { codingWorkflowId, shouldPauseWorkflow } from '../src/client/workflow-goal.ts'

const id = '5c1cd95e-17ef-4a89-8d85-6e79659714d7'
describe('coding workflow native Goal scope', () => {
  it('accepts only the explicit task-ID goal prefix', () => {
    expect(codingWorkflowId('[coding-workflow:' + id + '] implement feature')).toBe(id)
    expect(codingWorkflowId('[coding-workflow:' + id + ']')).toBe(id)
    expect(codingWorkflowId('[coding-workflow:' + id + ']suffix')).toBeNull()
    expect(codingWorkflowId('Unrelated Goal')).toBeNull()
    expect(codingWorkflowId('[coding-workflow:../../etc/passwd]')).toBeNull()
  })
  it('pauses only active tagged goals on auto-to-manual transition', () => {
    const objective = '[coding-workflow:' + id + '] implement feature'
    expect(shouldPauseWorkflow('auto', 'manual', objective, 'active')).toBe(true)
    expect(shouldPauseWorkflow('manual', 'manual', objective, 'active')).toBe(false)
    expect(shouldPauseWorkflow('manual', 'auto', objective, 'active')).toBe(false)
    expect(shouldPauseWorkflow('auto', 'manual', objective, 'paused')).toBe(false)
    expect(shouldPauseWorkflow('auto', 'manual', 'Unrelated Goal', 'active')).toBe(false)
  })
})
