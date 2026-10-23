/**
 * Remove resource-loading markup from Mermaid's generated SVG before the
 * renderer inserts it. Mermaid runs with `securityLevel: 'strict'`, but a
 * model-authored diagram can still name an arbitrary URL through the image
 * shape, an edge link, or class styling, and the browser fetches it after
 * insertion. Only same-document fragment references survive; every other
 * URL-bearing attribute and CSS value is removed.
 */

/**
 * Elements that execute script, load another document, or animate a stripped
 * resource attribute back into the tree. Mermaid emits none of them with
 * `htmlLabels: false`.
 */
const DROPPED_ELEMENTS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'animate', 'animatemotion', 'animatetransform', 'set', 'discard',
])

/** CSS image functions whose string arguments can name a URL without `url()`. */
const DROPPED_CSS_FUNCTIONS = new Set(['image', 'image-set', '-webkit-image-set'])

/** Attributes that fetch a resource when present on any element. */
const RESOURCE_ATTRIBUTES = new Set(['href', 'src', 'srcset', 'poster'])

/** Attributes whose values the browser parses as CSS paint or geometry. */
const CSS_RESOURCE_ATTRIBUTES = new Set([
  'fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'style',
])

/**
 * Strip resource-loading markup from one rendered Mermaid SVG.
 * @param svg - Complete SVG markup returned by `mermaid.render`.
 * @returns The sanitized SVG, or null when the markup is not a parseable SVG.
 */
export function sanitizeMermaidSvg(svg: string): string | null {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (parsed.getElementsByTagName('parsererror').length > 0) return null
  const root = parsed.documentElement
  if (root.localName !== 'svg') return null
  for (const element of [...root.getElementsByTagName('*')]) {
    if (DROPPED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove()
      continue
    }
    sanitizeElement(element)
  }
  sanitizeElement(root)
  return new XMLSerializer().serializeToString(root)
}

/** Sanitize the attributes and style text of one SVG element in place. */
function sanitizeElement(element: Element): void {
  if (element.localName.toLowerCase() === 'style') {
    element.textContent = sanitizeCssValue(element.textContent)
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.localName.toLowerCase()
    if (name.startsWith('on')) {
      element.removeAttributeNode(attribute)
      continue
    }
    if (RESOURCE_ATTRIBUTES.has(name)) {
      if (!isFragmentReference(attribute.value)) element.removeAttributeNode(attribute)
      continue
    }
    const value = attribute.value
    if (!CSS_RESOURCE_ATTRIBUTES.has(name)) continue
    const sanitized = sanitizeCssValue(value)
    if (sanitized.trim() === '') element.removeAttributeNode(attribute)
    else attribute.value = sanitized
  }
}

/**
 * Whether a value is a same-document fragment reference.
 * @param value - Attribute or `url()` payload.
 * @returns True for a bare `#id` reference.
 */
function isFragmentReference(value: string): boolean {
  return value.trim().startsWith('#')
}

/**
 * Strip external resource references from one CSS value: URL-bearing image
 * functions disappear, `url()` survives only for same-document fragments, and
 * `@import` rules are removed.
 * @param value - A CSS declaration list or one presentation-attribute value.
 * @returns The value with external resource references removed.
 */
function sanitizeCssValue(value: string): string {
  const decoded = decodeCssEscapes(value).replace(/@import\b[^;{}]*;?/giu, '')
  return rewriteCssFunctions(decoded)
}

/**
 * Decode CSS escapes so an escaped function name cannot bypass the scanner.
 * @param css - CSS text with possible backslash escapes.
 * @returns The same text with escapes replaced by their literal characters.
 */
function decodeCssEscapes(css: string): string {
  let decoded = ''
  for (let index = 0; index < css.length; index++) {
    const char = css.charAt(index)
    if (char !== '\\') {
      decoded += char
      continue
    }
    const next = css.charAt(index + 1)
    if (next === '') {
      decoded += char
      continue
    }
    if (next === '\n' || next === '\r') {
      index++
      continue
    }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(css.slice(index + 1))
    if (hex === null) {
      decoded += next
      index++
      continue
    }
    const codePoint = Number.parseInt(hex[0], 16)
    decoded += codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? '\uFFFD'
      : String.fromCodePoint(codePoint)
    index += hex[0].length
    const whitespace = css.charAt(index + 1)
    if (/\s/u.test(whitespace)) index++
  }
  return decoded
}

/**
 * Rewrite CSS image functions in one value.
 * @param css - CSS text with escapes already decoded.
 * @returns The text with dropped functions removed and external `url()` calls
 * replaced by `none`.
 */
function rewriteCssFunctions(css: string): string {
  let result = ''
  let cursor = 0
  while (cursor < css.length) {
    const start = cursor
    while (cursor < css.length && /[\w-]/u.test(css.charAt(cursor))) cursor++
    if (cursor === start) {
      result += css.charAt(cursor)
      cursor++
      continue
    }
    const name = css.slice(start, cursor).toLowerCase()
    const open = skipCssTrivia(css, cursor)
    if (css.charAt(open) !== '(' || (name !== 'url' && !DROPPED_CSS_FUNCTIONS.has(name))) {
      result += css.slice(start, cursor)
      continue
    }
    const close = findClosingParen(css, open)
    if (close === -1) {
      // An unterminated function consumes the rest of the declaration list;
      // dropping the tail keeps later URL text from bypassing the scanner.
      break
    }
    if (name === 'url') {
      const target = css.slice(open + 1, close).trim().replace(/^(['"])(.*)\1$/u, '$2')
      result += isFragmentReference(target) ? css.slice(start, close + 1) : 'none'
    }
    cursor = close + 1
  }
  return result
}

/**
 * Skip whitespace and comments between a CSS function name and its `(`.
 * @param text - CSS text being scanned.
 * @param from - Index immediately after the function name.
 * @returns The index of the first non-trivia character.
 */
function skipCssTrivia(text: string, from: number): number {
  let index = from
  while (index < text.length) {
    if (/\s/u.test(text.charAt(index))) {
      index++
      continue
    }
    if (text.charAt(index) === '/' && text.charAt(index + 1) === '*') {
      const end = text.indexOf('*/', index + 2)
      if (end === -1) return text.length
      index = end + 2
      continue
    }
    break
  }
  return index
}

/**
 * Find the `)` matching one `(` while ignoring parentheses inside quotes.
 * @param text - Text containing the opening parenthesis.
 * @param open - Index of the opening parenthesis.
 * @returns The matching `)` index, or -1 when the call is unterminated.
 */
function findClosingParen(text: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = open; index < text.length; index++) {
    const char = text.charAt(index)
    if (quote !== null) {
      if (char === '\\') index++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')' && --depth === 0) return index
  }
  return -1
}
