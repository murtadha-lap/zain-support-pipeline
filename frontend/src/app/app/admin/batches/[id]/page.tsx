"use client"

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
  AlertTriangle,
  ArrowLeft,
  CircleAlert,
  Gauge,
  Hash,
  Inbox,
  Route,
  SearchX,
  Timer,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryBadge, EscalationBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { DataTable } from "@/components/shared/data-table"
import { EmptyState, PageHeader } from "@/components/shared/page"
import { EscalationReasons, EvalSection } from "@/components/admin/batch-eval"
import { ChartCard, ChartCardSkeleton, TeamBars } from "@/components/admin/charts"
import {
  batchPercent,
  BatchStatusBadge,
  isBatchActive,
  QueryError,
  SourceBadge,
  StatCard,
  StatCardSkeleton,
} from "@/components/admin/common"
import { useSettings } from "@/components/admin/queries"
import { api, ApiError } from "@/lib/api"
import { dateTime, duration, percent, timeAgo } from "@/lib/format"
import { qk } from "@/lib/hooks"
import type { Batch, Page, TicketListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function LiveProgress({ batch }: { batch: Batch }) {
  const active = isBatchActive(batch)
  const now = useNow(active)
  const pct = batchPercent(batch)
  const started = batch.started_at ? new Date(batch.started_at).getTime() : null
  const elapsed = batch.duration_s ?? (started ? Math.max(0, (now - started) / 1000) : null)
  const rate = elapsed && batch.processed ? batch.processed / elapsed : null
  const eta = active && rate ? (batch.total - batch.processed) / rate : null

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{pct}%</span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {batch.processed.toLocaleString()} of {batch.total.toLocaleString()} tickets processed
            </span>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
            {batch.status === "queued" ? <span>Waiting for a worker…</span> : null}
            {elapsed !== null ? <span>Elapsed {duration(elapsed)}</span> : null}
            {rate ? <span>{rate >= 1 ? `${rate.toFixed(1)} tickets/s` : `${(60 * rate).toFixed(1)} tickets/min`}</span> : null}
            {eta !== null ? <span className="text-foreground font-medium">≈ {duration(eta)} left</span> : null}
            {batch.finished_at ? <span>Finished {dateTime(batch.finished_at)}</span> : null}
          </div>
        </div>
        <Progress
          value={pct}
          aria-label="Batch progress"
          className={cn(
            "h-2.5",
            batch.status === "completed" && "bg-success/20 [&>[data-slot=progress-indicator]]:bg-success",
            batch.status === "failed" && "bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive",
            active && "[&>[data-slot=progress-indicator]]:animate-pulse",
          )}
        />
        {batch.total > 0 ? (
          <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-success" style={{ width: `${(batch.routed / batch.total) * 100}%` }} />
            <div className="bg-warning" style={{ width: `${(batch.escalated / batch.total) * 100}%` }} />
            <div className="bg-destructive" style={{ width: `${(batch.failed / batch.total) * 100}%` }} />
          </div>
        ) : null}
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-success size-2 rounded-full" /> Routed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-warning size-2 rounded-full" /> Escalated
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-destructive size-2 rounded-full" /> Failed
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ticketColumns(threshold: number | undefined): ColumnDef<TicketListItem, unknown>[] {
  return [
    {
      accessorKey: "ref",
      header: "Ticket",
      cell: ({ row }) => <span className="font-mono text-xs font-medium whitespace-nowrap">{row.original.ref}</span>,
    },
    {
      accessorKey: "text_preview",
      header: "Message",
      cell: ({ row }) => (
        <p dir="auto" className="line-clamp-2 max-w-80 min-w-48 text-sm" title={row.original.text_preview}>
          {row.original.text_preview}
        </p>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "category", header: "Category", cell: ({ row }) => <CategoryBadge category={row.original.category} /> },
    { accessorKey: "priority", header: "Priority", cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
    {
      accessorKey: "confidence",
      header: "Confidence",
      cell: ({ row }) => <ConfidenceMeter value={row.original.confidence} threshold={threshold} />,
    },
    {
      id: "outcome",
      header: "Team / reason",
      cell: ({ row }) =>
        row.original.escalation_reason ? (
          <EscalationBadge reason={row.original.escalation_reason} />
        ) : (
          <span className="text-sm whitespace-nowrap">{row.original.team_name ?? "—"}</span>
        ),
    },
  ]
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-36 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCardSkeleton height={200} />
        <ChartCardSkeleton height={200} />
      </div>
    </div>
  )
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const settings = useSettings()

  const batchQ = useQuery({
    queryKey: qk.batch(id),
    queryFn: () => api.get<Batch>(`/batches/${id}`),
    refetchInterval: (q) => (q.state.data && !isBatchActive(q.state.data) ? false : 2_000),
  })
  const batch = batchQ.data
  const active = isBatchActive(batch)

  const ticketsQ = useQuery({
    queryKey: [...qk.batch(id), "tickets", page],
    queryFn: () => api.get<Page<TicketListItem>>(`/batches/${id}/tickets`, { page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: Boolean(batch),
    refetchInterval: active ? 4_000 : false,
  })

  // When a run finishes, refresh everything that depends on its results.
  const prevActive = useRef(active)
  useEffect(() => {
    if (prevActive.current && batch && !active) {
      qc.invalidateQueries({ queryKey: qk.batches })
      qc.invalidateQueries({ queryKey: qk.overview })
      qc.invalidateQueries({ queryKey: [...qk.batch(id), "tickets"] })
    }
    prevActive.current = active
  }, [active, batch, id, qc])

  if (batchQ.isLoading) return <DetailSkeleton />

  if (batchQ.isError || !batch) {
    const notFound = batchQ.error instanceof ApiError && batchQ.error.status === 404
    return notFound ? (
      <EmptyState
        icon={SearchX}
        title="Batch not found"
        description={`There is no batch #${id}. It may have been removed.`}
        action={
          <Button variant="outline" asChild>
            <Link href="/app/admin/batches">
              <ArrowLeft className="size-4" /> All batches
            </Link>
          </Button>
        }
      />
    ) : (
      <QueryError error={batchQ.error} onRetry={() => batchQ.refetch()} title="Couldn't load this batch" />
    )
  }

  const threshold = settings.data?.confidence_threshold
  const ofProcessed = (n: number) => (batch.processed ? `${percent(n / batch.processed, 1)} of processed` : "—")

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2" asChild>
          <Link href="/app/admin/batches">
            <ArrowLeft className="size-4" /> All batches
          </Link>
        </Button>
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-all">{batch.name}</span>
              <BatchStatusBadge status={batch.status} />
              <SourceBadge source={batch.source} />
            </span>
          }
          description={
            <>
              Batch #{batch.id} · model <span className="text-foreground font-medium">{batch.model_name}</span> · started by{" "}
              {batch.created_by_name} {timeAgo(batch.created_at)}
            </>
          }
        />
      </div>

      {batch.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{batch.status === "failed" ? "The batch failed" : "Some tickets failed"}</AlertTitle>
          <AlertDescription>
            <p className="font-mono text-xs break-words whitespace-pre-wrap">{batch.error}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <LiveProgress batch={batch} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Hash} label="Total" value={batch.total.toLocaleString()} helper={`${batch.processed.toLocaleString()} processed`} tone="default" />
        <StatCard icon={Route} label="Routed" tone="success" value={batch.routed.toLocaleString()} helper={ofProcessed(batch.routed)} info="Passed every check and went straight to a team queue." />
        <StatCard icon={AlertTriangle} label="Escalated" tone="warning" value={batch.escalated.toLocaleString()} helper={ofProcessed(batch.escalated)} info="Failed at least one check and went to the human review queue." />
        <StatCard
          icon={XCircle}
          label="Failed"
          tone={batch.failed ? "destructive" : "default"}
          value={batch.failed.toLocaleString()}
          valueClassName={batch.failed ? "text-destructive" : undefined}
          helper={batch.failed ? "Model errors after retries" : "No model errors"}
          info="The model returned invalid output even after the configured retries, or the call errored."
        />
        <StatCard icon={Gauge} label="Avg confidence" tone="info" value={percent(batch.avg_confidence, 1)} helper={threshold !== undefined ? `Threshold ${threshold.toFixed(2)}` : undefined} info="Mean category-token probability. Empty when the model gives no logprobs." />
        <StatCard
          icon={Timer}
          label="Duration"
          tone="primary"
          value={duration(batch.duration_s)}
          helper={batch.duration_s && batch.processed ? `${((batch.duration_s / batch.processed) * 1000).toFixed(0)} ms per ticket` : active ? "Still running" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Routed per team" description="Tickets this batch sent to each team queue">
          <TeamBars byTeam={batch.per_team} emptyText={batch.processed ? "Nothing was routed" : "Nothing processed yet"} />
        </ChartCard>
        <ChartCard title="Escalation reasons" description="First failing check for each escalated ticket">
          <EscalationReasons batch={batch} />
        </ChartCard>
      </div>

      {batch.eval ? <EvalSection ev={batch.eval} /> : null}

      <section className="space-y-3" aria-labelledby="batch-tickets">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 id="batch-tickets" className="text-lg font-semibold tracking-tight">
              Tickets in this batch
            </h2>
            <p className="text-muted-foreground text-sm">Open a ticket to review its triage, checks and draft.</p>
          </div>
          {ticketsQ.data ? <span className="text-muted-foreground text-sm tabular-nums">{ticketsQ.data.total.toLocaleString()} total</span> : null}
        </div>
        {ticketsQ.isError ? (
          <QueryError error={ticketsQ.error} onRetry={() => ticketsQ.refetch()} title="Couldn't load the tickets" />
        ) : (
          <DataTable
            columns={ticketColumns(threshold)}
            data={ticketsQ.data?.items}
            loading={ticketsQ.isLoading}
            onRowClick={(t) => router.push(`/app/tickets/${t.id}`)}
            empty={{ icon: Inbox, title: "No tickets in this batch", description: active ? "Tickets appear here as the batch runs." : undefined }}
            pagination={
              ticketsQ.data
                ? { page, pageSize: PAGE_SIZE, total: ticketsQ.data.total, onPageChange: setPage }
                : undefined
            }
          />
        )}
      </section>
    </div>
  )
}
