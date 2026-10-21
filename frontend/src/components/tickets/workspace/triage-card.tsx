"use client"

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Loader2,
  MinusCircle,
  Route,
  Sparkles,
  XCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CATEGORY_COLOR, CategoryBadge, FlagBadge, PriorityBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { isTriaging } from "@/components/tickets/lib"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import { iqd, percent } from "@/lib/format"
import { useLabel, useMeta } from "@/lib/hooks"
import type { Category, Check, CheckName, Triage, TicketDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

export const CHECK_LABEL: Record<CheckName, string> = {
  schema: "Schema",
  grounding: "Grounding",
  confidence: "Confidence",
  single_issue: "Single issue",
}

export function DecisionPill({ triage }: { triage: Pick<Triage, "decision" | "escalation_reason"> }) {
  const label = useLabel()
  if (triage.decision === "routed") {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success gap-1">
        <Route className="size-3" /> Routed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning gap-1">
      <AlertTriangle className="size-3" /> Escalated
      {triage.escalation_reason ? <span className="font-normal">· {label("escalation_reasons", triage.escalation_reason)}</span> : null}
    </Badge>
  )
}

export function ProviderBadge({ provider }: { provider: Triage["provider"] }) {
  const { data: meta } = useMeta()
  const opt = meta?.providers.find((p) => p.key === provider)
  const cloud = opt?.is_cloud ?? (provider === "anthropic" || provider === "openai_compatible")
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", cloud ? "border-info/30 text-info" : "text-muted-foreground")}>
      {cloud ? <Cloud className="size-3" /> : <Cpu className="size-3" />}
      {opt?.label ?? provider}
    </Badge>
  )
}

export function CheckIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Passed" />
  if (passed === false) return <XCircle className="text-destructive size-4 shrink-0" aria-label="Failed" />
  return <MinusCircle className="text-muted-foreground size-4 shrink-0" aria-label="Not applicable" />
}

