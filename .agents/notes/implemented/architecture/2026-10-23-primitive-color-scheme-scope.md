# Agent Note: Primitive color-scheme scope

Status: implemented

English | [中文](2026-10-23-primitive-color-scheme-scope.zh.md)

## Problem

A settled Mermaid diagram is a static SVG that bakes its palette into the markup, so it cannot recolor through CSS tokens: it must be rendered again with Mermaid's light or dark theme when the application palette changes. Observing `body[data-ds-dark-theme]` from each diagram with its own `MutationObserver` would make every mounted diagram a subscriber to a document attribute. A conversation or document preview holding many diagrams would then fan one palette change across many observers, and the zero-Cordis primitive would carry document knowledge that belongs to the theme owner.

## Decision

**The theme service stays the palette authority, and the shell scopes its resolved scheme to presentation primitives.** `ui-layout`'s root registration injects one `theme` observable over `ctx.theme.getTheme()` and the `theme/change` event. `AppFrame` reads it through the synthesized `useTheme(snapshot => snapshot.active.colorScheme)` hook and wraps its content in `ColorSchemeProvider`, so the whole application tree — including portaled dialogs — shares one binding. `MermaidDiagram` calls `useColorScheme()` and renders the outcome it stored for the current source and scheme; it never subscribes to anything itself. Mermaid keeps one process-wide configuration, so every diagram renders through the shared `renderMermaidSvg` queue in `mermaid-render.ts`: one initialization is paired with each render, and a diagram mounting while another render is in flight cannot reset that render's palette.

`ColorScheme` is a two-value union (`light` | `dark`) exported by `dsh-client-ui-primitives` alongside the provider and its hook. Outside a provider the hook answers `light`, so tests, story-like fixtures, and embeds that render a primitive alone stay deterministic.

## Verification

Unit specs pin the scope in isolation (outside a provider, a nested replacement, and re-render following a scheme change), the diagram arms (`default` and `dark` Mermaid initialization, re-render when the scoped scheme changes, pending, failure, and cancellation), the shared renderer (a second diagram's initialization waits for the in-flight render), and the frame wiring (a probe below `AppFrame` reads the resolved scheme). The recorded Web snapshot renders a real Mermaid fence and an invalid fence through the shipped composition, so the lazy import, sanitizer, and browser chunk stay exercised.

## Alternatives considered

**Have each diagram observe the document palette attribute.** This would fan one palette change across every diagram's observer and couple a primitive to a global document attribute owned by the theme presenter, so the theme owner supplies a shared scope instead.

**Read `prefers-color-scheme` with `matchMedia`.** Rejected because the application theme is an independent preference: the resolved theme may be dark while the operating system reports light, and a registered third-party theme decides its own `colorScheme`.

**Thread a `colorScheme` prop through every `MarkdownText` owner.** Rejected because it repeats the same wiring at every call site (chat prose, reasoning, plan and document previews, tool details, trajectory, guides) and silently strands any owner that omits it with a light diagram in a dark conversation.

**Recolor the SVG from CSS tokens instead of re-rendering.** Rejected because Mermaid writes concrete color values, including derived shades, into the generated stylesheet and shape attributes; token substitution would have to rewrite that stylesheet per diagram type rather than reuse the renderer's own theming.

## Consequences

- A scheme-dependent primitive reads one ambient scope; adding another such primitive needs no subscription and no per-owner prop.
- Every mounted diagram re-renders on a palette change, which re-runs Mermaid for settled blocks. The cost follows from rendering a static SVG with an embedded palette and is bounded by the number of visible diagrams.
- Diagram renders run one at a time because Mermaid owns one configuration; a conversation with many diagrams draws them in mount order, each waiting for the previous render to settle.
- A diagram rendered outside the shell's provider shows the light palette; standalone embedders that want dark diagrams mount the provider themselves.
- `dsh-client-ui-layout` takes a development dependency on `dsh-client-ui-primitives` for the provider.
