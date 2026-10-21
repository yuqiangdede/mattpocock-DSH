import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseActions, type CodingAction } from './actions.ts'
import type { LauncherInjected } from './index.ts'
import css from './Launcher.module.css'
type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mattSkillLauncher'> & InjectFace<LauncherInjected>
export function Launcher({ useInput, inputActions, useActionForm, fetchSkillNames, t }: Props) {
  const snapshot = useActionForm(x => x)
  const input = useInput(x => x)
  const [more, setMore] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  let actions: CodingAction[] = []
  let invalid = ''
  try { actions = parseActions(snapshot.value?.actionsJson) } catch (error) { invalid = String(error) }
  const skills = actions.filter(a => a.kind === 'skill' && a.enabled).sort((a,b) => a.order-b.order)
  const prompts = actions.filter(a => a.kind === 'prompt' && a.enabled).sort((a,b) => a.order-b.order)
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
    let value = action.prompt
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
  const render = (a: CodingAction) => <button type="button" key={a.id} disabled={!available} className={css.action}
    title={a.description + '\n' + a.example} onClick={() => { void insert(a) }}>{a.label}</button>
  return <div className={css.root} data-matt-skill-launcher>
    <div className={css.row} aria-label={t('skills')}>
      {skills.filter(a => a.order < 100).map(render)}
      {skills.some(a => a.order >= 100) && <div className={css.more}>
        <button type="button" className={css.action} disabled={!available} onClick={() =>{  setMore(v=>!v) }} aria-expanded={more}>{t('more')}</button>
        {more && <div className={css.menu} role="menu">{skills.filter(a => a.order >= 100).map(a=><button type="button" role="menuitem" className={css.item} key={a.id} onClick={()=>{void insert(a)}}>{a.label}</button>)}</div>}
      </div>}
    </div>
    <div className={css.row} aria-label={t('prompts')}>{prompts.map(render)}</div>
    {(invalid || notice) && <div className={css.notice} role="alert">{invalid ? t('invalid') + invalid : notice}</div>}
  </div>
}
