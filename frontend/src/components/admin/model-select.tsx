"use client"

import { AlertTriangle, Cloud, FlaskConical, KeyRound, Server, Star } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useModels, useSettings } from "@/components/admin/queries"
import { useLabel } from "@/lib/hooks"
import type { ModelConfig, Provider } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
  const Icon = provider === "vllm" ? Server : provider === "mock" ? FlaskConical : Cloud
  return <Icon className={cn("size-4", className)} aria-hidden />
}

/** Model choice that falls back to the default enabled model until the user picks one. */
export function useModelChoice() {
  const { data: models, isLoading } = useModels()
  const [picked, setPicked] = useState<number | null>(null)
  const enabled = (models ?? []).filter((m) => m.enabled)
  const fallback = enabled.find((m) => m.is_default) ?? enabled[0]
  const value = picked ?? fallback?.id ?? null
  const selected = enabled.find((m) => m.id === value) ?? null
  return { models: enabled, isLoading, value, setValue: setPicked, selected }
}

export function ModelSelect({
  id,
  models,
  value,
  onChange,
  isLoading,
  disabled,
}: {
  id?: string
  models: ModelConfig[]
  value: number | null
  onChange: (id: number) => void
  isLoading?: boolean
  disabled?: boolean
}) {
  if (isLoading) return <Skeleton className="h-9 w-full" />
  return (
    <Select
      value={value === null ? undefined : String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled || models.length === 0}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={models.length ? "Choose a model" : "No enabled models"} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {models.map((m) => (
          <SelectItem key={m.id} value={String(m.id)}>
            <ProviderIcon provider={m.provider} className={cn(m.is_cloud ? "text-info" : "text-muted-foreground")} />
            <span className="truncate">{m.name}</span>
            {m.is_default ? <Star className="fill-warning text-warning size-3.5" aria-label="Default model" /> : null}
            <span className="text-muted-foreground truncate font-mono text-xs">{m.model_id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Explains what happens to ticket text with the chosen model. */
export function ModelWarning({ model, liveTickets }: { model: ModelConfig | null; liveTickets: boolean }) {
  const { data: settings } = useSettings()
  const label = useLabel()
  if (!model) return null
  const provider = label("providers", model.provider)
  const notes: React.ReactNode[] = []

  if (model.is_cloud) {
    if (liveTickets && settings && !settings.allow_cloud_for_live_tickets) {
      notes.push(
        <span key="cloud-live">
          <strong className="font-medium">Cloud model.</strong> Cloud models don&apos;t process live customer tickets unless{" "}
          <em>Allow cloud for live tickets</em> is on in{" "}
          <Link href="/app/admin/settings" className="text-foreground underline underline-offset-2">
            Settings
          </Link>
          . Uploaded synthetic tickets are fine; for live tickets pick a local model.
        </span>,
      )
    } else if (liveTickets) {
      notes.push(
        <span key="cloud-live-allowed">
          <strong className="font-medium">Customer text will leave the on-prem server</strong> and be sent to {provider}.
        </span>,
      )
    } else {
      notes.push(
        <span key="cloud-upload">
          Uploaded tickets will be sent to <strong className="font-medium">{provider}</strong>. Only upload synthetic data.
        </span>,
      )
    }
  }
  if (model.api_key_env && !model.has_api_key) {
    notes.push(
      <span key="key" className="inline-flex items-start gap-1">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <code className="font-mono">{model.api_key_env}</code> is not set on the server, so calls to this model will fail.
        </span>
      </span>,
    )
  }
  if (!notes.length) return null
  return (
    <Alert className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning">
      <AlertTriangle />
      <AlertDescription className="text-warning-foreground/90 dark:text-warning/90 gap-1.5 text-xs">{notes}</AlertDescription>
    </Alert>
  )
}
