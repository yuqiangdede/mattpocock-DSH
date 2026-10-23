import { useEffect, useId, useRef, useState } from 'react'
import { useColorScheme, type ColorScheme } from '../ColorScheme.tsx'
import { sanitizeMermaidSvg } from './sanitize-mermaid-svg.ts'
import css from './MermaidDiagram.module.css'

/** Identify the source and scheme one settled SVG represents. */
interface DiagramOutcome {
  readonly source: string
  readonly scheme: ColorScheme
  readonly svg: string | null
}

/**
 * Render one fenced Mermaid diagram as sanitized inline SVG.
 *
 * Mermaid loads lazily so it stays out of the initial conversation bundle. The
 * source stays visible until the SVG resolves; a failed import, parse, or
 * sanitization keeps the source and adds the caller's localized failure notice.
 * The SVG embeds the palette it was rendered with, so the outcome is stored
 * with its source and color scheme: a changed fence or palette never displays
 * a previous diagram while the new render is pending. The scheme arrives from
 * the nearest `ColorSchemeProvider` mounted by the shell; a diagram outside
 * one renders the light palette.
 *
 * @param source - Mermaid source from the fenced code block.
 * @param failureLabel - Localized notice shown when rendering fails.
 */
export function MermaidDiagram({ source, failureLabel }: {
  source: string
  failureLabel: string
}) {
  const id = useId().replace(/:/g, '')
  const renderSequence = useRef(0)
  const scheme = useColorScheme()
  const [outcome, setOutcome] = useState<DiagramOutcome | null>(null)
  const current = outcome !== null && outcome.source === source && outcome.scheme === scheme
    ? outcome
    : null

  useEffect(() => {
    let cancelled = false
    const isCancelled = (): boolean => cancelled
    const renderId = `mermaid-${id}-${++renderSequence.current}`
    void import('mermaid')
      .then(async (module) => {
        if (isCancelled()) return
        module.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          // This component owns the failure UI; Mermaid's default error diagram
          // would otherwise append stray DOM to document.body before rejecting.
          suppressErrorRendering: true,
          // Text labels keep Mermaid's output to the static SVG vocabulary the
          // sanitizer accepts, with no foreignObject subtree.
          htmlLabels: false,
          theme: scheme === 'dark' ? 'dark' : 'default',
        })
        const { svg } = await module.default.render(renderId, source)
        const sanitized = sanitizeMermaidSvg(svg)
        if (isCancelled()) return
        setOutcome({ source, scheme, svg: sanitized })
      })
      .catch(() => {
        // Import, parse, and render failures share the source fallback; the raw
        // diagnostic stays out of the UI because callers own localized copy.
        if (!isCancelled()) setOutcome({ source, scheme, svg: null })
      })
    return () => { cancelled = true }
  }, [id, source, scheme])

  if (current?.svg != null) {
    return <div className={css.diagram} data-mermaid-diagram="" dangerouslySetInnerHTML={{ __html: current.svg }} />
  }
  return (
    <div className={css.fallback} data-mermaid-failure={current?.svg === null ? '' : undefined}>
      {current?.svg === null
        && <p className={css.notice} role="status">{failureLabel}</p>}
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  )
}
