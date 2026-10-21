"use client"

import { useMutation } from "@tanstack/react-query"
import {
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  FlaskConical,
  RotateCcw,
  Route,
  TriangleAlert,
  XCircle,
} from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CategoryBadge, EscalationBadge, FlagBadge, PriorityBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { LoadingButton } from "@/components/admin/common"
import { useSettings } from "@/components/admin/queries"
import { api, errorMessage } from "@/lib/api"
import { iqd, percent } from "@/lib/format"
import { useLabel } from "@/lib/hooks"
import type { Category, Check, ModelConfig, ModelTestResult, Triage } from "@/lib/types"
import { cn } from "@/lib/utils"

export const SAMPLE_TICKET =
  "السلام عليكم، البارحة حولت 250 ألف دينار لأخوي من المحفظة والمبلغ انخصم من رصيدي بس ما وصله لحد الآن. رقم العملية TRX-48213977. شنو السالفة؟ أريد فلوسي ترجع بأسرع وقت"

const CHECK_LABEL: Record<Check["name"], string> = {
  schema: "Schema",
  grounding: "Grounding",
  confidence: "Confidence",
  single_issue: "Single issue",
}

function CheckRow({ check }: { check: Check }) {
  const Icon = check.passed === null ? CircleMinus : check.passed ? CircleCheck : CircleX
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          check.passed === null ? "text-muted-foreground" : check.passed ? "text-success" : "text-destructive",
        )}
        aria-label={check.passed === null ? "Not applicable" : check.passed ? "Passed" : "Failed"}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{CHECK_LABEL[check.name] ?? check.name}</p>
        {check.detail ? <p className="text-muted-foreground text-xs break-words">{check.detail}</p> : null}
      </div>
      <span className="text-muted-foreground text-xs">{check.passed === null ? "n/a" : check.passed ? "pass" : "fail"}</span>
    </li>
  )
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("text-sm break-words", mono && "font-mono", value === "—" && "text-muted-foreground")}>{value}</dd>
    </div>
  )
}

