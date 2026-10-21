"use client"

import "@mdxeditor/editor/style.css"
import {
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
  CreateLink,
  headingsPlugin,
  insertMarkdown$,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  usePublisher,
} from "@mdxeditor/editor"
import { Hash } from "lucide-react"
import { useTheme } from "next-themes"
import { createContext, useContext, useMemo } from "react"
import { cn } from "@/lib/utils"

export interface DraftEditorInnerProps {
  markdown: string
  onChange: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  transactionRef?: string | null
  ariaLabel?: string
}

// The toolbar is created once when the editor mounts; a context keeps the
// "Insert reference" button in sync when the extracted reference changes later.
const RefContext = createContext<string | null | undefined>(null)

function InsertReferenceButton() {
  const ref = useContext(RefContext)
  const insertMarkdown = usePublisher(insertMarkdown$)
  return (
    <ButtonWithTooltip
      title={ref ? `Insert reference ${ref}` : "No transaction reference was extracted"}
      disabled={!ref}
      onClick={() => {
        if (ref) insertMarkdown(` ${ref} `)
      }}
      className="zsp-ref-button"
    >
      <Hash className="size-4" />
      <span className="text-xs font-medium">Insert reference</span>
    </ButtonWithTooltip>
  )
}

// MDXEditor variables mapped onto the app's theme tokens, so the toolbar, the
// link popover and the content follow light/dark mode. Two classes beat the
// library's single hashed class, so these win without !important.
const THEME_CSS = `
.zsp-editor.mdxeditor, .zsp-editor.mdxeditor-popup-container {
  --basePageBg: var(--popover);
  --baseBase: var(--background);
  --baseBgSubtle: var(--muted);
  --baseBg: var(--muted);
  --baseBgHover: var(--accent);
  --baseBgActive: color-mix(in oklch, var(--primary) 18%, transparent);
  --baseLine: var(--border);
  --baseBorder: var(--border);
  --baseBorderHover: var(--ring);
  --baseSolid: var(--muted-foreground);
  --baseSolidHover: var(--foreground);
  --baseText: var(--muted-foreground);
  --baseTextContrast: var(--foreground);
  --accentBase: color-mix(in oklch, var(--primary) 4%, transparent);
  --accentBgSubtle: color-mix(in oklch, var(--primary) 8%, transparent);
  --accentBg: color-mix(in oklch, var(--primary) 12%, transparent);
  --accentBgHover: color-mix(in oklch, var(--primary) 18%, transparent);
  --accentBgActive: color-mix(in oklch, var(--primary) 24%, transparent);
  --accentLine: color-mix(in oklch, var(--primary) 30%, transparent);
  --accentBorder: color-mix(in oklch, var(--primary) 45%, transparent);
  --accentBorderHover: var(--primary);
  --accentSolid: var(--primary);
  --accentSolidHover: color-mix(in oklch, var(--primary) 88%, black);
  --accentText: var(--primary);
  --accentTextContrast: var(--foreground);
  --font-body: var(--font-sans);
  color: var(--foreground);
}
.zsp-editor.mdxeditor-popup-container { z-index: 60; }
.zsp-editor .mdxeditor-toolbar {
  direction: ltr;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 70%, transparent);
  padding: 0.25rem 0.375rem;
}
.zsp-editor .mdxeditor-toolbar svg { color: var(--foreground); }
.zsp-editor .zsp-ref-button { width: auto; gap: 0.25rem; padding-inline: 0.5rem; color: var(--foreground); }
.zsp-editor .zsp-ref-button:disabled { opacity: 0.45; }
.zsp-editor .zsp-editor-content {
  padding: 0.75rem 1rem;
  min-height: 12rem;
  color: var(--foreground);
}
/* Lexical gives every top-level block dir="auto" (first strong character decides).
   text-align:start then right-aligns Arabic paragraphs and left-aligns English ones;
   plaintext bidi covers blocks rendered before Lexical reconciles them. */
.zsp-editor .zsp-editor-content > * { text-align: start; unicode-bidi: plaintext; }
.zsp-editor .zsp-editor-content a { color: var(--primary); }
`

export default function DraftEditorInner({
  markdown,
  onChange,
  readOnly,
  placeholder,
  transactionRef,
  ariaLabel,
}: DraftEditorInnerProps) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  // Plugins are read once on mount; memo keeps the array stable across renders.
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: "zsp-toolbar",
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle options={["bullet", "number"]} />
            <Separator />
            <CreateLink />
            <Separator />
            <InsertReferenceButton />
          </>
        ),
      }),
    ],
    [],
  )

  return (
    <RefContext.Provider value={transactionRef}>
      <style>{THEME_CSS}</style>
      <div aria-label={ariaLabel}>
        <MDXEditor
          markdown={markdown}
          onChange={(md, initialNormalize) => {
            // The first call only normalises the incoming markdown; it is not an edit.
            if (!initialNormalize) onChange(md)
          }}
          readOnly={readOnly}
          placeholder={placeholder}
          plugins={plugins}
          className={cn("zsp-editor", dark && "dark-theme")}
          contentEditableClassName="zsp-editor-content prose dark:prose-invert max-w-none font-arabic min-h-48 px-4 py-3"
        />
      </div>
    </RefContext.Provider>
  )
}
