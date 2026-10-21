"use client"

import { AlertCircle, Check, Loader2, PenLine, RotateCw } from "lucide-react"
import dynamic from "next/dynamic"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DRAFT_WORD_LIMIT, sameDraft, useNow, wordCount } from "@/components/tickets/lib"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

function EditorSkeleton() {
  return (
    <div className="space-y-0">
      <div className="bg-muted/60 flex h-10 items-center gap-1.5 border-b px-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="size-6 rounded-md" />
        ))}
      </div>
      <div className="min-h-48 space-y-2.5 px-4 py-4">
        <Skeleton className="ml-auto h-4 w-4/5" />
        <Skeleton className="ml-auto h-4 w-3/5" />
        <Skeleton className="ml-auto h-4 w-2/3" />
      </div>
    </div>
  )
}

// MDXEditor touches `document` on import, so it is loaded on the client only.
const DraftEditorInner = dynamic(() => import("@/components/tickets/draft-editor-inner"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
})

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string }

export interface DraftEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  /** Untouched AI draft, for the "Edited from AI draft" badge. */
  aiDraft?: string
  /** Extracted transaction reference for the "Insert reference" button. */
  transactionRef?: string | null
  /** Change this to replace the editor content with `value` (restore / re-triage). */
  resetKey?: string | number
  saveState?: SaveState
  onRetrySave?: () => void
  className?: string
}

export function DraftEditor({
  value,
  onChange,
  readOnly,
  placeholder = "Write the reply to the customer…",
  aiDraft,
  transactionRef,
  resetKey,
  saveState,
  onRetrySave,
  className,
}: DraftEditorProps) {
  const words = wordCount(value)
  const tooLong = words > DRAFT_WORD_LIMIT
  const edited = aiDraft !== undefined && aiDraft.trim() !== "" && !sameDraft(value, aiDraft)

  return (
    <div
      className={cn(
        "bg-background overflow-hidden rounded-lg border shadow-xs transition-[color,box-shadow]",
        !readOnly && "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        readOnly && "bg-muted/30",
        className,
      )}
    >
      <DraftEditorInner
        key={resetKey}
        markdown={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        transactionRef={transactionRef}
        ariaLabel="Reply draft editor"
      />
      <div className="bg-muted/30 text-muted-foreground flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums",
                tooLong && "text-warning-foreground dark:text-warning font-medium",
              )}
            >
              {tooLong ? <AlertCircle className="size-3.5" /> : null}
              {words} {words === 1 ? "word" : "words"}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            {tooLong
              ? `Longer than ${DRAFT_WORD_LIMIT} words. Short replies are read; try to trim it.`
              : `Keep replies short: ${DRAFT_WORD_LIMIT} words or fewer.`}
          </TooltipContent>
        </Tooltip>
        {edited ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary gap-1 font-normal">
            <PenLine className="size-3" /> Edited from AI draft
          </Badge>
        ) : null}
        <div className="ml-auto">{saveState ? <SaveStatus state={saveState} onRetry={onRetrySave} /> : null}</div>
      </div>
    </div>
  )
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  const now = useNow(5000)
  if (state.status === "idle") return null
  if (state.status === "saving") {
    return (
      <span className="inline-flex items-center gap-1" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (state.status === "saved") {
    const secs = Math.max(0, Math.round((now - state.at) / 1000))
    const ago = secs < 5 ? "just now" : secs < 60 ? `${secs}s ago` : timeAgo(new Date(state.at).toISOString())
    return (
      <span className="text-success inline-flex items-center gap-1" aria-live="polite">
        <Check className="size-3.5" /> Saved · {ago}
      </span>
    )
  }
  return (
    <span className="text-destructive inline-flex items-center gap-1.5" role="alert">
      <AlertCircle className="size-3.5" />
      <span className="max-w-56 truncate" title={state.message}>
        Not saved: {state.message}
      </span>
      {onRetry ? (
        <Button variant="ghost" size="xs" className="text-destructive h-5" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      ) : null}
    </span>
  )
}
