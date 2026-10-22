import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_ACTIONS, parseActions, encodeActions, actionErrorKey, presentDefaultActions, missingDefaultActions, type CodingAction } from './actions.ts'
import type { LauncherSettingsInjected } from './index.ts'
import css from './Settings.module.css'
type Props = PropsRuntime<'settings.section'> & PropsLocale<'mattSkillLauncher'> & InjectFace<LauncherSettingsInjected>
export function LauncherSettings({ useActionForm, saveActions, t }: Props) {
  const form = useActionForm(x => x)
  const explain = (error: unknown) => {
    const key = actionErrorKey(error)
    return key ? t(key) : String(error)
  }
  const [draft, setDraft] = useState<CodingAction[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importJson, setImportJson] = useState('')
  const revision = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (dirty) return
    revision.current = form.revision
    try { setDraft(form.value?.actionsJson ? parseActions(form.value.actionsJson) : presentDefaultActions(parseActions(undefined), t('defaultLocale') === 'en')); setError('') }
    catch (err) { setError(t('corrupt') + explain(err)) }
  }, [form.value?.actionsJson, form.revision, dirty])
  const change = (id: string, patch: Partial<CodingAction>) => { setDraft(xs=>xs.map(x=>x.id===id?{ ...x,...patch }:x)); setDirty(true) }
  const add = (kind: 'skill'|'prompt') => {
    setDraft(xs=>[...xs,{ id:'custom-'+Date.now().toString(36),label:t('newButton'),kind,...(kind==='skill' ? { skillId:'example-skill' } : {}),prompt:'',enabled:true,order:xs.reduce((n,x)=>Math.max(n,x.order),0)+10,description:'',example:'' }]); setDirty(true)
  }
  const fillMissing = () => {
    const missing = missingDefaultActions(draft)
    if (missing.length === 0) return
    setDraft(xs => [...xs, ...missingDefaultActions(xs)])
    setDirty(true)
  }
  const cancel = () => { try { setDraft(form.value?.actionsJson ? parseActions(form.value.actionsJson) : presentDefaultActions(parseActions(undefined), t('defaultLocale') === 'en')); setDirty(false); setError('') } catch(err) { setError(explain(err)) } }
  const save = async () => {
    if (busy || !dirty) return
    if (form.status !== 'ready' || !form.writable || form.revision === undefined) { setError(t('readonly')); return }
    if (revision.current !== form.revision) { setError(t('conflict')); return }
    try {
      const normalized = parseActions(encodeActions(draft))
      setBusy(true)
      if (!await saveActions(encodeActions(normalized), revision.current)) { setError(t('rejected')); return }
      setDraft(normalized); setDirty(false); setError('')
    } catch(err) { setError(t('unsaved')+explain(err)) }
    finally { setBusy(false) }
  }
  const exportJson = () => {
    try {
      const file = new Blob([encodeActions(parseActions(encodeActions(draft)))],{ type:'application/json;charset=utf-8' })
      const href = URL.createObjectURL(file), a = document.createElement('a')
      a.href = href; a.download = 'mattpocock-dsh-actions.json'; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch(err) { setError(explain(err)) }
  }
  return <section className={css.root}>
    <h2>{t('title')}</h2><p>{t('intro')}</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {(['skill','prompt'] as const).map(kind=><section key={kind}>
        <div className={css.head}><h3>{kind==='skill'?t('skillRow'):t('promptRow')}</h3><button type="button" onClick={()=>{ add(kind) }}>{t('add')}</button></div>
        {draft.filter(a=>a.kind===kind).sort((a,b)=>a.order-b.order).map(a=><div className={css.card} key={a.id}>
          <div className={css.row}>
            <label><input type="checkbox" checked={a.pinned ?? false} onChange={(e)=>{ change(a.id,{ pinned: e.target.checked }) }}/>{t('showButton')}</label>
            <label><input type="checkbox" checked={a.enabled} onChange={(e)=>{ change(a.id,{ enabled:e.target.checked }) }}/>{t('enabled')}</label>
            <label>{t('buttonName')}<input value={a.label} onChange={(e)=>{ change(a.id,{ label:e.target.value }) }}/></label>
            {kind==='skill'&&<label>{t('skillId')}<input value={a.skillId??''} onChange={(e)=>{ change(a.id,{ skillId:e.target.value }) }}/></label>}
            <label>{t('order')}<input type="number" value={a.order} onChange={(e)=>{ change(a.id,{ order:Number(e.target.value) }) }}/></label>
            <button type="button" onClick={()=>{setDraft(xs=>xs.filter(x=>x.id!==a.id));setDirty(true)}}>{t('delete')}</button>
          </div>
          <label>{t('prompt')}<textarea rows={2} value={a.prompt} onChange={(e)=>{ change(a.id,{ prompt:e.target.value }) }}/></label>
          <label>{t('when')}<input value={a.description} onChange={(e)=>{ change(a.id,{ description:e.target.value }) }}/></label>
          <label>{t('example')}<input value={a.example} onChange={(e)=>{ change(a.id,{ example:e.target.value }) }}/></label>
        </div>)}
      </section>)}
      <details><summary>{t('importTitle')}</summary>
        <textarea rows={6} value={importJson} onChange={(e)=>{ setImportJson(e.target.value) }}/>
        <button type="button" onClick={()=>{try{setDraft(parseActions(importJson));setDirty(true);setError('')}catch(err){setError(t('importFailed')+explain(err))}}}>{t('import')}</button>
      </details>
    </fieldset>
    <div className={css.footer}>
      {error&&<p role="alert" className={css.error}>{error}</p>}
      <div className={css.footerRow}>
        <small>{t('state')}{form.status}{'；'}{dirty?t('dirty'):t('synced')}{t('version')}{form.revision??t('notLoaded')}</small>
        <div className={css.footerActions}>
          <button type="button" disabled={busy||missingDefaultActions(draft).length===0} onClick={fillMissing}>{t('fillMissing')}</button>
          <button type="button" disabled={busy} onClick={exportJson}>{t('export')}</button>
          <button type="button" disabled={busy} onClick={()=>{setDraft(presentDefaultActions(DEFAULT_ACTIONS.map(x=>({ ...x })), t('defaultLocale') === 'en'));setDirty(true)}}>{t('reset')}</button>
          <button type="button" onClick={cancel} disabled={!dirty||busy}>{t('cancel')}</button>
          <button type="button" onClick={()=>{void save()}} disabled={!dirty||busy||!form.writable}>{busy?t('saving'):t('save')}</button>
        </div>
      </div>
    </div>
  </section>
}
