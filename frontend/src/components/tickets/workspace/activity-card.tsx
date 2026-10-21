"use client"

import {
  AlertTriangle,
  ArrowRight,
  CircleCheckBig,
  Activity as ActivityIcon,
  PenLine,
  RefreshCw,
  RotateCcw,
  Route,
  Tags,
  UserCheck,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import { iqd } from "@/lib/format"
import { useLabel, useTeams } from "@/lib/hooks"
import type { Decision, DecisionAction } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACTION: Record<DecisionAction, { icon: React.ElementType; tone: string; verb: string }> = {
  relabel: { icon: Tags, tone: "bg-primary/10 text-primary", verb: "changed the labels" },
  route: { icon: Route, tone: "bg-chart-5/10 text-chart-5", verb: "routed the ticket" },
  approve: { icon: CircleCheckBig, tone: "bg-success/10 text-success", verb: "approved and sent the reply" },
  escalate: { icon: AlertTriangle, tone: "bg-warning/15 text-warning-foreground dark:text-warning", verb: "sent it back to the agents" },
  close: { icon: XCircle, tone: "bg-muted text-muted-foreground", verb: "closed the ticket" },
  retriage: { icon: RefreshCw, tone: "bg-info/10 text-info", verb: "re-ran triage" },
  assign: { icon: UserCheck, tone: "bg-muted text-foreground", verb: "changed the assignee" },
  reopen: { icon: RotateCcw, tone: "bg-info/10 text-info", verb: "reopened the ticket" },
  draft_saved: { icon: PenLine, tone: "bg-muted text-muted-foreground", verb: "edited the draft" },
}

const FIELD_LABEL: Record<string, string> = {
  category: "Category",
  secondary_category: "Second issue",
  priority: "Priority",
  team_key: "Team",
  status: "Status",
  "fields.transaction_ref": "Reference",
  "fields.amount_iqd": "Amount",
  "fields.amount_text": "Amount text",
  "fields.date": "Date",
  "fields.date_text": "Date text",
  assignee_id: "Assignee",
  assignee_name: "Assignee",
  model_name: "Model",
}

function flatten(obj: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out[`${k}.${k2}`] = v2
    } else out[k] = v
  }
  return out
}

function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const b = flatten(before)
  const a = flatten(after)
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
  return keys
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ key: k, from: b[k], to: a[k] }))
}

function useFormatValue() {
  const label = useLabel()
  const { data: teams } = useTeams()
  return (key: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—"
    if (key === "category" || key === "secondary_category") return label("categories", String(v))
    if (key === "priority") return label("priorities", String(v))
    if (key === "status") return label("statuses", String(v))
    if (key === "team_key") return teams?.find((t) => t.key === v)?.name ?? String(v)
    if (key === "fields.amount_iqd" && typeof v === "number") return iqd(v)
    if (Array.isArray(v)) return v.length ? v.join(", ") : "none"
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
  }
}

function DecisionItem({ d, last }: { d: Decision; last: boolean }) {
  const label = useLabel()
  const fmt = useFormatValue()
  const meta = ACTION[d.action] ?? ACTION.relabel
  const Icon = meta.icon
  const changes = d.action === "relabel" || d.action === "route" || d.action === "retriage" ? diff(d.before, d.after) : []

  let verb = meta.verb
  if (d.action === "assign") {
    const to = d.after?.assignee_name ?? d.after?.assignee_id
    verb = to ? `assigned it to ${String(d.after?.assignee_name ?? "someone")}` : "unassigned the ticket"
  }
  if (d.action === "route") {
    const team = d.after?.team_key
    if (team) verb = `routed it to ${fmt("team_key", team)}`
  }

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last ? <span className="bg-border absolute top-8 bottom-0 left-[0.9375rem] w-px" aria-hidden /> : null}
      <span className={cn("relative z-10 flex size-[1.875rem] shrink-0 items-center justify-center rounded-full", meta.tone)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1 pt-1">
        <p className="text-sm leading-snug">
          <span className="font-medium">{d.user_name || "System"}</span>
          {d.user_role ? <span className="text-muted-foreground text-xs"> · {label("roles", d.user_role)}</span> : null}{" "}
          <span className="text-muted-foreground">{verb}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <TimeAgo value={d.created_at} />
          {d.action === "approve" && d.draft_edited !== null ? (
            <Badge
              variant="outline"
              className={cn("h-5 text-[10px] font-normal", d.draft_edited ? "border-primary/30 text-primary" : "text-muted-foreground")}
            >
              {d.draft_edited ? "draft edited" : "AI draft unedited"}
            </Badge>
          ) : null}
        </div>
        {changes.length ? (
          <ul className="bg-muted/40 space-y-0.5 rounded-md border px-2.5 py-1.5 text-xs">
            {changes.slice(0, 6).map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">{FIELD_LABEL[c.key] ?? c.key}:</span>
                <span className="line-through decoration-1 opacity-70" dir="auto">
                  {fmt(c.key, c.from)}
                </span>
                <ArrowRight className="text-muted-foreground size-3" />
                <span className="font-medium" dir="auto">
                  {fmt(c.key, c.to)}
                </span>
              </li>
            ))}
            {changes.length > 6 ? <li className="text-muted-foreground">+{changes.length - 6} more</li> : null}
          </ul>
        ) : null}
        {d.note ? (
          <p dir="auto" className="border-border text-foreground/80 border-l-2 pl-2 text-xs italic">
            {d.note}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function ActivityCard({ decisions }: { decisions: Decision[] }) {
  const [all, setAll] = useState(false)
  const LIMIT = 8
  const shown = all ? decisions : decisions.slice(0, LIMIT)
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="text-muted-foreground size-4" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        {decisions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No one has acted on this ticket yet.</p>
        ) : (
          <>
            <ol>
              {shown.map((d, i) => (
                <DecisionItem key={d.id} d={d} last={i === shown.length - 1} />
              ))}
            </ol>
            {decisions.length > LIMIT ? (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setAll((v) => !v)}>
                {all ? "Show less" : `Show all ${decisions.length} events`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