export function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="text-muted-foreground text-sm">No checks recorded.</p>
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-2 text-sm">
          <CheckIcon passed={c.passed} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-tight font-medium">
              {CHECK_LABEL[c.name] ?? c.name}
              <span
                className={cn(
                  "text-xs font-normal",
                  c.passed === true ? "text-success" : c.passed === false ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {c.passed === true ? "pass" : c.passed === false ? "fail" : "n/a"}
              </span>
            </div>
            {c.detail ? <p className="text-muted-foreground text-xs break-words">{c.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{children}</p>
}

function ExtractedRow({
  label,
  value,
  span,
  text,
  mono,
}: {
  label: string
  value: React.ReactNode | null
  span: string | null
  text: string
  mono?: boolean
}) {
  const present = value !== null && value !== undefined && value !== ""
  const grounded = span ? text.includes(span) : false
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {present ? (
        <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
          <span className={cn("inline-flex items-center gap-1.5 font-medium", mono && "font-mono text-xs")}>
            {value}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  {grounded ? (
                    <CheckCircle2 className="text-success size-3.5" aria-label="Found in the text" />
                  ) : (
                    <AlertTriangle className="text-warning size-3.5" aria-label="Not found in the text" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{grounded ? "The span is in the customer's text" : "The span is not in the customer's text"}</TooltipContent>
            </Tooltip>
          </span>
          {span && span !== value ? (
            <span dir="rtl" className="font-arabic text-muted-foreground text-xs">
              “{span}”
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-muted-foreground/70 text-sm italic">Not found</span>
      )}
    </div>
  )
}

function CategoryProbs({ probs, chosen }: { probs: Partial<Record<Category, number>>; chosen: Category | null }) {
  const label = useLabel()
  const top = Object.entries(probs)
    .filter((e): e is [Category, number] => typeof e[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  if (!top.length) return null
  return (
    <ul className="space-y-1.5" aria-label="Top category alternatives">
      {top.map(([cat, p]) => (
        <li key={cat} className="grid grid-cols-[1fr_5rem_2.75rem] items-center gap-2 text-xs">
          <span className={cn("truncate", cat === chosen ? "font-medium" : "text-muted-foreground")}>{label("categories", cat)}</span>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, p * 100)}%`, background: CATEGORY_COLOR[cat] }} />
          </div>
          <span className="text-right tabular-nums">{percent(p, p < 0.1 ? 1 : 0)}</span>
        </li>
      ))}
    </ul>
  )
}

export function TriageCard({ ticket }: { ticket: TicketDetail }) {
  const triage = ticket.triage

  if (!triage) {
    const waiting = isTriaging(ticket.status)
    return (
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary size-4" /> AI triage
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
              {waiting ? <Loader2 className="size-5 animate-spin" /> : <Bot className="size-5" />}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{waiting ? "Waiting for triage" : "Not triaged"}</p>
              <p className="text-muted-foreground text-xs">
                {waiting
                  ? ticket.status === "processing"
                    ? "The model is reading the ticket. This page updates by itself."
                    : "The ticket is queued for the model."
                  : "No model has looked at this ticket. Use “Re-run triage” in the action bar."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const f = triage.fields
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-primary size-4" /> AI triage
        </CardTitle>
        <CardAction>
          <DecisionPill triage={triage} />
        </CardAction>
        <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-sm font-medium">{triage.model_name}</span>
          <ProviderBadge provider={triage.provider} />
          <Badge variant="secondary" className="font-mono text-[10px] font-normal">
            {triage.prompt_version}
          </Badge>
          <span className="text-muted-foreground text-xs tabular-nums">
            {triage.latency_ms.toLocaleString()} ms
            {triage.tokens_in !== null && triage.tokens_out !== null ? ` · ${triage.tokens_in}→${triage.tokens_out} tok` : ""}
          </span>
          <span className="text-muted-foreground text-xs">
            · <TimeAgo value={triage.created_at} />
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5">
        {triage.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Model error</AlertTitle>
            <AlertDescription className="break-words">{triage.error}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <SectionLabel>Confidence</SectionLabel>
          <div className="flex items-end justify-between gap-3">
            <span
              className={cn(
                "text-3xl font-semibold tracking-tight tabular-nums",
                triage.confidence === null
                  ? "text-muted-foreground"
                  : triage.confidence >= triage.threshold
                    ? "text-success"
                    : "text-warning-foreground dark:text-warning",
              )}
            >
              {triage.confidence === null ? "n/a" : percent(triage.confidence, 1)}
            </span>
            <span className="text-muted-foreground pb-1 text-xs tabular-nums">threshold {percent(triage.threshold)}</span>
          </div>
          <ConfidenceMeter value={triage.confidence} threshold={triage.threshold} size="md" showLabel={false} className="mt-2" />
          {triage.confidence === null ? (
            <p className="text-muted-foreground mt-1 text-xs">This model gives no token log-probabilities.</p>
          ) : null}
          {triage.category_probs ? (
            <div className="mt-3">
              <CategoryProbs probs={triage.category_probs} chosen={triage.category} />
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <SectionLabel>Category</SectionLabel>
            <CategoryBadge category={triage.category} />
            {triage.secondary_category ? (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-muted-foreground">+ second issue</span>
                <CategoryBadge category={triage.secondary_category} />
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Priority</SectionLabel>
            <PriorityBadge priority={triage.priority} />
          </div>
        </div>

        <div>
          <SectionLabel>Extracted</SectionLabel>
          <div className="divide-y">
            <ExtractedRow label="Reference" value={f.transaction_ref} span={f.transaction_ref} text={ticket.text} mono />
            <ExtractedRow
              label="Amount"
              value={f.amount_iqd !== null ? <span className="tabular-nums">{iqd(f.amount_iqd)}</span> : f.amount_text}
              span={f.amount_text}
              text={ticket.text}
            />
            <ExtractedRow label="Date" value={f.date ?? f.date_text} span={f.date_text} text={ticket.text} />
          </div>
        </div>

        <div>
          <SectionLabel>Flags</SectionLabel>
          {triage.flags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {triage.flags.map((fl) => (
                <FlagBadge key={fl} flag={fl} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No flags</p>
          )}
        </div>

        <div>
          <SectionLabel>Checks</SectionLabel>
          <ChecksList checks={triage.checks} />
        </div>
      </CardContent>
    </Card>
  )
}
