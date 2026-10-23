import { useEffect, useId, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseActions, actionErrorKey, presentDefaultActions, displayOrder, type CodingAction } from './actions.ts'
import type { LauncherInjected } from './index.ts'
import { chatEntries, recommend, withEvidence } from './contextual-actions.ts'
import { codingWorkflowId, shouldPauseWorkflow } from './workflow-goal.ts'
import css from './Launcher.module.css'
type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mattSkillLauncher'> & InjectFace<LauncherInjected>
export function Launcher({ useInput, useConversation, useSession, useProjection, inputActions, useActionForm, fetchSkillNames, pauseWorkflow, t }: Props) {
  const snapshot = useActionForm(x => x)
  const input = useInput(x => x)
  const chat = useConversation(x => x.views.get('chat'))
  const sessionRunning = useSession(x => x.running)
  const goalProjection = useProjection('goal')
  // Pause only explicitly associated workflow goals, never unrelated DSH goals.
  const workflowGoal = goalProjection && codingWorkflowId(goalProjection.goal.objective) !== null ? goalProjection.goal : null
  const entries = sessionRunning ? [] : chatEntries(chat)
  const recommendation = recommend(entries)
  const morePanelId = useId()
  const [moreOpen, setMoreOpen] = useState(false)
  // Never arm automatic execution on mount or after a session/application restart.
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const explain = (error: unknown) => {
    const key = actionErrorKey(error)
    return key ? t(key) : String(error)
  }
  let actions: CodingAction[] = []
  let invalid = ''
  try { actions = parseActions(snapshot.value?.actionsJson) } catch (error) { invalid = explain(error) }
  actions = snapshot.value?.actionsJson ? actions : presentDefaultActions(actions, t('defaultLocale') === 'en')
  const enabledActions = actions.filter(a => a.enabled).sort((a, b) => displayOrder(a) - displayOrder(b))
  const recommendedActions = recommendation
    ? enabledActions.filter(action => recommendation.ids.includes(action.id))
    : []
  const visibleRecommendation = recommendedActions.length ? recommendation : null
  const shownActions = enabledActions.filter(a => a.pinned)
  const moreActions = enabledActions.filter(a => !a.pinned)
  const hasActions = enabledActions.length > 0
  const moreRecommended = recommendedActions.some(a => !a.pinned)
  const available = input.phase === 'plain' && !pending && snapshot.status === 'ready'
  const insert = async (action: CodingAction) => {
    if (!available) return
    setNotice('')
    const span = inputActions.captureInsertion()
    if (span.start !== span.end) { setNotice(t('selection')); return }
    if (action.kind === 'skill' && (span.start !== 0 || input.draft.startsWith('/'))) {
      setNotice(t('start')); return
    }
    let value = withEvidence(action.prompt, recommendation, action.id, entries, t('defaultLocale') === 'en')
    if (action.kind === 'skill') {
      const skillId = action.skillId ?? ''
      setPending(true)
      try {
        const names = await fetchSkillNames()
        if (!alive.current) return
        if (!names.includes(skillId)) { setNotice(t('missing') + skillId + t('install')); return }
        value = '/' + skillId + ' ' + value + (input.draft.length ? '\n\n' : '')
      } catch (error) { if (alive.current) setNotice(t('readFailed') + String(error)); return }
      finally { if (alive.current) setPending(false) }
    } else if (input.draft.length) value = '\n\n' + value
    if (!alive.current) return
    if (!inputActions.insertText(value, span)) { setNotice(t('draftChanged')); return }
    inputActions.persistDraft()
  }
  // An explicit Send is still required. Never bypass the editor's insertion span:
  // this preserves attachments, citations and the protection against stale drafts.
  const insertAuto = async () => {
    if (!available) return
    setNotice('')
    const span = inputActions.captureInsertion()
    if (span.start !== 0 || span.end !== 0 || input.draft.startsWith('/')) {
      setNotice(t('start'))
      return
    }
    setPending(true)
    try {
      const names = await fetchSkillNames()
      if (!alive.current) return
      if (!names.includes('coding-workflow')) {
        setNotice(t('missing') + 'coding-workflow' + t('install'))
        return
      }
      const lead = '/coding-workflow ' + t('autoInstruction')
      const value = lead + (input.draft.length ? '\n\n' : '\n\n')
      if (!inputActions.insertText(value, span)) { setNotice(t('draftChanged')); return }
      inputActions.persistDraft()
    } catch (error) {
      if (alive.current) setNotice(t('readFailed') + String(error))
    } finally {
      if (alive.current) setPending(false)
    }
  }
  const changeMode = async (next: 'manual' | 'auto') => {
    if (mode === next || pending) return
    if (next === 'manual' && sessionRunning && !workflowGoal) {
      setNotice(t('pauseUnavailable'))
      return
    }
    if (shouldPauseWorkflow(mode, next, workflowGoal?.objective ?? null, workflowGoal?.phase ?? null)) {
      setPending(true)
      try {
        const result = await pauseWorkflow({ id: workflowGoal.id, revision: workflowGoal.revision })
        if (!alive.current) return
        if (!result.ok) { setNotice(t('pauseFailed') + result.error.message); return }
      } catch (error) {
        if (alive.current) setNotice(t('pauseFailed') + String(error))
        return
      } finally { if (alive.current) setPending(false) }
    }
    if (!alive.current) return
    setMode(next)
    setMoreOpen(false)
    setNotice('')
  }
  const render = (a: CodingAction) => <button type="button" key={a.id} disabled={!available} className={visibleRecommendation?.ids.includes(a.id) ? css.recommended : css.action}
    title={a.description + '\n' + a.example + (visibleRecommendation?.ids.includes(a.id) ? '\n' + t('recommendationTooltip').replace('{reason}', t(visibleRecommendation.reason)) : '')} onClick={() => { void insert(a) }}>{a.label}</button>
  return <div className={css.root} data-matt-skill-launcher>
    <div className={css.modeRow} role="group" aria-label={t('workflowMode')}>
      <span className={css.modeLabel}>{t('workflowMode')}</span>
      <button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? css.modeActive : css.modeButton}
        disabled={pending} onClick={() => { void changeMode('manual') }}>{t('manualMode')}</button>
      <button type="button" aria-pressed={mode === 'auto'} className={mode === 'auto' ? css.modeActive : css.modeButton}
        disabled={pending} onClick={() => { void changeMode('auto') }}>{t('autoMode')}</button>
    </div>
    {workflowGoal && <div className={css.goalStatus} aria-live="polite">
      {t('goalStatus')}: {workflowGoal.phase}
      {workflowGoal.phase === 'blocked' && workflowGoal.blockedReason?.message
        ? ' — ' + workflowGoal.blockedReason.message : ''}
      <span>{t('goalNotStage')}</span>
    </div>}
    {mode === 'auto' && <div className={css.autoPanel}>
      <span>{t('autoStages')}</span>
      <button type="button" disabled={!available} className={css.action}
        title={t('autoTooltip')} onClick={() => { void insertAuto() }}>{t('autoPrepare')}</button>
      <span className={css.autoNote}>{t('autoHelp')}</span>
    </div>}
    {mode === 'manual' && hasActions && <div className={css.row}>
      {shownActions.map(render)}
      {moreActions.length > 0 && <button type="button" className={moreRecommended ? css.recommended : css.action}
        aria-expanded={moreOpen} aria-controls={morePanelId}
        onClick={() => { setMoreOpen(open => !open) }}>{t('more')}</button>}
    </div>}
    {mode === 'manual' && moreActions.length > 0 && <div id={morePanelId} hidden={!moreOpen} className={css.morePanel}>
      <div className={css.row}>{moreActions.map(render)}</div>
    </div>}
    {mode === 'manual' && visibleRecommendation && <div className={css.hint} aria-live="polite">{t('recommendationHint').replace('{actions}', recommendedActions.map(action => action.label).join(t('recommendationSeparator'))).replace('{reason}', t(visibleRecommendation.reason))}</div>}
    {(invalid || notice) && <div className={css.notice} role="alert">{invalid ? t('invalid') + invalid : notice}</div>}
  </div>
}
