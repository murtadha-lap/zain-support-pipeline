"use client"

import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  Database,
  Gauge,
  Plus,
  Send,
  Target,
  Ticket,
  Timer,
  Upload,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, PageHeader } from "@/components/shared/page"
import { NewBatchDialog, UploadBatchDialog } from "@/components/admin/batch-dialogs"
import {
  CategoryChart,
  ChartCard,
  ChartCardSkeleton,
  ConfidenceHistogram,
  DailyChart,
  StatusDonut,
  TeamBars,
} from "@/components/admin/charts"
import { BatchProgress, BatchStatusBadge, QueryError, StatCard, StatCardSkeleton } from "@/components/admin/common"
import { useOverview, useSettings } from "@/components/admin/queries"
import { duration, percent, timeAgo } from "@/lib/format"
import type { Batch, Overview } from "@/lib/types"
import { cn } from "@/lib/utils"

const BAND = { low: 0.15, high: 0.3, max: 0.5 }

function EscalationBand({ rate }: { rate: number }) {
  const pos = (v: number) => `${(Math.min(v, BAND.max) / BAND.max) * 100}%`
  const inBand = rate >= BAND.low && rate <= BAND.high
  return (
    <div className="space-y-1.5" aria-hidden>
      <div className="bg-muted relative h-1.5 rounded-full">
        <div
          className="bg-success/35 absolute inset-y-0 rounded-full"
          style={{ left: pos(BAND.low), width: `calc(${pos(BAND.high)} - ${pos(BAND.low)})` }}
        />
        <div
          className={cn(
            "border-card absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
            inBand ? "bg-success" : "bg-warning",
          )}
          style={{ left: pos(rate) }}
        />
      </div>
      <div className="text-muted-foreground flex justify-between text-[10px] tabular-nums">
        <span>0%</span>
        <span>target 15–30%</span>
        <span>50%+</span>
      </div>
    </div>
  )
}

function escalationHelper(rate: number) {
  if (rate < BAND.low) return "Below the target band: check the threshold isn't letting risky tickets through."
  if (rate > BAND.high) return "Above the target band: human agents get more tickets than planned."
  return "Within the 15–30% target band."
}

function Kpis({ o, threshold }: { o: Overview; threshold?: number }) {
  const open = (o.by_status.new ?? 0) + (o.by_status.processing ?? 0) + (o.by_status.routed ?? 0) + (o.by_status.escalated ?? 0)
  const inBand = o.escalation_rate >= BAND.low && o.escalation_rate <= BAND.high
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        icon={Ticket}
        label="Tickets"
        value={o.tickets_total.toLocaleString()}
        helper={`${open.toLocaleString()} open · ${(o.by_status.resolved ?? 0).toLocaleString()} resolved`}
        info="All tickets in the system, live and uploaded (synthetic)."
      />
      <StatCard
        icon={AlertTriangle}
        label="Escalation rate"
        tone={inBand ? "success" : "warning"}
        value={percent(o.escalation_rate, 1)}
        helper={escalationHelper(o.escalation_rate)}
        info="Share of triaged tickets that failed a check (confidence, grounding, single issue, schema) and went to a human agent. The target band is 15–30%."
      >
        <EscalationBand rate={o.escalation_rate} />
      </StatCard>
      <StatCard
        icon={Gauge}
        label="Average confidence"
        tone="info"
        value={percent(o.avg_confidence, 1)}
        helper={threshold !== undefined ? `Threshold ${threshold.toFixed(2)}. Below it, a ticket goes to a human.` : "Category-token probability."}
        info="Mean probability of the category tokens from the model's logprobs. Models without logprobs have no confidence and are not counted."
      />
      <StatCard
        icon={Target}
        label="Auto-routed accuracy"
        tone="success"
        value={percent(o.auto_routed_accuracy, 1)}
        helper={o.auto_routed_accuracy === null ? "No routed tickets resolved yet." : "Routed tickets approved without a relabel."}
        info="Of the tickets the pipeline routed straight to a team and that were later resolved, the share a person approved without changing the labels."
      />
      <StatCard
        icon={Send}
        label="Drafts sent unedited"
        tone="primary"
        value={percent(o.drafts_sent_unedited_rate, 1)}
        helper={o.drafts_sent_unedited_rate === null ? "No replies sent yet." : "Approved replies that kept the AI draft as is."}
        info="Every reply is approved by a person. This is the share of approved replies where the AI draft was sent without edits."
      />
      <StatCard
        icon={Timer}
        label="Median resolution"
        tone="default"
        value={duration(o.median_resolution_s)}
        helper={o.median_resolution_s === null ? "No resolved tickets yet." : "From ticket created to reply sent."}
        info="Median time between a ticket being created and a person approving the reply."
      />
    </div>
  )
}

