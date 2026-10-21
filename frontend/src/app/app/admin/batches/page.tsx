"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { AlertTriangle, CheckCircle2, Plus, Route, Upload, Workflow, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable } from "@/components/shared/data-table"
import { PageHeader } from "@/components/shared/page"
import { NewBatchDialog, UploadBatchDialog } from "@/components/admin/batch-dialogs"
import { BatchProgress, BatchStatusBadge, isBatchActive, QueryError, SourceBadge } from "@/components/admin/common"
import { useBatches } from "@/components/admin/queries"
import { dateTime, percent, timeAgo } from "@/lib/format"
import type { Batch } from "@/lib/types"

function Count({ icon: Icon, value, label, className }: { icon: React.ElementType; value: number; label: string; className: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-sm tabular-nums ${value ? className : "text-muted-foreground/60"}`}>
          <Icon className="size-3.5" aria-hidden />
          {value.toLocaleString()}
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const columns: ColumnDef<Batch, unknown>[] = [
  {
    accessorKey: "name",
    header: "Batch",
    cell: ({ row }) => (
      <div className="max-w-56 min-w-36">
        <div className="truncate font-medium" title={row.original.name}>
          {row.original.name}
        </div>
        <div className="text-muted-foreground truncate text-xs">
          #{row.original.id} · {row.original.model_name}
        </div>
      </div>
    ),
  },
  { accessorKey: "source", header: "Source", cell: ({ row }) => <SourceBadge source={row.original.source} /> },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="space-y-1">
        <BatchStatusBadge status={row.original.status} />
        {row.original.error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-destructive max-w-40 truncate text-xs">{row.original.error}</p>
            </TooltipTrigger>
            <TooltipContent className="max-w-80">{row.original.error}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    ),
  },
  { id: "progress", header: "Progress", cell: ({ row }) => <BatchProgress batch={row.original} /> },
  {
    id: "results",
    header: "Results",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Count icon={Route} value={row.original.routed} label="Routed to a team" className="text-success" />
        <Count icon={AlertTriangle} value={row.original.escalated} label="Escalated to a human" className="text-warning-foreground dark:text-warning" />
        <Count icon={XCircle} value={row.original.failed} label="Failed (model error)" className="text-destructive" />
      </div>
    ),
  },
  {
    accessorKey: "avg_confidence",
    header: "Avg conf.",
    cell: ({ row }) => <span className="tabular-nums">{percent(row.original.avg_confidence, 1)}</span>,
  },
  {
    accessorKey: "created_by_name",
    header: "Created by",
    cell: ({ row }) => <span className="text-sm">{row.original.created_by_name}</span>,
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground text-sm whitespace-nowrap">{timeAgo(row.original.created_at)}</span>
        </TooltipTrigger>
        <TooltipContent>{dateTime(row.original.created_at)}</TooltipContent>
      </Tooltip>
    ),
  },
]

export default function BatchesPage() {
  const router = useRouter()
  const batches = useBatches()
  const active = batches.data?.filter(isBatchActive).length ?? 0
  const completed = batches.data?.filter((b) => b.status === "completed").length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description={
          batches.data?.length ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Run the model over many tickets and compare models on gold-labelled uploads.</span>
              {active ? (
                <span className="text-primary inline-flex items-center gap-1 font-medium">
                  <span className="bg-primary size-1.5 animate-pulse rounded-full" /> {active} running
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="text-success size-3.5" /> {completed} completed
                </span>
              )}
            </span>
          ) : (
            "Run the model over many tickets and compare models on gold-labelled uploads."
          )
        }
        actions={
          <>
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
        }
      />

      {batches.isError ? (
        <QueryError error={batches.error} onRetry={() => batches.refetch()} title="Couldn't load batches" />
      ) : (
        <DataTable
          columns={columns}
          data={batches.data}
          loading={batches.isLoading}
          onRowClick={(b) => router.push(`/app/admin/batches/${b.id}`)}
          empty={{
            icon: Workflow,
            title: "No batches yet",
            description: "Start a batch over new tickets, or upload a dataset (for example data/test.jsonl) to evaluate a model against gold labels.",
            action: (
              <div className="flex flex-wrap justify-center gap-2">
                <UploadBatchDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Upload className="size-4" /> Upload file
                    </Button>
                  }
                />
                <NewBatchDialog
                  trigger={
                    <Button size="sm">
                      <Plus className="size-4" /> New batch
                    </Button>
                  }
                />
              </div>
            ),
          }}
        />
      )}
    </div>
  )
}
