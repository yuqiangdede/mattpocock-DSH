/**
 * Ambient palette scope for primitives whose third-party renderer bakes colors
 * into its output: a settled Mermaid diagram carries a full light or dark
 * palette inside its SVG, so it must re-render when the theme switches. The
 * shell mounts this provider from the resolved theme snapshot; a primitive
 * below it reads the scheme instead of observing the document.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/** Resolved light or dark scheme of the active theme. */
export type ColorScheme = 'light' | 'dark'

const ColorSchemeContext = createContext<ColorScheme>('light')

/** Props for one ambient scheme scope. */
export interface ColorSchemeProviderProps {
  /** Scheme of the active theme around this subtree. */
  readonly scheme: ColorScheme
  /** Content that renders with the surrounding theme's palette. */
  readonly children: ReactNode
}

/**
 * Scope the active theme's scheme to the primitives below it.
 * @param props - The surrounding scheme and the scoped content.
 * @returns The scoped content.
 */
export function ColorSchemeProvider({ scheme, children }: ColorSchemeProviderProps): ReactNode {
  return <ColorSchemeContext.Provider value={scheme}>{children}</ColorSchemeContext.Provider>
}

/**
 * Read the scheme of the nearest enclosing scope.
 * @returns The ambient scheme; `light` outside a provider.
 */
export function useColorScheme(): ColorScheme {
  return useContext(ColorSchemeContext)
}
