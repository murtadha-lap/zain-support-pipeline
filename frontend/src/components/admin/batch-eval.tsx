"use client"

import { ArrowRight, Award, FileSearch, GitCompareArrows, ShieldAlert, Target, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CategoryBadge } from "@/components/shared/badges"
import { InfoTip, StatCard } from "@/components/admin/common"
import { useMeta } from "@/lib/hooks"
import { percent } from "@/lib/format"
import type { Batch, BatchEval } from "@/lib/types"
import { cn } from "@/lib/utils"

const F1_TARGET = 0.8

export function EscalationReasons({ batch }: { batch: Batch }) {
  const { data: meta } = useMeta()
  const entries = Object.entries(batch.escalation_reasons)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (!entries.length) {
    return (
      <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm">
        <ShieldAlert className="size-5" />
        {batch.processed ? "No ticket in this batch was escalated." : "Nothing processed yet."}
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {entries.map(([key, n]) => {
        const opt = meta?.escalation_reasons.find((r) => r.key === key)
        const pct = total ? n / total : 0
        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1 font-medium">
                {opt?.label ?? key.replace(/_/g, " ")}
                {opt?.description ? <InfoTip label={`About ${opt.label}`}>{opt.description}</InfoTip> : null}
              </span>
              <span className="text-muted-foreground tabular-nums">
                <span className="text-foreground font-medium">{n.toLocaleString()}</span> · {percent(pct)}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className="bg-warning h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function fmt(n: number) {
  return n.toFixed(2)
}

export function EvalSection({ ev }: { ev: BatchEval }) {
  const maxConf = Math.max(1, ...ev.confusions.map((c) => c.count))
  const { data: meta } = useMeta()
  const order = meta?.categories.map((c) => c.key) ?? []
  const perCategory = [...ev.per_category].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
  const weak = perCategory.filter((c) => c.support > 0 && c.f1 < F1_TARGET).length

  return (
    <section className="space-y-4" aria-labelledby="eval-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="eval-heading" className="text-lg font-semibold tracking-tight">
            Evaluation vs gold labels
          </h2>
          <p className="text-muted-foreground text-sm">
            Computed on <span className="tabular-nums">{ev.n.toLocaleString()}</span> tickets that carry gold labels from the uploaded dataset.
          </p>
        </div>
        {weak ? (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
            {weak} categor{weak === 1 ? "y" : "ies"} below F1 {F1_TARGET}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            All categories at F1 ≥ {F1_TARGET}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Target} label="Category accuracy" tone="primary" value={percent(ev.category_accuracy, 1)} info="Share of tickets where the predicted primary category equals the gold category." />
        <StatCard icon={Award} label="Macro F1" tone="info" value={fmt(ev.macro_f1)} info="Unweighted mean of per-category F1, so rare categories count as much as common ones." />
        <StatCard icon={FileSearch} label="Field exact" tone="success" value={percent(ev.field_exact, 1)} info="Share of tickets where every extracted field (reference, amount, date) matches gold exactly." />
        <StatCard
          icon={ShieldAlert}
          label="Invented references"
          tone={ev.invented_refs > 0 ? "destructive" : "success"}
          value={ev.invented_refs.toLocaleString()}
          valueClassName={ev.invented_refs > 0 ? "text-destructive" : "text-success"}
          className={ev.invented_refs > 0 ? "border-destructive/40 bg-destructive/5" : undefined}
          helper={ev.invented_refs > 0 ? "Target is 0. The model produced references that are not in the text." : "On target: no invented references."}
          info="Transaction references the model returned that do not appear in the ticket text. The grounding check nulls them, but the target is 0."
        />
        <StatCard icon={Users} label="Escalation agreement" tone="warning" value={percent(ev.escalation_agreement, 1)} info="Share of tickets where the pipeline's escalate/route decision matches the gold escalate label." />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="gap-4 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Per category</CardTitle>
            <CardDescription>F1 below {F1_TARGET} is highlighted.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Category</TableHead>
                    <TableHead className="text-right">Precision</TableHead>
                    <TableHead className="text-right">Recall</TableHead>
                    <TableHead className="text-right">F1</TableHead>
                    <TableHead className="pr-6 text-right">Support</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perCategory.map((c) => {
                    const low = c.support > 0 && c.f1 < F1_TARGET
                    return (
                      <TableRow key={c.category} className={cn(low && "bg-destructive/5 hover:bg-destructive/10")}>
                        <TableCell className="pl-6">
                          <CategoryBadge category={c.category} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.precision)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.recall)}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", low ? "text-destructive" : "text-foreground")}>
                          {fmt(c.f1)}
                        </TableCell>
                        <TableCell className="text-muted-foreground pr-6 text-right tabular-nums">{c.support.toLocaleString()}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitCompareArrows className="text-muted-foreground size-4" /> Top confusions
            </CardTitle>
            <CardDescription>Gold category → what the model predicted</CardDescription>
          </CardHeader>
          <CardContent>
            {ev.confusions.length ? (
              <ol className="space-y-3">
                {ev.confusions.map((c, i) => (
                  <li key={`${c.gold}-${c.predicted}`} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4 text-xs tabular-nums">{i + 1}</span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <CategoryBadge category={c.gold} />
                        <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-label="predicted as" />
                        <CategoryBadge category={c.predicted} />
                      </div>
                      <span className="text-sm font-medium tabular-nums">{c.count.toLocaleString()}</span>
                    </div>
                    <div className="bg-muted ml-6 h-1 overflow-hidden rounded-full">
                      <div className="bg-destructive/70 h-full rounded-full" style={{ width: `${(c.count / maxConf) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">No confusions: every category was predicted correctly.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
