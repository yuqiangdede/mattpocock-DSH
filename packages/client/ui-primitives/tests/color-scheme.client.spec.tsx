// @vitest-environment jsdom
// The ambient palette scope: the shell mounts it from the resolved theme, and
// primitives read it instead of observing the document.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ColorSchemeProvider, useColorScheme } from '../src/ColorScheme.tsx'

afterEach(cleanup)

/** Render the ambient scheme as text so a spec can read it. */
function SchemeProbe() {
  return <span data-testid="scheme">{useColorScheme()}</span>
}

describe('ColorSchemeProvider', () => {
  it('reports light outside any scope', () => {
    const { getByTestId } = render(<SchemeProbe />)
    expect(getByTestId('scheme').textContent).toBe('light')
  })

  it('publishes the enclosing scheme and follows it on re-render', () => {
    const view = render(<ColorSchemeProvider scheme="dark"><SchemeProbe /></ColorSchemeProvider>)
    expect(view.getByTestId('scheme').textContent).toBe('dark')

    view.rerender(<ColorSchemeProvider scheme="light"><SchemeProbe /></ColorSchemeProvider>)
    expect(view.getByTestId('scheme').textContent).toBe('light')
  })

  it('lets a nested scope replace the enclosing one', () => {
    const { getByTestId } = render(
      <ColorSchemeProvider scheme="light">
        <ColorSchemeProvider scheme="dark"><SchemeProbe /></ColorSchemeProvider>
      </ColorSchemeProvider>,
    )
    expect(getByTestId('scheme').textContent).toBe('dark')
  })
})
