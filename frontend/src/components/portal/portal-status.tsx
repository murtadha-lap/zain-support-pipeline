"use client"

import { Check, CheckCircle2, CircleSlash, Clock, Inbox, SearchCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { TicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export type PortalStage = "received" | "review" | "answered" | "closed"

export function portalStage(status: TicketStatus): PortalStage {
  if (status === "new" || status === "processing") return "received"
  if (status === "routed" || status === "escalated") return "review"
  if (status === "resolved") return "answered"
  return "closed"
}

export const STAGE: Record<PortalStage, { label: string; label_ar: string; className: string; icon: React.ElementType }> = {
  received: { label: "Received", label_ar: "تم الاستلام", className: "bg-info/10 text-info border-info/25", icon: Inbox },
  review: {
    label: "In review",
    label_ar: "قيد المراجعة",
    className: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
    icon: Clock,
  },
  answered: { label: "Answered", label_ar: "تم الرد", className: "bg-success/10 text-success border-success/25", icon: CheckCircle2 },
  closed: { label: "Closed", label_ar: "مغلق", className: "bg-muted text-muted-foreground border-border", icon: CircleSlash },
}

export function PortalStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const s = STAGE[portalStage(status)]
  const Icon = s.icon
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", s.className, className)}>
      <Icon className="size-3" />
      {s.label}
    </Badge>
  )
}

const STEPS: { key: Exclude<PortalStage, "closed">; icon: React.ElementType; hint: string }[] = [
  { key: "received", icon: Inbox, hint: "We have your message" },
  { key: "review", icon: SearchCheck, hint: "A specialist is looking at it" },
  { key: "answered", icon: CheckCircle2, hint: "Our reply is below" },
]

export function StatusStepper({ status }: { status: TicketStatus }) {
  const stage = portalStage(status)
  if (stage === "closed") {
    return (
      <div className="bg-muted/50 text-muted-foreground flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
        <CircleSlash className="size-4 shrink-0" />
        This request is closed. Write a message below if you still need help and we&apos;ll reopen it.
      </div>
    )
  }
  const current = STEPS.findIndex((s) => s.key === stage)
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Request progress">
      {STEPS.map((s, i) => {
        const done = i < current || (i === current && stage === "answered")
        const active = i === current
        const Icon = done ? Check : s.icon
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-2 text-center" aria-current={active ? "step" : undefined}>
            {i > 0 ? (
              <span
                className={cn(
                  "absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2",
                  i <= current ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full border-2 transition-colors",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary bg-background text-primary ring-primary/15 ring-4"
                    : "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="space-y-0.5">
              <p className={cn("text-sm font-medium", !active && !done && "text-muted-foreground")}>{STAGE[s.key].label}</p>
              <p className="text-muted-foreground hidden text-xs sm:block">{active ? s.hint : <span dir="rtl">{STAGE[s.key].label_ar}</span>}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// "Seen" marker per ticket, so the list can show a dot when a reply is new.
// Per-browser convenience only; failures are ignored.
const seenKey = (id: number) => `zsp-portal-seen-${id}`

export function markSeen(id: number, updatedAt: string) {
  try {
    window.localStorage.setItem(seenKey(id), updatedAt)
  } catch {
    // storage unavailable
  }
}

export function getSeen(id: number): string | null {
  try {
    return window.localStorage.getItem(seenKey(id))
  } catch {
    return null
  }
}
