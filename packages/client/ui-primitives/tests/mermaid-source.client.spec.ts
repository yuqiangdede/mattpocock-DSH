// Pre-render source policy: Mermaid requests resource URLs while it renders, so
// a fence that names one is refused before the lazy import runs.

import { describe, expect, it } from 'vitest'
import { mermaidSourceRequestsResources } from '../src/markdown/mermaid-source.ts'

describe('mermaidSourceRequestsResources', () => {
  it('accepts sources that name no external resource', () => {
    expect(mermaidSourceRequestsResources('flowchart TD\n  A --> B')).toBe(false)
    // A URL in a label is text once htmlLabels is off; it requests nothing.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A["see https://example.com"] --> B')).toBe(false)
    // Same-document paint references stay allowed.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url(#gradient)')).toBe(false)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url( "#gradient" )')).toBe(false)
    expect(mermaidSourceRequestsResources("flowchart TD\n  A\n  style A fill:url('#gradient')")).toBe(false)
  })

  it('refuses a CSS resource function that leaves the document', () => {
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url(https://evil.test/p.svg)')).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:URL( //evil.test/p.svg )')).toBe(true)
    expect(mermaidSourceRequestsResources("flowchart TD\n  A\n  style A fill:url('https://evil.test/p.svg')")).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url("//evil.test/p.svg")')).toBe(true)
    // CSS escapes and comments are normalized before Mermaid renders its temporary DOM.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:u\\72l(https://evil.test/p.svg)')).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url/**/(https://evil.test/p.svg)')).toBe(true)
  })

  it('refuses directives that re-enable HTML labels', () => {
    expect(mermaidSourceRequestsResources('%%{init: {"flowchart":{"htmlLabels":true}}}%%\nflowchart TD\n  A --> B')).toBe(true)
    expect(mermaidSourceRequestsResources("%%{ init: { 'htmlLabels': true } }%%\nflowchart TD\n  A --> B")).toBe(true)
    expect(mermaidSourceRequestsResources('%%{init: {"htmlLabels":false}}%%\nflowchart TD\n  A --> B')).toBe(false)
  })

  it('refuses the image shape that carries a URL', () => {
    expect(mermaidSourceRequestsResources('flowchart TD\n  A@{ img: "https://evil.test/a.png", label: "image" }')).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A@{ shape: image,\n  img: "https://evil.test/a.png" }')).toBe(true)
  })

  it('refuses labels carrying resource markup', () => {
    expect(mermaidSourceRequestsResources('flowchart TD\n  A["<img src=\'https://evil.test/a.png\'>"] --> B')).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A["<iframe src=\'https://evil.test/\'>"]')).toBe(true)
  })
})
