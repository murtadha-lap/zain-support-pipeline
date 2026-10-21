"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bot, CloudAlert, FileCode2, Gauge, Minus, Plus, ShieldCheck, Zap } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/shared/page"
import { QueryError, SaveBar } from "@/components/admin/common"
import { useSettings } from "@/components/admin/queries"
import { api, errorMessage } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { Settings } from "@/lib/types"
import { cn } from "@/lib/utils"

const MIN_T = 0.5
const MAX_T = 0.99
const round2 = (v: number) => Math.round(v * 100) / 100
const clampT = (v: number) => Math.min(MAX_T, Math.max(MIN_T, round2(v)))

type BoolKey = "auto_triage" | "escalate_without_confidence" | "allow_cloud_for_live_tickets"

const AUTOMATION: { key: BoolKey; title: string; description: string; icon: React.ElementType }[] = [
  {
    key: "auto_triage",
    title: "Auto-triage new tickets",
    description: "Triage customer tickets as soon as they arrive, with the default model. Off: tickets wait as New until a batch runs.",
    icon: Bot,
  },
  {
    key: "escalate_without_confidence",
    title: "Escalate without confidence",
    description: "When a model returns no logprobs (no confidence score), send the ticket to a human agent instead of routing it.",
    icon: ShieldCheck,
  },
  {
    key: "allow_cloud_for_live_tickets",
    title: "Allow cloud for live tickets",
    description: "Let cloud models process real customer tickets. Off: cloud models only run on uploaded synthetic tickets.",
    icon: CloudAlert,
  },
]

