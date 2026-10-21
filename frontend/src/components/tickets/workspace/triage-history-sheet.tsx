"use client"

import { History } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { CategoryBadge, FlagBadge, PriorityBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { EmptyState } from "@/components/shared/page"
import { CopyButton, TimeAgo } from "@/components/tickets/ticket-bits"
import { ChecksList, DecisionPill, ProviderBadge } from "@/components/tickets/workspace/triage-card"
import { Markdown } from "@/components/tickets/markdown"
import { dateTime, iqd } from "@/lib/format"
import { useLabel } from "@/lib/hooks"
import type { Triage } from "@/lib/types"

function pretty(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function TriageHistorySheet({
  open,
  onOpenChange,
  history,
  showRaw,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: Triage[]
  showRaw: boolean
}) {
  const label = useLabel()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Triage history</SheetTitle>
          <SheetDescription>
            Every model run on this ticket, newest first. {history.length} {history.length === 1 ? "run" : "runs"}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {history.length === 0 ? (
            <EmptyState icon={History} title="No triage runs yet" description="Runs appear here once the model has seen the ticket." />
          ) : (
            <Accordion type="single" collapsible defaultValue={String(history[0].id)} className="space-y-2">
              {history.map((t, i) => (
                <AccordionItem key={t.id} value={String(t.id)} className="bg-card rounded-lg border px-4 last:border-b">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.model_name}</span>
                        {i === 0 ? (
                          <Badge variant="secondary" className="h-5 text-[10px]">
                            Latest
                          </Badge>
                        ) : null}
                        <DecisionPill triage={t} />
                      </div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs font-normal">
                        <TimeAgo value={t.created_at} />
                        <CategoryBadge category={t.category} />
                        <ConfidenceMeter value={t.confidence} threshold={t.threshold} />
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <div className="divide-y">
                      <Row label="Model">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs">{t.model_id}</span>
                          <ProviderBadge provider={t.provider} />
                        </span>
                      </Row>
                      <Row label="Prompt">
                        <span className="font-mono text-xs">{t.prompt_version}</span>
                      </Row>
                      <Row label="Ran at">{dateTime(t.created_at)}</Row>
                      <Row label="Latency">
                        <span className="tabular-nums">
                          {t.latency_ms.toLocaleString()} ms
                          {t.tokens_in !== null ? ` · ${t.tokens_in} in / ${t.tokens_out ?? "—"} out tokens` : ""}
                        </span>
                      </Row>
                      <Row label="Priority">
                        <PriorityBadge priority={t.priority} />
                      </Row>
                      {t.secondary_category ? (
                        <Row label="Second issue">
                          <CategoryBadge category={t.secondary_category} />
                        </Row>
                      ) : null}
                      {t.escalation_reason ? <Row label="Escalation">{label("escalation_reasons", t.escalation_reason)}</Row> : null}
                      <Row label="Fields">
                        <span className="text-xs">
                          <span className="font-mono">{t.fields.transaction_ref ?? "no ref"}</span> ·{" "}
                          <span className="tabular-nums">{iqd(t.fields.amount_iqd)}</span> · {t.fields.date ?? "no date"}
                        </span>
                      </Row>
                      <Row label="Flags">
                        {t.flags.length ? (
                          <div className="flex flex-wrap gap-1">
                            {t.flags.map((f) => (
                              <FlagBadge key={f} flag={f} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </Row>
                    </div>

                    {t.error ? (
                      <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs break-words">
                        {t.error}
                      </p>
                    ) : null}

                    <div>
                      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Checks</p>
                      <ChecksList checks={t.checks} />
                    </div>

                    {t.draft_reply ? (
                      <div>
                        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Draft reply</p>
                        <div className="bg-muted/40 rounded-lg border px-3 py-2">
                          <Markdown>{t.draft_reply}</Markdown>
                        </div>
                      </div>
                    ) : null}

                    {showRaw ? (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Raw model output</p>
                          {t.raw_output ? <CopyButton text={t.raw_output} label="Copy raw output" /> : null}
                        </div>
                        {t.raw_output ? (
                          <pre className="bg-muted/60 scrollbar-thin max-h-72 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all" dir="ltr">
                            {pretty(t.raw_output)}
                          </pre>
                        ) : (
                          <p className="text-muted-foreground text-sm">No raw output stored.</p>
                        )}
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
