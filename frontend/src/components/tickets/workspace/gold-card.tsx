"use client"

import { CheckCircle2, Medal, MinusCircle, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { iqd } from "@/lib/format"
import { useLabel } from "@/lib/hooks"
import type { ExtractedFields, TicketDetail } from "@/lib/types"

// Gold labels come from an uploaded dataset row (schemas/ticket.schema.json → labels).
interface Gold {
  category?: string | null
  secondary_category?: string | null
  priority?: string | null
  fields?: Partial<ExtractedFields>
  flags?: string[]
  escalate?: boolean
  escalate_reason?: string | null
}

type Cell = { value: string; match: boolean | null }

function Mark({ cell }: { cell: Cell }) {
  const icon =
    cell.match === true ? (
      <CheckCircle2 className="text-success size-4" aria-label="Matches gold" />
    ) : cell.match === false ? (
      <XCircle className="text-destructive size-4" aria-label="Differs from gold" />
    ) : (
      <MinusCircle className="text-muted-foreground size-4" aria-label="Not available" />
    )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex justify-center">
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{cell.value}</TooltipContent>
    </Tooltip>
  )
}

const norm = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v).trim())

export function GoldCard({ ticket }: { ticket: TicketDetail }) {
  const label = useLabel()
  if (!ticket.gold) return null
  const gold = ticket.gold as Gold
  const ai = ticket.triage
  const gf = gold.fields ?? {}

  const cell = (goldValue: unknown, value: unknown, fmt: (v: unknown) => string, available = true): Cell => {
    if (!available) return { value: "No triage yet", match: null }
    return { value: fmt(value), match: norm(goldValue) === norm(value) }
  }
  const text = (v: unknown) => (norm(v) ?? "—")
  const cat = (v: unknown) => label("categories", norm(v))
  const pri = (v: unknown) => label("priorities", norm(v))
  const money = (v: unknown) => (typeof v === "number" ? iqd(v) : "—")

  const rows: { name: string; gold: string; ai: Cell; now: Cell }[] = [
    {
      name: "Category",
      gold: cat(gold.category),
      ai: cell(gold.category, ai?.category, cat, !!ai),
      now: cell(gold.category, ticket.category, cat),
    },
    {
      name: "Priority",
      gold: pri(gold.priority),
      ai: cell(gold.priority, ai?.priority, pri, !!ai),
      now: cell(gold.priority, ticket.priority, pri),
    },
    {
      name: "Reference",
      gold: text(gf.transaction_ref),
      ai: cell(gf.transaction_ref, ai?.fields.transaction_ref, text, !!ai),
      now: cell(gf.transaction_ref, ticket.fields.transaction_ref, text),
    },
    {
      name: "Amount",
      gold: money(gf.amount_iqd),
      ai: cell(gf.amount_iqd, ai?.fields.amount_iqd, money, !!ai),
      now: cell(gf.amount_iqd, ticket.fields.amount_iqd, money),
    },
    {
      name: "Date",
      gold: text(gf.date),
      ai: cell(gf.date, ai?.fields.date, text, !!ai),
      now: cell(gf.date, ticket.fields.date, text),
    },
    {
      name: "Escalate",
      gold: gold.escalate === undefined ? "—" : gold.escalate ? "Yes" : "No",
      ai: ai
        ? {
            value: ai.decision === "escalated" ? "Escalated" : "Routed",
            match: gold.escalate === undefined ? null : gold.escalate === (ai.decision === "escalated"),
          }
        : { value: "No triage yet", match: null },
      now: { value: "Decided by the reviewer", match: null },
    },
  ]

  const aiScore = rows.filter((r) => r.ai.match === true).length
  const aiTotal = rows.filter((r) => r.ai.match !== null).length

  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Medal className="text-warning size-4" /> Gold labels
        </CardTitle>
        <CardDescription>
          From the uploaded dataset row.{" "}
          {aiTotal ? (
            <span className="tabular-nums">
              AI matched {aiScore}/{aiTotal}.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="pb-2 text-left font-medium">Field</th>
              <th className="pb-2 text-left font-medium">Gold</th>
              <th className="w-10 pb-2 text-center font-medium">AI</th>
              <th className="w-10 pb-2 text-center font-medium">Now</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="text-muted-foreground py-1.5 pr-2">{r.name}</td>
                <td className="max-w-0 truncate py-1.5 pr-2 font-medium" title={r.gold}>
                  {r.gold}
                </td>
                <td className="py-1.5 text-center">
                  <Mark cell={r.ai} />
                </td>
                <td className="py-1.5 text-center">
                  <Mark cell={r.now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {gold.escalate_reason ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Gold escalation note: <span dir="auto">{gold.escalate_reason}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
