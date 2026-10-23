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
    || enablesHtmlLabels(source)
}

/** @param source - Mermaid source text. @returns True for any `url()` whose target is not a fragment. */
function requestsCssUrl(source: string): boolean {
  // CSS tokenization removes comments and decodes escapes before Mermaid's
  // temporary DOM is mounted. Mirror those steps so obfuscated url() calls
  // are refused before they can trigger a browser request.
  const normalized = decodeCssEscapes(source).replace(/\\/\\*[\\s\\S]*?\\*\\//gu, '')
  if (normalized.includes('/*')) return true
  const calls = /\\burl\\s*\\(\\s*(?:'([^']*)'|"([^"]*)"|([^)]*))/giu
  for (const [, single, double, bare] of normalized.matchAll(calls)) {
    const target = (single ?? double ?? bare ?? '').trim()
    if (!target.startsWith('#')) return true
  }
  return false
}

/** Refuse Mermaid directives that can re-enable HTML label rendering. */
function enablesHtmlLabels(source: string): boolean {
  return /%%\\{[\\s\\S]*?\\b["']?htmlLabels["']?\\s*:\\s*true\\b[\\s\\S]*?\\}%%/iu.test(source)
}

/** Decode CSS escapes using the same token normalization as the SVG sanitizer. */
function decodeCssEscapes(css: string): string {
  let decoded = ''
  for (let index = 0; index < css.length; index++) {
    const char = css.charAt(index)
    if (char !== '\\\\') {
      decoded += char
      continue
    }
    const next = css.charAt(index + 1)
    if (next === '') {
      decoded += char
      continue
    }
    if (next === '\\n' || next === '\\r') {
      index++
      continue
    }
    const hex = /^[0-9a-fA-F]{1,6}/u.exec(css.slice(index + 1))
    if (hex === null) {
      decoded += next
      index++
      continue
    }
    const codePoint = Number.parseInt(hex[0], 16)
    decoded += codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? '\\uFFFD'
      : String.fromCodePoint(codePoint)
    index += hex[0].length
    if (/\\s/u.test(css.charAt(index + 1))) index++
  }
  return decoded
}
