import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import css from './Launcher.module.css'

/** One dock category tab; the caller renders the panel it controls. */
export interface CategoryTab<Value extends string = string> {
  /** Category this tab selects. */
  value: Value
  /** Localized tab label. */
  label: string
  /** Id of this tab, referenced by the panel's `aria-labelledby`. */
  id: string
}

/**
 * Render the dock's category tabs.
 *
 * The composer dock keeps its compact button metrics, so the tabs follow the
 * ARIA tabs pattern directly instead of the equal-width page-tab treatment:
 * one tab stop, selection that follows Left/Right/Home/End focus, and a single
 * caller-owned panel that every tab controls.
 * @param props.items - ordered non-empty tabs with unique values and DOM ids.
 * @param props.value - selected value, which must belong to items.
 * @param props.onChange - selection requested by click, Left/Right, Home, or End.
 * @param props.label - localized accessible name for the tab list.
 * @param props.panelId - id of the panel every tab controls.
 * @returns the tab list, without its panel.
 */
export function CategoryTabs<Value extends string>({ items, value, onChange, label, panelId }: {
  items: readonly CategoryTab<Value>[]
  value: Value
  onChange: (value: Value) => void
  label: string
  panelId: string
}): ReactNode {
  const list = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + items.length - 1) % items.length; break
      case 'ArrowRight': next = (index + 1) % items.length; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    const tablist = list.current
    const nextItem = items[next]
    /* v8 ignore next -- the event comes from a mounted direct child and next is bounded by non-empty items. */
    if (tablist === null || nextItem === undefined) return
    onChange(nextItem.value)
    tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus()
  }
  return <div className={css.row} role="tablist" aria-label={label} ref={list}>
    {items.map((item, index) => <button key={item.value} id={item.id} type="button" role="tab"
      aria-selected={value === item.value} aria-controls={panelId} tabIndex={value === item.value ? 0 : -1}
      className={value === item.value ? css.recommended : css.action}
      onClick={() => { onChange(item.value) }}
      onKeyDown={(event) => { onKeyDown(event, index) }}>{item.label}</button>)}
  </div>
}
