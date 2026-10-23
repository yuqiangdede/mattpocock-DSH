// @vitest-environment jsdom
// MermaidDiagram: the dynamic mermaid import is mocked so the render arms
// (pending fallback, resolved SVG, failure notice) are deterministic.
// MarkdownText's mermaid fence route is pinned here alongside the streaming
// deferral, matching the math-fence streaming tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MarkdownText } from './markdown-test-components.tsx'
import { MermaidDiagram } from '../src/markdown/MermaidDiagram.tsx'

const mermaidRender = vi.fn()
const mermaidInitialize = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender,
  },
}))

const FAILURE_LABEL = 'Mermaid diagram could not be rendered. Showing its source.'
const flushEffects = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-ds-dark-theme')
  vi.clearAllMocks()
})

describe('MermaidDiagram', () => {
  it('renders the source in a fallback while the SVG is pending', async () => {
    mermaidRender.mockReturnValue(new Promise(() => {}))
    const source = 'graph TD\n  A --> B'
    const { container } = render(<MermaidDiagram source={source} failureLabel={FAILURE_LABEL} />)
    await flushEffects()

    const fallback = container.querySelector('div > pre')
    expect(fallback).not.toBeNull()
    expect(fallback?.querySelector('code')?.textContent).toBe(source)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(mermaidInitialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: 'default',
    })
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), source)
  })

  it('swaps to the resolved SVG via dangerouslySetInnerHTML', async () => {
    const svg = '<svg><rect /></svg>'
    mermaidRender.mockResolvedValue({ svg })
    const source = 'graph TD\n  A --> B'
    const { container } = render(<MermaidDiagram source={source} failureLabel={FAILURE_LABEL} />)

    await waitFor(() => {
      expect(container.querySelector('div > svg')).not.toBeNull()
    })
    expect(container.querySelector('div > svg')?.outerHTML).toContain('<svg')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('shows the localized failure notice while retaining the source', async () => {
    mermaidRender.mockRejectedValue(new Error('parse failed'))
    const source = 'not valid mermaid'
    const { container } = render(<MermaidDiagram source={source} failureLabel={FAILURE_LABEL} />)

    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).not.toBeNull()
    })
    expect(container.querySelector('[role="status"]')?.textContent).toBe(FAILURE_LABEL)
    expect(container.querySelector('pre code')?.textContent).toBe(source)
    expect(container.querySelector('svg')).toBeNull()
    // The internal parser diagnostic stays out of the rendered UI.
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('shows the same failure notice for a non-Error rejection', async () => {
    mermaidRender.mockRejectedValue('string error')
    const source = 'bad graph'
    const { container } = render(<MermaidDiagram source={source} failureLabel={FAILURE_LABEL} />)

    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).not.toBeNull()
    })
    expect(container.querySelector('pre code')?.textContent).toBe(source)
  })

  it('discards the resolved result if unmounted before the render resolves', async () => {
    const svg = '<svg/>'
    let resolveRender: (value: { svg: string }) => void = () => {}
    mermaidRender.mockReturnValue(new Promise((resolve) => { resolveRender = resolve }))
    const { unmount, container } = render(<MermaidDiagram source={'graph TD\n  A --> B'} failureLabel={FAILURE_LABEL} />)
    await flushEffects()
    unmount()
    // Resolving after unmount must not swap in the SVG (the cancelled guard swallows it).
    resolveRender({ svg })
    expect(container.querySelector('svg')).toBeNull()
  })

  it('discards the rejected result if unmounted before the render fails', async () => {
    let rejectRender: (reason: unknown) => void = () => {}
    mermaidRender.mockReturnValue(new Promise((_resolve, reject) => { rejectRender = reject }))
    const { unmount, container } = render(<MermaidDiagram source={'graph TD\n  A --> B'} failureLabel={FAILURE_LABEL} />)
    await flushEffects()
    unmount()
    // Rejecting after unmount must not set the failure notice (the cancelled guard swallows it).
    rejectRender(new Error('late failure'))
    await flushEffects()
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('never renders a previous source’s SVG after the fence changes', async () => {
    const previous = '<svg id="previous"/>'
    mermaidRender.mockImplementation((_id: string, source: string) => source === 'old'
      ? Promise.resolve({ svg: previous })
      : new Promise(() => {}))
    const view = render(<MermaidDiagram source={'old'} failureLabel={FAILURE_LABEL} />)
    await waitFor(() => {
      expect(view.container.querySelector('svg#previous')).not.toBeNull()
    })

    view.rerender(<MermaidDiagram source={'new'} failureLabel={FAILURE_LABEL} />)
    expect(view.container.querySelector('svg#previous')).toBeNull()
    expect(view.container.querySelector('pre code')?.textContent).toBe('new')
  })

  it('renders dark diagrams with Mermaid’s dark theme and refreshes on palette change', async () => {
    mermaidRender.mockImplementation((id: string) => Promise.resolve({ svg: `<svg id="${id}"/>` }))
    document.body.setAttribute('data-ds-dark-theme', '')
    const view = render(<MermaidDiagram source={'graph TD\n  A --> B'} failureLabel={FAILURE_LABEL} />)

    await waitFor(() => {
      expect(mermaidInitialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
    })
    expect(view.container.querySelector('svg')).not.toBeNull()

    document.body.removeAttribute('data-ds-dark-theme')
    await waitFor(() => {
      expect(mermaidInitialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }))
    })
    await waitFor(() => {
      expect(mermaidRender).toHaveBeenCalledTimes(2)
    })
  })
})

describe('MarkdownText mermaid fence', () => {
  it('renders a settled mermaid fence through MermaidDiagram', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg id="settled"/>' })
    const { container } = render(<MarkdownText text={'```mermaid\ngraph TD\n  A --> B\n```'} />)

    await waitFor(() => {
      expect(container.querySelector('svg#settled')).not.toBeNull()
    })
  })

  it('defers mermaid rendering while streaming, falling through to CodeBlock', () => {
    mermaidRender.mockResolvedValue({ svg: '<svg/>' })
    const { container } = render(<MarkdownText text={'```mermaid\ngraph TD\n  A --> B\n```'} streaming />)

    // Streaming falls through to the plain CodeBlock arm; no diagram mount.
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('pre code')?.textContent).toContain('graph TD')
    expect(mermaidRender).not.toHaveBeenCalled()
  })

  it('shows the localized failure notice for an invalid settled diagram', async () => {
    mermaidRender.mockRejectedValue(new Error('syntax error'))
    const { getByRole } = render(<MarkdownText text={'```mermaid\nnot a diagram\n```'} />)

    await waitFor(() => {
      expect(getByRole('status').textContent).toBe('Mermaid diagram could not be rendered. Showing its source.')
    })
  })
})
