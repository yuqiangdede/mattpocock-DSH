import { useEffect, useRef, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseActions, actionErrorKey, presentDefaultActions, resolveActionGroup, displayOrder, type CodingAction } from './actions.ts'
import type { LauncherInjected } from './index.ts'
import { chatEntries, recommend, withEvidence } from './contextual-actions.ts'
import css from './Launcher.module.css'
type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mattSkillLauncher'> & InjectFace<LauncherInjected>
export function Launcher({ useInput, useConversation, useSession, inputActions, useActionForm, fetchSkillNames, t }: Props) {
  const snapshot = useActionForm(x => x)
  const input = useInput(x => x)
  const chat = useConversation(x => x.views.get('chat' as never) as unknown)
  const sessionRunning = useSession(x => x.running)
  const recommendation = recommend(chatEntries(chat), sessionRunning)
  const [more, setMore] = useState(false)
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
  const byGroup = (group: ReturnType<typeof resolveActionGroup>) => enabledActions.filter(a => resolveActionGroup(a) === group)
  const development = byGroup('development')
  const documents = byGroup('document')
  const utilities = byGroup('utility')
  const extra = byGroup('more')
  const available = input.phase === 'plain' && !pending && snapshot.status === 'ready'
  const insert = async (action: CodingAction) => {
    setMore(false)
    if (!available) return
    setNotice('')
    const span = inputActions.captureInsertion()
    if (span.start !== span.end) { setNotice(t('selection')); return }
    if (action.kind === 'skill' && (span.start !== 0 || input.draft.startsWith('/'))) {
      setNotice(t('start')); return
    }
    let value = withEvidence(action.prompt, recommendation, action.id)
    if (action.kind === 'skill') {
      const skillId = action.skillId ?? ''
      setPending(true)
      try {
        const names = await fetchSkillNames()
        if (!alive.current) return
        if (!names.includes(skillId)) { setNotice(t('missing') + skillId + t('install')); return }
        value = '/' + skillId + ' ' + action.prompt + (input.draft.length ? '\n\n' : '')
      } catch (error) { if (alive.current) setNotice(t('readFailed') + String(error)); return }
      finally { if (alive.current) setPending(false) }
    } else if (input.draft.length) value = '\n\n' + value
    if (!alive.current) return
    if (!inputActions.insertText(value, span)) { setNotice(t('draftChanged')); return }
    inputActions.persistDraft()
  }
  const render = (a: CodingAction) => <button type="button" key={a.id} disabled={!available} className={recommendation?.ids.includes(a.id) ? css.recommended : css.action}
    title={a.description + '\n' + a.example + (recommendation?.ids.includes(a.id) ? '\n推荐：' + recommendation.reason : '')} onClick={() => { void insert(a) }}>{a.label}</button>
  return <div className={css.root} data-matt-skill-launcher>
    {(development.length > 0 || extra.length > 0) && <section className={css.group}>
      <span className={css.groupLabel}>{t('developmentGroup')}</span>
      <div className={css.row} aria-label={t('developmentGroup')}>
        {development.map(render)}
        {extra.length > 0 && <Menu
          open={more} side="top" align="start" compact
          anchor={<button type="button" className={css.action} disabled={!available}
            onClick={() => { setMore(v => !v) }} aria-haspopup="menu" aria-expanded={more}>{t('more')}</button>}
          items={extra.map(a => ({ id: a.id, label: a.label }))}
          onClose={() => { setMore(false) }}
          onSelect={(id) => {
            const selected = extra.find(a => a.id === id)
            if (selected) void insert(selected)
          }}
        />}
      </div>
    </section>}
    {documents.length > 0 && <section className={css.group}>
      <span className={css.groupLabel}>{t('documentGroup')}</span>
      <div className={css.row} aria-label={t('documentGroup')}>{documents.map(render)}</div>
    </section>}
    {utilities.length > 0 && <section className={css.group}>
      <span className={css.groupLabel}>{t('utilityGroup')}</span>
      <div className={css.row} aria-label={t('utilityGroup')}>{utilities.map(render)}</div>
    </section>}
    {recommendation && <div className={css.hint} aria-live="polite">推荐下一步：{recommendation.ids.filter(id => enabledActions.some(a => a.id === id)).map(id => enabledActions.find(a => a.id === id)?.label).join('、')}（{recommendation.reason}）</div>}
    {(invalid || notice) && <div className={css.notice} role="alert">{invalid ? t('invalid') + invalid : notice}</div>}
  </div>
}
