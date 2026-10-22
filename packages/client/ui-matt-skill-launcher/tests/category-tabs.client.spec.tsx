// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CategoryTabs } from '../src/client/CategoryTabs.tsx'

afterEach(cleanup)

const items = [
  { value: 'development', label: 'Development', id: 'tabs-development' },
  { value: 'document', label: 'Documents', id: 'tabs-document' },
  { value: 'more', label: 'More', id: 'tabs-more' },
] as const

function Harness({ onKeyDown }: { onKeyDown?: () => void }) {
  const [value, setValue] = useState<string>('development')
  return <div onKeyDown={onKeyDown}>
    <CategoryTabs items={items} value={value} onChange={setValue} label="Button categories" panelId="tabs-panel" />
    <div role="tabpanel" id="tabs-panel" aria-labelledby={`tabs-${value}`} />
  </div>
}

describe('CategoryTabs', () => {
  it('declares one selected tab, one tab stop, and the panel it controls', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Button categories' })).toBeTruthy()
    const selected = screen.getByRole('tab', { selected: true })
    expect(selected.textContent).toBe('Development')
    expect(selected.id).toBe('tabs-development')
    expect(selected.getAttribute('aria-controls')).toBe('tabs-panel')
    expect(selected.tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'Documents' }).tabIndex).toBe(-1)
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tabs-development')
  })

  it('selects on click and follows the click with the panel label', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    expect(screen.getByRole('tab', { name: 'Documents' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tabs-document')
  })

  it('moves focus and selection with arrows, Home, and End, and leaves Tab alone', () => {
    const onKeyDown = vi.fn()
    render(<Harness onKeyDown={onKeyDown} />)
    const development = screen.getByRole('tab', { name: 'Development' })
    const documents = screen.getByRole('tab', { name: 'Documents' })
    const more = screen.getByRole('tab', { name: 'More' })
    development.focus()
    for (const [from, key, to] of [
      [development, 'ArrowLeft', more],
      [more, 'ArrowRight', development],
      [development, 'ArrowRight', documents],
      [documents, 'End', more],
      [more, 'Home', development],
    ] as const) {
      fireEvent.keyDown(from, { key })
      expect(document.activeElement).toBe(to)
      expect(to.getAttribute('aria-selected')).toBe('true')
      expect(to.tabIndex).toBe(0)
    }
    expect(onKeyDown).not.toHaveBeenCalled()
    fireEvent.keyDown(development, { key: 'Tab' })
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(screen.getByRole('tab', { selected: true })).toBe(development)
  })
})
