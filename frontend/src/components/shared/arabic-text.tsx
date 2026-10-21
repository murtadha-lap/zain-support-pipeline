"use client"

import { Fragment } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isArabic } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface Highlight {
  text: string | null | undefined
  label: string
}

interface Props {
  text: string
  highlights?: Highlight[]
  className?: string
}

// Customer text: right-to-left when it is mostly Arabic, with the spans the model
// extracted (reference, amount, date) marked so the reviewer sees they are grounded.
export function ArabicText({ text, highlights = [], className }: Props) {
  const dir = isArabic(text) ? "rtl" : "ltr"
  const spans = highlights
    .filter((h): h is { text: string; label: string } => Boolean(h.text) && text.includes(h.text as string))
    .map((h) => ({ ...h, start: text.indexOf(h.text) }))
    .sort((a, b) => a.start - b.start)

  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue // overlapping span, keep the first
    if (s.start > cursor) parts.push(text.slice(cursor, s.start))
    parts.push(
      <Tooltip key={`${s.label}-${s.start}`}>
        <TooltipTrigger asChild>
          <mark className="grounded cursor-help">{s.text}</mark>
        </TooltipTrigger>
        <TooltipContent>{s.label} · found in the text</TooltipContent>
      </Tooltip>,
    )
    cursor = s.start + s.text.length
  }
  parts.push(text.slice(cursor))

  return (
    <p dir={dir} className={cn("text-[15px] leading-relaxed whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </p>
  )
}
