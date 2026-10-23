import { useEffect, useState } from 'react'
import { useColorScheme, type ColorScheme } from '../ColorScheme.tsx'
import { renderMermaidSvg } from './mermaid-render.ts'
import { mermaidSourceRequestsResources } from './mermaid-source.ts'
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
 * A source that would request an external resource is refused before rendering,
 * because Mermaid fetches it during its own render. The SVG embeds the palette
 * it was rendered with, so the outcome is stored with its source and color
 * scheme: a changed fence or palette never displays a previous diagram while
 * the new render is pending. The shared renderer in `mermaid-render.ts`
 * serializes diagram renders, because Mermaid keeps one process-wide
 * configuration. The scheme arrives from the nearest `ColorSchemeProvider`
 * mounted by the shell; a diagram outside one renders the light palette.
 *
 * @param source - Mermaid source from the fenced code block.
 * @param failureLabel - Localized notice shown when rendering fails.
 */
export function MermaidDiagram({ source, failureLabel }: {
  source: string
  failureLabel: string
}) {
  const scheme = useColorScheme()
  const [outcome, setOutcome] = useState<DiagramOutcome | null>(null)
  const current = outcome !== null && outcome.source === source && outcome.scheme === scheme
    ? outcome
    : null

  useEffect(() => {
    let cancelled = false
    if (mermaidSourceRequestsResources(source)) {
      // Mermaid requests resource URLs while it renders into its temporary
      // container, so refusing the source is the only way to prevent the
      // request; the sanitizer only sees the SVG after that render.
      setOutcome({ source, scheme, svg: null })
      return () => { cancelled = true }
    }
    renderMermaidSvg(source, scheme).then(
      (svg) => {
        if (!cancelled) setOutcome({ source, scheme, svg })
      },
      () => {
        // Import, parse, and render failures share the source fallback; the raw
        // diagnostic stays out of the UI because callers own localized copy.
        if (!cancelled) setOutcome({ source, scheme, svg: null })
      },
    )
    return () => { cancelled = true }
  }, [source, scheme])

  if (current?.svg != null) {
    // Only `sanitizeMermaidSvg` output reaches this insertion: it removes every
    // external URL and CSS resource value from Mermaid's markup first.
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
