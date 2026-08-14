import { useEffect, useId, useState } from 'react'
import css from './MermaidDiagram.module.css'

/**
 * Mermaid diagram renderer: converts a fenced ```mermaid source block into an
 * SVG graphic. Mirrors the katex.tsx trust model — Mermaid emits a static SVG
 * vocabulary with no raw user HTML, so the SVG string is inserted through
 * dangerouslySetInnerHTML the same way shiki's span tree and KaTeX's HTML are.
 *
 * Rendering is asynchronous (mermaid.render returns a Promise), so the
 * component shows the source as a plain code block until the SVG resolves,
 * then swaps. A failed render falls back to the source with an error title,
 * matching katex.tsx's error-span behavior.
 *
 * @param source - The mermaid diagram source (the fenced block's value).
 */
export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    import('mermaid')
      .then(async (mod) => {
        const mermaid = mod.default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const result = await mermaid.render(`mermaid-${id}`, source)
        if (!cancelled) setSvg(result.svg)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [id, source])

  if (error !== null) {
    return (
      <div className={css.fallback} title={error}>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    )
  }
  if (svg === null) {
    return (
      <div className={css.fallback}>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    )
  }
  return <div className={css.diagram} dangerouslySetInnerHTML={{ __html: svg }} />
}
