/** Only tagged coding-workflow goals may be controlled by the Fork launcher. */
export const codingWorkflowId = (objective: string): string | null => {
  const match = /^\[coding-workflow:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\](?:\s|$)/u.exec(objective)
  return match?.[1] ?? null
}

/** Selecting manual does not cancel a task: it must first pause its native Goal. */
export const shouldPauseWorkflow = (mode: 'manual' | 'auto', next: 'manual' | 'auto',
  objective: string | null, phase: string | null): boolean =>
    mode !== next && next === 'manual' && objective !== null &&
    codingWorkflowId(objective) !== null && phase === 'active'
