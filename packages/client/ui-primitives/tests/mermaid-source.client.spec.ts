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

  it('decodes every CSS escape form before looking for a url() call', () => {
    // Hex escapes terminate at whitespace, and the decoded text still names a resource.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:u\\72 l(https://evil.test/p.svg)')).toBe(true)
    // An escape before a non-hex character decodes to that character.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A --> B\\q')).toBe(false)
    // An escaped newline joins two lines, and a trailing backslash stays literal.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A --> B\\\n  C')).toBe(false)
    expect(mermaidSourceRequestsResources('flowchart TD\r\n  A --> B\\\r\n  C')).toBe(false)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A --> B\\')).toBe(false)
    // Invalid code points decode to U+FFFD, which requests nothing.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A["\\0 \\110000 \\d800"] --> B')).toBe(false)
    // A comment that never closes cannot hide the rest of the source.
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url(https://evil.test/p.svg) /*')).toBe(true)
  })

  it('refuses a url() call that names no fragment', () => {
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url()')).toBe(true)
    expect(mermaidSourceRequestsResources('flowchart TD\n  A\n  style A fill:url(   )')).toBe(true)
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
