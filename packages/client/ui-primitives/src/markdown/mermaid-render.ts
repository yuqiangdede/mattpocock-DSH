/**
 * One shared renderer for every Mermaid diagram this package draws.
 *
 * Mermaid keeps its configuration in one process-wide store: `initialize`
 * writes it, and each `render` resets to it before merging that fence's own
 * directives. Two diagrams that rendered concurrently would therefore let one
 * diagram's palette or directives reach the other's markup, so every render
 * runs through this queue together with the initialization it was given.
 */
import type { MermaidConfig } from 'mermaid'
import type { ColorScheme } from '../ColorScheme.tsx'
import { sanitizeMermaidSvg } from './sanitize-mermaid-svg.ts'

/** Mermaid options shared by every diagram. */
function configuration(scheme: ColorScheme): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    // The component owns the failure UI; Mermaid's own error diagram would
    // otherwise append stray DOM to document.body before rejecting.
    suppressErrorRendering: true,
    // Text labels keep Mermaid's output to the static SVG vocabulary the
    // sanitizer accepts, with no foreignObject subtree.
    htmlLabels: false,
    theme: scheme === 'dark' ? 'dark' : 'default',
  }
}

/** Tail of the render queue; always settles successfully so one failure cannot stall it. */
let queue: Promise<unknown> = Promise.resolve()

/** Next render id, which Mermaid writes into the temporary element it mounts. */
let renderCount = 0

/**
 * Render one Mermaid source as sanitized inline SVG, one diagram at a time.
 * @param source - Mermaid source from a fenced code block.
 * @param scheme - Palette the SVG is drawn with.
 * @returns The sanitized SVG, or null when Mermaid's markup is not a parseable SVG.
 */
export function renderMermaidSvg(source: string, scheme: ColorScheme): Promise<string | null> {
  const rendered = queue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize(configuration(scheme))
    const { svg } = await mermaid.render(`mermaid-${++renderCount}`, source)
    return sanitizeMermaidSvg(svg)
  })
  queue = rendered.then(() => undefined, () => undefined)
  return rendered
}
