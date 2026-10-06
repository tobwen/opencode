import { createContext, useContext } from "solid-js"

export interface ComposerHint {
  label: string
  shortcut: string
  /** Set when the hint maps to a keymap command, so the footer can run it on click. */
  command?: string
}

export interface ComposerTab {
  id: string
  label: string
  hints?: () => ComposerHint[]
  /** Rendered at the right of the header, opposite the close hint. */
  paneHint?: () => ComposerHint | undefined
}

export const ComposerContext = createContext<{
  register: (tab: ComposerTab) => () => void
  active: (id: string) => boolean
  close: () => void
}>()

export function useComposerTab() {
  const ctx = useContext(ComposerContext)
  if (!ctx) throw new Error("useComposerTab must be used within a Composer")
  return ctx
}
