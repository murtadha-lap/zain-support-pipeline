"use client"

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Info,
  Loader2,
  RefreshCw,
  Radio,
  XCircle,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorMessage } from "@/lib/api"
import type { Batch, BatchStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Small building blocks shared by the admin pages                     */
/* ------------------------------------------------------------------ */

export function InfoTip({ children, label = "More info", className }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]",
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  )
}

export function LoadingButton({
  loading,
  disabled,
  children,
  icon: Icon,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean; icon?: React.ElementType }) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </Button>
  )
}

export type Tone = "default" | "primary" | "success" | "warning" | "destructive" | "info"

const TONE_ICON: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
}

export function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  info,
  tone = "primary",
  children,
  className,
  valueClassName,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  helper?: React.ReactNode
  info?: React.ReactNode
  tone?: Tone
  children?: React.ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-sm font-medium">{label}</span>
            {info ? <InfoTip label={`About ${label}`}>{info}</InfoTip> : null}
          </div>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_ICON[tone])}>
            <Icon className="size-4" />
          </div>
        </div>
        <div className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClassName)}>{value}</div>
        {children}
        {helper ? <div className="text-muted-foreground mt-auto text-xs leading-relaxed">{helper}</div> : null}
      </CardContent>
    </Card>
  )
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

export function QueryError({ error, onRetry, title = "Couldn't load data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

/** Sticky bar shown at the bottom of a form page while there are unsaved changes. */
export function SaveBar({
  show,
  message,
  onDiscard,
  onSave,
  saving,
  disabled,
  hint,
}: {
  show: boolean
  message: string
  onDiscard: () => void
  onSave: () => void
  saving?: boolean
  disabled?: boolean
  hint?: React.ReactNode
}) {
  useUnsavedGuard(show)
  if (!show) return null
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center pt-2" role="region" aria-label="Unsaved changes">
      <div className="bg-popover text-popover-foreground animate-in fade-in-0 slide-in-from-bottom-4 pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border p-3 pl-4 shadow-lg sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 text-sm">
          <span className="relative flex size-2">
            <span className="bg-warning absolute inline-flex size-full animate-ping rounded-full opacity-60" />
            <span className="bg-warning relative inline-flex size-2 rounded-full" />
          </span>
          <span className="font-medium">{message}</span>
          {hint ? <span className="text-muted-foreground hidden md:inline">· {hint}</span> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving} className="flex-1 sm:flex-none">
            Discard
          </Button>
          <LoadingButton size="sm" onClick={onSave} loading={saving} disabled={disabled} className="flex-1 sm:flex-none">
            Save changes
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Batches                                                             */
/* ------------------------------------------------------------------ */

const BATCH_STATUS: Record<BatchStatus, { label: string; className: string; icon: React.ElementType }> = {
  queued: { label: "Queued", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  running: { label: "Running", className: "bg-primary/10 text-primary border-primary/25", icon: Loader2 },
  completed: { label: "Completed", className: "bg-success/10 text-success border-success/25", icon: CheckCircle2 },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/25", icon: XCircle },
}

export function isBatchActive(b: Pick<Batch, "status"> | undefined | null) {
  return b?.status === "queued" || b?.status === "running"
}

export function BatchStatusBadge({ status, className }: { status: BatchStatus; className?: string }) {
  const s = BATCH_STATUS[status] ?? BATCH_STATUS.queued
  const Icon = s.icon
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", s.className, className)}>
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      {s.label}
    </Badge>
  )
}

export function SourceBadge({ source }: { source: Batch["source"] }) {
  return source === "upload" ? (
    <Badge variant="outline" className="border-info/30 bg-info/10 text-info gap-1 font-normal">
      <CloudUpload className="size-3" /> Upload
    </Badge>
  ) : (
    <Badge variant="outline" className="border-chart-2/30 bg-chart-2/10 text-chart-2 gap-1 font-normal">
      <Radio className="size-3" /> Live
    </Badge>
  )
}

export function batchPercent(b: Pick<Batch, "processed" | "total">) {
  if (!b.total) return 0
  return Math.min(100, Math.round((b.processed / b.total) * 100))
}

export function BatchProgress({ batch, className, showLabel = true }: { batch: Batch; className?: string; showLabel?: boolean }) {
  const pct = batchPercent(batch)
  return (
    <div className={cn("flex min-w-28 flex-col gap-1", className)}>
      <Progress
        value={pct}
        aria-label={`${batch.processed} of ${batch.total} processed`}
        className={cn(
          "h-1.5",
          batch.status === "completed" && "bg-success/20 [&>[data-slot=progress-indicator]]:bg-success",
          batch.status === "failed" && "bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive",
          batch.status === "queued" && "bg-muted",
        )}
      />
      {showLabel ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {batch.processed.toLocaleString()} / {batch.total.toLocaleString()}
          <span className="ml-1 opacity-70">({pct}%)</span>
        </span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

export const TEAM_SWATCHES = [
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#2563eb", name: "Blue" },
  { hex: "#0891b2", name: "Cyan" },
  { hex: "#059669", name: "Emerald" },
  { hex: "#65a30d", name: "Lime" },
  { hex: "#d97706", name: "Amber" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#db2777", name: "Pink" },
] as const

export function TeamDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{ background: color ?? "var(--muted-foreground)" }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog for destructive actions                         */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  icon,
  destructive = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  loading?: boolean
  icon?: React.ElementType
  destructive?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <LoadingButton variant={destructive ? "destructive" : "default"} loading={loading} icon={icon} onClick={onConfirm}>
            {confirmLabel}
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Keeps the last target while a dialog animates closed, so its title doesn't flash empty.
 */
export function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  return {
    target,
    open,
    show: (t: T) => {
      setTarget(t)
      setOpen(true)
    },
    close: () => setOpen(false),
    onOpenChange: setOpen,
  }
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Ask the browser to confirm before closing or reloading the tab with unsaved changes. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
