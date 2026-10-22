import { useEffect, useId, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ACTION_GROUPS, parseActions, actionErrorKey, presentDefaultActions, resolveActionGroup, displayOrder, type ActionGroup, type CodingAction } from './actions.ts'
import type { LauncherInjected } from './index.ts'
import { chatEntries, recommend, withEvidence } from './contextual-actions.ts'
import css from './Launcher.module.css'
type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mattSkillLauncher'> & InjectFace<LauncherInjected>
export function Launcher({ useInput, useConversation, useSession, inputActions, useActionForm, fetchSkillNames, t }: Props) {
  const snapshot = useActionForm(x => x)
  const input = useInput(x => x)
  const chat = useConversation(x => x.views.get('chat'))
  const sessionRunning = useSession(x => x.running)
  const entries = sessionRunning ? [] : chatEntries(chat)
  const recommendation = recommend(entries)
  const [collapsed, setCollapsed] = useState(false)
  const groupsId = useId()
  const [selectedGroup, setSelectedGroup] = useState<ActionGroup>('development')
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
  const byGroup = (group: ActionGroup) => enabledActions.filter(a => resolveActionGroup(a) === group)
  const hiddenGroups = (snapshot.value?.hiddenGroups ?? []).filter((g): g is ActionGroup => ACTION_GROUPS.includes(g as ActionGroup))
  const pinned = enabledActions.filter(a => a.pinned)
  const categories = ACTION_GROUPS.filter(g => !hiddenGroups.includes(g) && byGroup(g).some(a => !a.pinned))
  const activeCategory = categories.includes(selectedGroup) ? selectedGroup : categories[0]
  const categoryActions = activeCategory ? byGroup(activeCategory).filter(a => !a.pinned) : []
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
  const render = (a: CodingAction) => <button type="button" key={a.id} disabled={!available} className={visibleRecommendation?.ids.includes(a.id) ? css.recommended : css.action}
    title={a.description + '\n' + a.example + (visibleRecommendation?.ids.includes(a.id) ? '\n' + t('recommendationTooltip').replace('{reason}', t(visibleRecommendation.reason)) : '')} onClick={() => { void insert(a) }}>{a.label}</button>
  return <div className={css.root} data-matt-skill-launcher>
    <div id={groupsId} hidden={collapsed} className={css.groups}>
      {pinned.length > 0 && <section className={css.group}><span className={css.groupLabel}>{t('shortcuts')}</span><div className={css.row}>{pinned.map(render)}</div></section>}
      {categories.length > 0 && <section className={css.group}>
        <div className={css.row} role="tablist" aria-label={t('categories')}>
          {categories.map(g=><button key={g} type="button" role="tab" aria-selected={activeCategory===g} className={activeCategory===g?css.recommended:css.action} onClick={()=>setSelectedGroup(g)}>{t(g==='development'?'developmentGroup':g==='document'?'documentGroup':g==='utility'?'utilityGroup':'moreGroup')}</button>)}
        </div>
        <div className={css.row} role="tabpanel">{categoryActions.map(render)}</div>
      </section>}
    </div>
    {enabledActions.length > 0 && <button type="button" className={css.toggle} aria-expanded={!collapsed} aria-controls={groupsId}
      onClick={() => { setCollapsed(v => !v) }}>{collapsed ? t('expandActions') : t('collapseActions')}</button>}
    {visibleRecommendation && <div className={css.hint} aria-live="polite">{t('recommendationHint').replace('{actions}', recommendedActions.map(action => action.label).join(t('recommendationSeparator'))).replace('{reason}', t(visibleRecommendation.reason))}</div>}
    {(invalid || notice) && <div className={css.notice} role="alert">{invalid ? t('invalid') + invalid : notice}</div>}
  </div>
}
