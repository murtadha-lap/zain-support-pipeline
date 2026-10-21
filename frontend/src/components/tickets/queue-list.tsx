"use client"

import { ChevronLeft, ChevronRight, FileCheck2, Inbox } from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CategoryBadge, EscalationBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { EmptyState } from "@/components/shared/page"
import { ticketHref, type QueueFrom } from "@/components/tickets/lib"
import {
  AssigneeAvatar,
  AssignToMeButton,
  FlagList,
  SyntheticBadge,
  TimeAgo,
} from "@/components/tickets/ticket-bits"
import { useMe } from "@/lib/hooks"
import type { TicketListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  tickets: TicketListItem[] | undefined
  loading?: boolean
  from: QueueFrom
  threshold?: number
  showStatus?: boolean
  showDraftReady?: boolean
  showEscalation?: boolean
  empty: { title: string; description?: string; icon?: React.ElementType; action?: React.ReactNode }
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }
}

// Rich queue rows for the review and team queues. Whole row opens the ticket.
export function QueueList({
  tickets,
  loading,
  from,
  threshold,
  showStatus,
  showDraftReady,
  showEscalation = true,
  empty,
  pagination,
}: Props) {
  const router = useRouter()
  const { data: me } = useMe()

  if (loading) return <QueueListSkeleton />

  if (!tickets?.length) {
    return (
      <EmptyState
        icon={empty.icon ?? Inbox}
        title={empty.title}
        description={empty.description}
        action={empty.action}
        className="bg-card"
      />
    )
  }

  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  return (
    <div className="space-y-3">
      <ul className="bg-card divide-y overflow-hidden rounded-xl border shadow-xs">
        {tickets.map((t) => {
          const open = () => router.push(ticketHref(t.id, from))
          return (
            <li
              key={t.id}
              role="link"
              tabIndex={0}
              aria-label={`Open ticket ${t.ref}`}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  open()
                }
              }}
              className="group hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-ring/50 relative flex cursor-pointer flex-col gap-3 px-4 py-3.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset md:flex-row md:items-center md:gap-5"
            >
              {t.priority === "high" ? (
                <span className="bg-destructive absolute inset-y-0 left-0 w-0.5" aria-hidden />
              ) : null}
              <div className="flex shrink-0 items-center justify-between gap-2 md:w-28 md:flex-col md:items-start md:justify-center md:gap-1">
                <span className="font-mono text-xs font-medium tracking-tight">{t.ref}</span>
                <TimeAgo value={t.created_at} />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <p dir="auto" className="font-arabic line-clamp-2 text-start text-sm leading-relaxed">
                  {t.text_preview}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {showStatus ? <StatusBadge status={t.status} /> : null}
                  <CategoryBadge category={t.category} />
                  {showEscalation ? <EscalationBadge reason={t.escalation_reason} /> : null}
                  {showDraftReady && t.status === "routed" && t.category ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success gap-1 font-normal">
                          <FileCheck2 className="size-3" /> Draft ready
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>The AI draft passed every check and is waiting for review.</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <FlagList flags={t.flags} />
                  {t.is_synthetic ? <SyntheticBadge /> : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4 md:justify-end">
                <div className="w-24">
                  <ConfidenceMeter value={t.confidence} threshold={threshold} />
                </div>
                <div className="w-20">
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="ml-auto flex w-28 justify-end md:ml-0">
                  {t.assignee_name ? (
                    <AssigneeAvatar name={t.assignee_name} isMe={t.assignee_id === me?.id} />
                  ) : t.status === "resolved" || t.status === "closed" ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <AssignToMeButton ticketId={t.id} />
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {pagination && pagination.total > pagination.pageSize ? (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span className="tabular-nums">
            {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
            {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {pagination.page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={pagination.page >= pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function QueueListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-card divide-y overflow-hidden rounded-xl border" aria-busy="true" aria-label="Loading tickets">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-5">
          <div className="flex gap-2 md:w-28 md:flex-col">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton className="ml-auto h-4 w-11/12" />
            <Skeleton className="ml-auto h-4 w-2/3" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-2 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function cnChip(active: boolean) {
  return cn(
    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  )
}
