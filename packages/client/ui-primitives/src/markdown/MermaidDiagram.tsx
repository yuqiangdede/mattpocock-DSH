import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { sanitizeMermaidSvg } from './sanitize-mermaid-svg.ts'
import css from './MermaidDiagram.module.css'

/** Body attribute the theme presenter keeps while the dark palette is active. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/** The document's active color scheme, as published by the theme presenter. */
type ColorScheme = 'light' | 'dark'

/** Identify the source and scheme one settled SVG represents. */
interface DiagramOutcome {
  readonly source: string
  readonly scheme: ColorScheme
  readonly svg: string | null
}

/** Subscribe one diagram to palette changes on the document body. */
function subscribeColorScheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] })
  return () => { observer.disconnect() }
}

/** Read the palette the token stylesheets currently select. */
function readColorScheme(): ColorScheme {
  return document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light'
}

/**
 * Render one fenced Mermaid diagram as sanitized inline SVG.
 *
 * Mermaid loads lazily so it stays out of the initial conversation bundle. The
 * source stays visible until the SVG resolves; a failed import, parse, or
 * sanitization keeps the source and adds the caller's localized failure notice.
 * The outcome is stored with its source and color scheme, so a changed fence or
 * palette never displays a previous diagram while the new render is pending.
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
  const scheme = useSyncExternalStore(subscribeColorScheme, readColorScheme)
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