function validate(v: Settings) {
  const errors: Partial<Record<keyof Settings, string>> = {}
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(v.prompt_version)) errors.prompt_version = "Letters, digits, dot, dash and underscore only"
  if (!Number.isInteger(v.max_retries) || v.max_retries < 0 || v.max_retries > 3) errors.max_retries = "Whole number from 0 to 3"
  if (!Number.isInteger(v.batch_concurrency) || v.batch_concurrency < 1 || v.batch_concurrency > 64)
    errors.batch_concurrency = "Whole number from 1 to 64"
  return errors
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="gap-4">
          <CardHeader>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const ids = useId()
  const qc = useQueryClient()
  const settings = useSettings()
  const [draft, setDraft] = useState<Partial<Settings>>({})
  const [confirmCloud, setConfirmCloud] = useState(false)

  const server = settings.data
  const values: Settings | null = server ? { ...server, ...draft } : null
  const changed = server
    ? (Object.keys(draft) as (keyof Settings)[]).filter((k) => !Object.is(draft[k], server[k]))
    : []
  const errors = values ? validate(values) : {}
  const invalid = Object.keys(errors).length > 0

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(changed.map((k) => [k, values![k]])) as Partial<Settings>
      return api.put<Settings>("/settings", body)
    },
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data)
      setDraft({})
      qc.invalidateQueries({ queryKey: qk.settings })
      qc.invalidateQueries({ queryKey: qk.overview })
      toast.success("Settings saved", { description: "New triages use them right away." })
    },
    onError: (err) => toast.error("Couldn't save settings", { description: errorMessage(err) }),
  })

  const toggle = (key: BoolKey, on: boolean) => {
    if (key === "allow_cloud_for_live_tickets" && on) setConfirmCloud(true)
    else set(key, on)
  }

  const numberInput = (raw: string) => (raw.trim() === "" ? Number.NaN : Number(raw))

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Pipeline behaviour: when a ticket goes to a human, which prompt runs, and how fast batches go." />

      {settings.isError ? (
        <QueryError error={settings.error} onRetry={() => settings.refetch()} title="Couldn't load settings" />
      ) : !values || !server ? (
        <SettingsSkeleton />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Threshold */}
            <Card className="gap-5 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="text-muted-foreground size-4" /> Confidence threshold
                </CardTitle>
                <CardDescription>
                  Tickets whose category confidence is below this value fail the confidence check and go to a human agent. Choose it on
                  the validation split, where it gives the error rate you accept for auto-routed tickets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">
                      {values.confidence_threshold.toFixed(2)}
                    </span>
                    {changed.includes("confidence_threshold") ? (
                      <Badge variant="outline" className="text-muted-foreground font-normal tabular-nums">
                        saved {server.confidence_threshold.toFixed(2)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Decrease threshold by 0.01"
                          disabled={values.confidence_threshold <= MIN_T}
                          onClick={() => set("confidence_threshold", clampT(values.confidence_threshold - 0.01))}
                        >
                          <Minus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>−0.01</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Increase threshold by 0.01"
                          disabled={values.confidence_threshold >= MAX_T}
                          onClick={() => set("confidence_threshold", clampT(values.confidence_threshold + 0.01))}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>+0.01</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-2">
                  <Slider
                    min={MIN_T}
                    max={MAX_T}
                    step={0.01}
                    value={[values.confidence_threshold]}
                    onValueChange={([v]) => set("confidence_threshold", clampT(v))}
                    aria-label="Confidence threshold"
                  />
                  <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
                    <span>0.50 · more auto-routing</span>
                    <span>0.75</span>
                    <span>0.99 · more human review</span>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Raising it sends more tickets to people and fewer mistakes to team queues. The{" "}
                  <Link href="/app/admin" className="text-foreground underline underline-offset-2">
                    dashboard
                  </Link>{" "}
                  shows the confidence distribution against this line. Models without logprobs are not affected.
                </p>
              </CardContent>
            </Card>

            {/* Prompt */}
            <Card className="gap-5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode2 className="text-muted-foreground size-4" /> Prompt version
                </CardTitle>
                <CardDescription>The system prompt file used for every triage. Each triage records the version it ran with.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor={`${ids}-prompt`}>Version</Label>
                <Input
                  id={`${ids}-prompt`}
                  value={values.prompt_version}
                  onChange={(e) => set("prompt_version", e.target.value.trim())}
                  className="font-mono"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.prompt_version)}
                  aria-describedby={`${ids}-prompt-help`}
                />
                <p id={`${ids}-prompt-help`} className={cn("text-xs", errors.prompt_version ? "text-destructive" : "text-muted-foreground")}>
                  {errors.prompt_version ?? (
                    <>
                      Loads <code className="font-mono">backend/app/prompts/{values.prompt_version || "…"}.md</code>
                    </>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Throughput */}
            <Card className="gap-5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="text-muted-foreground size-4" /> Throughput
                </CardTitle>
                <CardDescription>Retries on invalid model output and parallel model calls per batch.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-retries`}>Max retries</Label>
                  <Input
                    id={`${ids}-retries`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={3}
                    step={1}
                    className="tabular-nums"
                    value={Number.isNaN(values.max_retries) ? "" : values.max_retries}
                    onChange={(e) => set("max_retries", numberInput(e.target.value))}
                    aria-invalid={Boolean(errors.max_retries)}
                  />
                  <p className={cn("text-xs", errors.max_retries ? "text-destructive" : "text-muted-foreground")}>
                    {errors.max_retries ?? "0–3. After that the ticket escalates as a model error."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-concurrency`}>Batch concurrency</Label>
                  <Input
                    id={`${ids}-concurrency`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={64}
                    step={1}
                    className="tabular-nums"
                    value={Number.isNaN(values.batch_concurrency) ? "" : values.batch_concurrency}
                    onChange={(e) => set("batch_concurrency", numberInput(e.target.value))}
                    aria-invalid={Boolean(errors.batch_concurrency)}
                  />
                  <p className={cn("text-xs", errors.batch_concurrency ? "text-destructive" : "text-muted-foreground")}>
                    {errors.batch_concurrency ?? "1–64. Match it to what your vLLM server can batch."}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Automation */}
            <Card className="gap-2 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="text-muted-foreground size-4" /> Automation
                </CardTitle>
                <CardDescription>What the pipeline may do on its own. Replies are always approved by a person.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {AUTOMATION.map((a) => {
                  const Icon = a.icon
                  const on = values[a.key]
                  const risky = a.key === "allow_cloud_for_live_tickets" && on
                  return (
                    <div key={a.key} className="flex items-start justify-between gap-4 py-4">
                      <div className="flex gap-3">
                        <div
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                            risky ? "bg-warning/15 text-warning-foreground dark:text-warning" : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="space-y-0.5">
                          <Label htmlFor={`${ids}-${a.key}`} className="text-sm font-medium">
                            {a.title}
                            {changed.includes(a.key) ? (
                              <Badge variant="outline" className="border-primary/30 text-primary ml-1 h-4 px-1.5 text-[10px] font-normal">
                                edited
                              </Badge>
                            ) : null}
                          </Label>
                          <p className="text-muted-foreground max-w-2xl text-sm">{a.description}</p>
                          {risky ? (
                            <p className="text-warning-foreground dark:text-warning text-xs font-medium">
                              On: customer text from live tickets can leave the on-prem server.
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Switch id={`${ids}-${a.key}`} checked={on} onCheckedChange={(v) => toggle(a.key, v)} />
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <SaveBar
            show={changed.length > 0}
            message={`${changed.length} unsaved change${changed.length === 1 ? "" : "s"}`}
            hint={invalid ? "fix the highlighted fields" : "applies to new triages"}
            onDiscard={() => setDraft({})}
            onSave={() => save.mutate()}
            saving={save.isPending}
            disabled={invalid}
          />
        </>
      )}

      <AlertDialog open={confirmCloud} onOpenChange={setConfirmCloud}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning/15 text-warning-foreground dark:text-warning">
              <CloudAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Send live customer tickets to cloud models?</AlertDialogTitle>
            <AlertDialogDescription>
              Customer messages, which can contain names, phone numbers, amounts and transaction references, will leave the on-prem
              server and be processed by the external provider of any cloud model you use on live tickets. Make sure this is covered by
              your data-protection agreement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it off</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => set("allow_cloud_for_live_tickets", true)}
            >
              Allow cloud
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
