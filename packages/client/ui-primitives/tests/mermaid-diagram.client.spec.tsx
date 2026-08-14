// @vitest-environment jsdom
// MermaidDiagram: the dynamic mermaid import is mocked so the three render
// arms (pending fallback, resolved SVG, error fallback) are deterministic.
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

const flushEffects = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MermaidDiagram', () => {
  it('renders the source in a fallback while the SVG is pending', async () => {
    mermaidRender.mockReturnValue(new Promise(() => {}))
    const source = 'graph TD\n  A --> B'
    const { container } = render(<MermaidDiagram source={source} />)
    await flushEffects()

    // Pending arm: a div with a title-less fallback carrying the raw source.
    const fallback = container.querySelector('div > pre')
    expect(fallback).not.toBeNull()
    expect(fallback?.querySelector('code')?.textContent).toBe(source)
    expect(container.querySelector('svg')).toBeNull()
    expect(mermaidInitialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict' })
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), source)
  })

  it('swaps to the resolved SVG via dangerouslySetInnerHTML', async () => {
    const svg = '<svg><rect /></svg>'
    mermaidRender.mockResolvedValue({ svg })
    const source = 'graph TD\n  A --> B'
    const { container } = render(<MermaidDiagram source={source} />)

    await waitFor(() => {
      expect(container.querySelector('div > svg')).not.toBeNull()
    })
    expect(container.querySelector('div > svg')?.outerHTML).toContain('<svg')
    expect(container.querySelector('pre')).toBeNull()
  })

  it('falls back to the source with an error title on render failure', async () => {
    mermaidRender.mockRejectedValue(new Error('parse failed'))
    const source = 'not valid mermaid'
    const { container } = render(<MermaidDiagram source={source} />)

    await waitFor(() => {
      expect(container.querySelector('div[title="parse failed"]')).not.toBeNull()
    })
    expect(container.querySelector('div[title="parse failed"] pre code')?.textContent).toBe(source)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('falls back to the source with a stringified non-Error title on rejection', async () => {
    mermaidRender.mockRejectedValue('string error')
    const source = 'bad graph'
    const { container } = render(<MermaidDiagram source={source} />)

    await waitFor(() => {
      expect(container.querySelector('div[title="string error"]')).not.toBeNull()
    })
    expect(container.querySelector('div[title="string error"] pre code')?.textContent).toBe(source)
  })

  it('discards the resolved result if unmounted before the render resolves', async () => {
    const svg = '<svg/>'
    let resolveRender: (value: { svg: string }) => void = () => {}
    mermaidRender.mockReturnValue(new Promise((resolve) => { resolveRender = resolve }))
    const { unmount, container } = render(<MermaidDiagram source={'graph TD\n  A --> B'} />)
    await flushEffects()
    unmount()
    // Resolving after unmount must not swap in the SVG (the cancelled guard swallows it).
    resolveRender({ svg })
    expect(container.querySelector('svg')).toBeNull()
  })

  it('discards the rejected result if unmounted before the render fails', async () => {
    let rejectRender: (reason: unknown) => void = () => {}
    mermaidRender.mockReturnValue(new Promise((_resolve, reject) => { rejectRender = reject }))
    const { unmount, container } = render(<MermaidDiagram source={'graph TD\n  A --> B'} />)
    await flushEffects()
    unmount()
    // Rejecting after unmount must not set the error fallback (the cancelled guard swallows it).
    rejectRender(new Error('late failure'))
    await flushEffects()
    expect(container.querySelector('div[title]')).toBeNull()
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
})