export function TriageResult({ triage }: { triage: Triage }) {
  const label = useLabel()
  const probs = triage.category_probs
    ? (Object.entries(triage.category_probs) as [Category, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : []
  const f = triage.fields
  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Category</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={triage.category} />
            {triage.secondary_category ? (
              <>
                <span className="text-muted-foreground text-xs">+</span>
                <CategoryBadge category={triage.secondary_category} />
              </>
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Confidence</p>
          <ConfidenceMeter value={triage.confidence} threshold={triage.threshold} size="md" />
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Priority</p>
          <PriorityBadge priority={triage.priority} />
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Decision</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {triage.decision === "routed" ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success gap-1">
                <Route className="size-3" /> Routed
              </Badge>
            ) : (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning gap-1">
                <TriangleAlert className="size-3" /> Escalated
              </Badge>
            )}
            <EscalationBadge reason={triage.escalation_reason} />
          </div>
        </div>
        {probs.length > 1 ? (
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-muted-foreground text-xs">Top alternatives</p>
            <ul className="space-y-1">
              {probs.map(([cat, p]) => (
                <li key={cat} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate">{label("categories", cat)}</span>
                  <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                    <div className="bg-primary/70 h-full rounded-full" style={{ width: `${p * 100}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums">{percent(p, 1)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Extracted fields</p>
          <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            <Field label="Transaction ref" value={f.transaction_ref ?? "—"} mono />
            <Field label="Amount" value={f.amount_iqd !== null ? iqd(f.amount_iqd) : "—"} />
            <Field label="Amount (as written)" value={f.amount_text ? <span dir="auto">{f.amount_text}</span> : "—"} />
            <Field label="Date" value={f.date ?? "—"} />
            <Field label="Date (as written)" value={f.date_text ? <span dir="auto">{f.date_text}</span> : "—"} />
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {triage.flags.length ? (
              triage.flags.map((fl) => <FlagBadge key={fl} flag={fl} />)
            ) : (
              <span className="text-muted-foreground text-xs">No flags</span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Checks</p>
          <ul className="divide-y rounded-lg border px-3">
            {triage.checks.map((c) => (
              <CheckRow key={c.name} check={c} />
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Draft reply</p>
        {triage.draft_reply ? (
          <div dir="rtl" className="bg-muted/40 rounded-lg border p-4 text-[15px] whitespace-pre-wrap">
            {triage.draft_reply}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">The model wrote no draft.</p>
        )}
      </div>

      <p className="text-muted-foreground text-xs tabular-nums">
        {triage.model_name} · <span className="font-mono">{triage.model_id}</span> · prompt {triage.prompt_version}
        {triage.tokens_in !== null ? ` · ${triage.tokens_in} in / ${triage.tokens_out ?? "?"} out tokens` : ""}
      </p>
    </div>
  )
}

export function ModelTestDialog({
  model,
  open,
  onOpenChange,
}: {
  model: ModelConfig | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="text-primary size-5" /> Test {model?.name}
          </DialogTitle>
          <DialogDescription>
            Runs the full pipeline (model call, parsing and code checks) on one ticket. Nothing is saved.
          </DialogDescription>
        </DialogHeader>
        {model ? <TestBody key={model.id} model={model} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function TestBody({ model }: { model: ModelConfig }) {
  const id = useId()
  const { data: settings } = useSettings()
  const [text, setText] = useState(SAMPLE_TICKET)
  const [rawOpen, setRawOpen] = useState(false)

  const test = useMutation({
    mutationFn: () => api.post<ModelTestResult>(`/models/${model.id}/test`, text.trim() ? { text: text.trim() } : {}),
    onError: (err) => toast.error("Test request failed", { description: errorMessage(err) }),
  })
  const r = test.data

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          test.mutate()
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-text`}>Ticket text</Label>
          <Button type="button" variant="ghost" size="xs" onClick={() => setText(SAMPLE_TICKET)} disabled={text === SAMPLE_TICKET}>
            <RotateCcw /> Reset sample
          </Button>
        </div>
        <Textarea
          id={`${id}-text`}
          dir="auto"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          className="text-[15px]"
          placeholder="Leave empty to use the server's built-in sample ticket"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {model.is_cloud ? "Cloud model: only use synthetic text here. " : ""}
            Threshold in use: {settings ? settings.confidence_threshold.toFixed(2) : "…"}
          </p>
          <LoadingButton type="submit" loading={test.isPending} icon={FlaskConical}>
            {test.isPending ? "Running…" : r ? "Run again" : "Run test"}
          </LoadingButton>
        </div>
      </form>

      {r ? (
        <div className="grid gap-4">
          <Alert variant={r.ok ? "default" : "destructive"} className={cn(r.ok && "border-success/30 bg-success/5")}>
            {r.ok ? <CheckCircle2 className="text-success" /> : <XCircle />}
            <AlertTitle className="flex flex-wrap items-center gap-2">
              {r.ok ? "Model responded" : "Test failed"}
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-normal tabular-nums">
                <Clock className="size-3" /> {r.latency_ms.toLocaleString()} ms
              </span>
            </AlertTitle>
            {r.message ? <AlertDescription className="break-words">{r.message}</AlertDescription> : null}
          </Alert>

          {r.triage ? <TriageResult triage={r.triage} /> : null}
          {r.triage?.error ? <p className="text-destructive font-mono text-xs break-words">{r.triage.error}</p> : null}

          <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2">
                <ChevronDown className={cn("size-4 transition-transform", rawOpen && "rotate-180")} />
                {rawOpen ? "Hide" : "Show"} raw JSON
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="bg-muted/50 max-h-80 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
                {r.triage?.raw_output ? prettyJson(r.triage.raw_output) : JSON.stringify(r, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  )
}

function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
