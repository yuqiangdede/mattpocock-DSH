// @vitest-environment jsdom
// The SVG sanitizer is the security gate between Mermaid and
// dangerouslySetInnerHTML: these cases pin every resource-bearing spelling it
// removes and the same-document references it keeps.

import { describe, expect, it } from 'vitest'
import { sanitizeMermaidSvg } from '../src/markdown/sanitize-mermaid-svg.ts'

const SVG = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${body}</svg>`

describe('sanitizeMermaidSvg', () => {
  it('rejects malformed SVG and non-SVG documents', () => {
    expect(sanitizeMermaidSvg('<svg><g></svg>')).toBeNull()
    expect(sanitizeMermaidSvg('<html xmlns="http://www.w3.org/1999/xhtml" />')).toBeNull()
  })

  it('drops script, HTML, and animation elements', () => {
    const sanitized = sanitizeMermaidSvg(SVG(
      '<script>alert(1)</script><foreignObject><div>label</div></foreignObject>'
      + '<iframe/><object/><embed/><link/><meta/><base/>'
      + '<set attributeName="href" to="https://evil.example"/><animate attributeName="href"/>'
      + '<g id="kept"/>',
    ))
    expect(sanitized).not.toBeNull()
    for (const tag of ['script', 'foreignObject', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'set', 'animate']) {
      expect(sanitized).not.toContain(`<${tag}`)
    }
    expect(sanitized).toContain('id="kept"')
  })

  it('removes external resource attributes and keeps fragment references', () => {
    const sanitized = sanitizeMermaidSvg(SVG(
      '<image href="https://evil.example/a.png"/>'
      + '<image xlink:href="https://evil.example/b.png"/>'
      + '<image href="#marker"/>'
      + '<g href="mailto:dev@example.com" src="https://evil.example/c.png" '
      + 'srcset="https://evil.example/d.png 1x" poster="https://evil.example/e.png"/>'
      + '<use xlink:href="#node"/>'
      + '<g onclick="alert(1)" onmouseover="#ignored" fill="red" data-note="kept"/>',
    ))
    expect(sanitized).not.toBeNull()
    expect(sanitized).not.toContain('evil.example')
    expect(sanitized).not.toContain('mailto:')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('onmouseover')
    expect(sanitized).toContain('href="#marker"')
    expect(sanitized).toContain('xlink:href="#node"')
    expect(sanitized).toContain('fill="red"')
    expect(sanitized).toContain('data-note="kept"')
  })

  it('sanitizes resource references inside attributes', () => {
    const sanitized = sanitizeMermaidSvg(SVG(
      '<rect fill="url(https://evil.example/paint.svg#p)" stroke="url(#gradient)"/>'
      + '<g style="background:url(https://evil.example/bg.png);mask:url(#mask)"/>'
      + '<g style="background-image:image-set(&quot;https://evil.example/x.png&quot; 1x)"/>'
      + '<g style="background:image(&quot;https://evil.example/y.png&quot;)"/>'
      + '<g style="background:u\\72l(https://evil.example/escaped.png)"/>'
      + '<g style="background:url/**/(https://evil.example/comment.png);'
      + 'mask:image-set/**/(&quot;https://evil.example/set.png&quot; 1x)"/>'
      + '<g style="x:url/*unterminated"/>'
      + '<g style="image(&quot;https://evil.example/whole.png&quot;)"/>'
      + '<g style="cursor:url(&quot;#local\\\\cursor&quot;)"/>'
      + '<g fill="url(#unterminated"/>',
    ))
    expect(sanitized).not.toBeNull()
    expect(sanitized).not.toContain('evil.example')
    expect(sanitized).not.toContain('image-set')
    expect(sanitized).toContain('stroke="url(#gradient)"')
    expect(sanitized).toContain('mask:url(#mask)')
    expect(sanitized).not.toContain('url(#unterminated')
  })

  it('sanitizes style element text', () => {
    const sanitized = sanitizeMermaidSvg(SVG(
      '<style>'
      + '@import "https://evil.example/theme.css";'
      + '@import url(https://evil.example/second.css);'
      + '.node{fill:url(#gradient);stroke:url(https://evil.example/stroke.png);'
      + 'background-image:image-set("https://evil.example/one.png" 1x);'
      + 'cursor:url("#local-cursor"), auto;}'
      + '.label{content:"url(https://evil.example/text)";}'
      + '.gap{fill:url ("#gap");}'
      + '.newline{content:"x\\\n url(https://evil.example/newline.png)"}'
      + '.carriage{content:"x\\&#13; url(https://evil.example/carriage.png)"}'
      + '</style><g class="node"/>',
    ))
    expect(sanitized).not.toBeNull()
    expect(sanitized).not.toContain('evil.example')
    expect(sanitized).not.toContain('@import')
    expect(sanitized).not.toContain('image-set')
    expect(sanitized).toContain('fill:url(#gradient)')
    expect(sanitized).toContain('cursor:url("#local-cursor"), auto')
  })

  it('decodes CSS escapes before scanning', () => {
    const sanitized = sanitizeMermaidSvg(SVG(
      '<g style="a:u\\72 l(https://evil.example/hex.png);'
      + 'b:\\69 mage-set(&quot;https://evil.example/set.png&quot; 1x);'
      + 'c:url(\\68 ttps://evil.example/escaped.png);'
      + 'd:\\0 ;e:\\d800;f:\\q;g:\\"/>',
    ))
    expect(sanitized).not.toBeNull()
    expect(sanitized).not.toContain('evil.example')
    expect(sanitized).not.toContain('image-set')
  })
})
