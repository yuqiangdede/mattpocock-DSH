import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_ACTIONS, parseActions, encodeActions, type CodingAction } from './actions.ts'
import type { LauncherSettingsInjected } from './index.ts'
import css from './Settings.module.css'
type Props = PropsRuntime<'settings.section'> & InjectFace<LauncherSettingsInjected>
export function LauncherSettings({ useActionForm, saveActions }: Props) {
  const form = useActionForm(x => x)
  const [draft, setDraft] = useState<CodingAction[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importJson, setImportJson] = useState('')
  const revision = useRef<number | undefined>()
  useEffect(() => {
    if (dirty) return
    try { setDraft(parseActions(form.value?.actionsJson)); revision.current = form.revision; setError('') }
    catch (err) { setError('存储配置损坏，尚未覆盖：' + String(err)) }
  }, [form.value?.actionsJson, form.revision, dirty])
  const change = (id: string, patch: Partial<CodingAction>) => { setDraft(xs=>xs.map(x=>x.id===id?{...x,...patch}:x)); setDirty(true) }
  const add = (kind: 'skill'|'prompt') => {
    setDraft(xs=>[...xs,{ id:'custom-'+Date.now().toString(36),label:'新按钮',kind,...kind==='skill'?{skillId:'example-skill'}:{},prompt:'',enabled:true,order:xs.reduce((n,x)=>Math.max(n,x.order),0)+10,description:'',example:'' }]); setDirty(true)
  }
  const cancel = () => { try { setDraft(parseActions(form.value?.actionsJson)); setDirty(false); setError('') } catch(err) { setError(String(err)) } }
  const save = async () => {
    if (busy || !dirty) return
    if (form.status !== 'ready' || !form.writable || form.revision === undefined) { setError('Host Settings 不可写'); return }
    if (revision.current !== form.revision) { setError('配置被其他窗口更新，请取消修改后重新加载'); return }
    try {
      const normalized = parseActions(encodeActions(draft))
      setBusy(true)
      if (!await saveActions(encodeActions(normalized), revision.current)) { setError('DSH Host 拒绝保存；编辑内容已保留'); return }
      setDraft(normalized); setDirty(false); setError('')
    } catch(err) { setError('未保存：'+String(err)) }
    finally { setBusy(false) }
  }
  const exportJson = () => {
    try {
      const file = new Blob([encodeActions(parseActions(encodeActions(draft)))],{type:'application/json;charset=utf-8'})
      const href = URL.createObjectURL(file), a = document.createElement('a')
      a.href = href; a.download = 'mattpocock-dsh-actions.json'; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch(err) { setError(String(err)) }
  }
  return <section className={css.root}>
    <h2>编码按钮 / Skill Launcher</h2><p>第一排绑定 DSH Skill，第二排只插入提示词。点击不会自动发送，保存后对全部会话生效。</p>
    {(['skill','prompt'] as const).map(kind=><section key={kind}>
      <div className={css.head}><h3>{kind==='skill'?'第一排 Skills':'第二排提示词'}</h3><button type="button" onClick={()=>add(kind)}>新增</button></div>
      {draft.filter(a=>a.kind===kind).sort((a,b)=>a.order-b.order).map(a=><div className={css.card} key={a.id}>
        <div className={css.row}>
          <label><input type="checkbox" checked={a.enabled} onChange={e=>change(a.id,{enabled:e.target.checked})}/>启用</label>
          <label>按钮名称<input value={a.label} onChange={e=>change(a.id,{label:e.target.value})}/></label>
          {kind==='skill'&&<label>Skill ID<input value={a.skillId??''} onChange={e=>change(a.id,{skillId:e.target.value})}/></label>}
          <label>排序<input type="number" value={a.order} onChange={e=>change(a.id,{order:Number(e.target.value)})}/></label>
          <button type="button" onClick={()=>{setDraft(xs=>xs.filter(x=>x.id!==a.id));setDirty(true)}}>删除</button>
        </div>
        <label>提示词<textarea rows={2} value={a.prompt} onChange={e=>change(a.id,{prompt:e.target.value})}/></label>
        <label>什么时候使用<input value={a.description} onChange={e=>change(a.id,{description:e.target.value})}/></label>
        <label>具体例子<input value={a.example} onChange={e=>change(a.id,{example:e.target.value})}/></label>
      </div>)}
    </section>)}
    <div className={css.head}>
      <button type="button" onClick={exportJson}>导出 JSON</button>
      <button type="button" onClick={()=>{setDraft(DEFAULT_ACTIONS.map(x=>({...x})));setDirty(true)}}>恢复默认（待保存）</button>
      <button type="button" onClick={cancel} disabled={!dirty||busy}>取消</button>
      <button type="button" onClick={()=>{void save()}} disabled={!dirty||busy||!form.writable}>{busy?'保存中…':'保存'}</button>
    </div>
    <details><summary>JSON 配置导入（仅预览，需保存）</summary>
      <textarea rows={6} value={importJson} onChange={e=>setImportJson(e.target.value)}/>
      <button type="button" onClick={()=>{try{setDraft(parseActions(importJson));setDirty(true);setError('')}catch(err){setError('导入未生效：'+String(err))}}}>校验并导入</button>
    </details>
    {error&&<p role="alert" className={css.error}>{error}</p>}
    <small>配置状态：{form.status}；{dirty?'有未保存修改':'已同步'}；Host 版本：{form.revision??'未加载'}</small>
  </section>
}
