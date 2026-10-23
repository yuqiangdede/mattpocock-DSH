/**
 * Pre-render source policy for model-authored Mermaid fences.
 *
 * Mermaid builds and measures its diagram inside a temporary element attached
 * to the document, so a source that names an external resource makes the
 * browser request that URL before `mermaid.render` returns. Sanitizing the
 * returned SVG cannot undo that request, and Mermaid exposes no option to block
 * external resource values. A fence whose source would request something is
 * therefore refused before the diagram is rendered at all.
 */

/** One CSS `url()` call with its quoted or bare argument captured. */
const CSS_URL_CALL = /\burl\s*\(\s*(?:'([^']*)'|"([^"]*)"|([^)]*))/giu

/** Mermaid's image shape carries an arbitrary URL in its `img` field. */
const IMAGE_SHAPE = /@\{[^}]*\bimg\s*:/iu

/** Markup that loads another document or resource when a label is rendered as HTML. */
const RESOURCE_MARKUP = /<(?:img|image|iframe|object|embed|link|script)\b/iu

/**
 * Whether one Mermaid source would make the renderer request an external
 * resource. Same-document `url(#fragment)` references stay allowed.
 * @param source - Fenced Mermaid source.
 * @returns True when the source must not be rendered.
 */
export function mermaidSourceRequestsResources(source: string): boolean {
  return requestsCssUrl(source) || IMAGE_SHAPE.test(source) || RESOURCE_MARKUP.test(source)
}

/** @param source - Mermaid source text. @returns True for any `url()` whose target is not a fragment. */
function requestsCssUrl(source: string): boolean {
  for (const [, single, double, bare] of source.matchAll(CSS_URL_CALL)) {
    const target = (single ?? double ?? bare ?? '').trim()
    if (!target.startsWith('#')) return true
  }
  return false
}