function RecentBatches({ batches }: { batches: Batch[] }) {
  const router = useRouter()
  if (!batches.length) {
    return (
      <EmptyState
        icon={Database}
        title="No batches yet"
        description="Start a batch over new tickets, or upload a dataset to evaluate a model."
        className="py-10"
      />
    )
  }
  return (
    <div className="-mx-6 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Batch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Progress</TableHead>
            <TableHead className="pr-6 text-right">Escalated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => (
            <TableRow key={b.id} className="cursor-pointer" onClick={() => router.push(`/app/admin/batches/${b.id}`)}>
              <TableCell className="max-w-48 pl-6">
                <Link
                  href={`/app/admin/batches/${b.id}`}
                  className="block truncate font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {b.name}
                </Link>
                <span className="text-muted-foreground block truncate text-xs">
                  {b.model_name} · {timeAgo(b.created_at)}
                </span>
              </TableCell>
              <TableCell>
                <BatchStatusBadge status={b.status} />
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <BatchProgress batch={b} />
              </TableCell>
              <TableCell className="pr-6 text-right tabular-nums">
                {b.processed ? percent(b.escalated / b.processed) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Actions() {
  return (
    <>
      <Button variant="ghost" asChild>
        <Link href="/app/admin/models">
          <Cpu className="size-4" /> Models
        </Link>
      </Button>
      <UploadBatchDialog
        trigger={
          <Button variant="outline">
            <Upload className="size-4" /> Upload file
          </Button>
        }
      />
      <NewBatchDialog
        trigger={
          <Button>
            <Plus className="size-4" /> New batch
          </Button>
        }
      />
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" />
        <ChartCardSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" />
        <ChartCardSkeleton />
      </div>
    </>
  )
}

export default function AdminDashboardPage() {
  const overview = useOverview()
  const settings = useSettings()
  const o = overview.data
  const threshold = settings.data?.confidence_threshold

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="How the triage pipeline is doing: volume, escalations, confidence and batches." actions={<Actions />} />

      {overview.isLoading ? (
        <DashboardSkeleton />
      ) : overview.isError ? (
        <QueryError error={overview.error} onRetry={() => overview.refetch()} title="Couldn't load the dashboard" />
      ) : !o || o.tickets_total === 0 ? (
        <EmptyState
          icon={Database}
          title="No tickets yet"
          description="Seed the database, or upload a dataset such as data/test.jsonl and run a batch. KPIs and charts appear here once tickets exist."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <UploadBatchDialog
                trigger={
                  <Button>
                    <Upload className="size-4" /> Upload file
                  </Button>
                }
              />
              <Button variant="outline" asChild>
                <Link href="/app/admin/models">
                  <Cpu className="size-4" /> Check models
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Kpis o={o} threshold={threshold} />

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Last 14 days"
              description="Tickets created, resolved and escalated per day"
            >
              <DailyChart daily={o.daily} />
            </ChartCard>
            <ChartCard title="By status" description="Where every ticket is right now">
              <StatusDonut byStatus={o.by_status} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="By category" description="Current category of every triaged ticket">
              <CategoryChart byCategory={o.by_category} />
            </ChartCard>
            <ChartCard title="By team" description="Tickets routed to each team" info="Teams come from the routing table (Teams & routing).">
              <TeamBars byTeam={o.by_team} emptyText="No tickets routed yet" />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Confidence distribution"
              description="Category-token probability of the latest triage"
              info="Tickets left of the dashed threshold line fail the confidence check and are escalated to a human agent."
            >
              <ConfidenceHistogram buckets={o.confidence_histogram} threshold={threshold} />
            </ChartCard>
            <ChartCard
              title="Recent batches"
              description="The last five batch runs"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/app/admin/batches">
                    View all <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              }
            >
              <RecentBatches batches={o.recent_batches} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
