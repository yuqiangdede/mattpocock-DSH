import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseActions, type CodingAction } from './actions.ts'
import type { LauncherInjected } from './index.ts'
import css from './Launcher.module.css'
type Props = PropsRuntime<'conversation.input.dock'> & InjectFace<LauncherInjected>
export function Launcher({ useInput, inputActions, useActionForm, fetchSkillNames }: Props) {
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
  const available = input !== undefined && inputActions !== undefined && input.phase === 'plain' && !pending && snapshot.status === 'ready'
  const insert = async (action: CodingAction) => {
    setMore(false)
    if (!available || inputActions === undefined || input === undefined) return
    setNotice('')
    const span = inputActions.captureInsertion()
    if (span.start !== span.end) { setNotice('已选中草稿内容：请先取消选区，避免覆盖原文。'); return }
    if (action.kind === 'skill' && (span.start !== 0 || input.draft.startsWith('/'))) {
      setNotice('DSH Skill 必须位于消息最开头。请将光标移至开头后点击。'); return
    }
    let value = action.prompt
    if (action.kind === 'skill') {
      setPending(true)
      try {
        const names = await fetchSkillNames()
        if (!alive.current) return
        if (!names.includes(action.skillId ?? '')) { setNotice('当前会话缺少 Skill：' + action.skillId + '。请先安装或启用。'); return }
        value = '/' + action.skillId + ' ' + action.prompt + (input.draft.length ? '\n\n' : '')
      } catch (error) { if (alive.current) setNotice('读取 Skill 失败：' + String(error)); return }
      finally { if (alive.current) setPending(false) }
    } else if (input.draft.length) value = '\n\n' + value
    if (!alive.current) return
    if (!inputActions.insertText(value, span)) { setNotice('草稿已变化，插入被拒绝；原内容未被覆盖。'); return }
    inputActions.persistDraft()
  }
  const render = (a: CodingAction) => <button type="button" key={a.id} disabled={!available} className={css.action}
    title={a.description + '\n' + a.example} onClick={() => { void insert(a) }}>{a.label}</button>
  return <div className={css.root} data-matt-skill-launcher>
    <div className={css.row} aria-label="编码 Skills">
      {skills.filter(a => a.order < 100).map(render)}
      {skills.some(a => a.order >= 100) && <div className={css.more}>
        <button type="button" className={css.action} disabled={!available} onClick={() => setMore(v=>!v)} aria-expanded={more}>更多 ▾</button>
        {more && <div className={css.menu} role="menu">{skills.filter(a => a.order >= 100).map(a=><button type="button" role="menuitem" className={css.item} key={a.id} onClick={()=>{void insert(a)}}>{a.label}</button>)}</div>}
      </div>}
    </div>
    <div className={css.row} aria-label="其他提示词">{prompts.map(render)}</div>
    {(invalid || notice) && <div className={css.notice} role="alert">{invalid ? '按钮设置无效，请在设置中修复：' + invalid : notice}</div>}
  </div>
}
