"use client"

import { useQuery } from "@tanstack/react-query"
import { FileQuestion, History, ShieldAlert, Tags } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/page"
import { isFinished, isReviewer, isTriaging, queueHref, queueLabel } from "@/components/tickets/lib"
import { ActionBar } from "@/components/tickets/workspace/action-bar"
import { ActivityCard } from "@/components/tickets/workspace/activity-card"
import { EditLabelsSheet } from "@/components/tickets/workspace/edit-labels-sheet"
import { GoldCard } from "@/components/tickets/workspace/gold-card"
import { CustomerMessageCard, EscalationCallout } from "@/components/tickets/workspace/message-card"
import { ReplyCard } from "@/components/tickets/workspace/reply-card"
import { TicketHeader } from "@/components/tickets/workspace/ticket-header"
import { TriageCard } from "@/components/tickets/workspace/triage-card"
import { TriageHistorySheet } from "@/components/tickets/workspace/triage-history-sheet"
import { useDraft } from "@/components/tickets/workspace/use-draft"
import { api, ApiError } from "@/lib/api"
import { qk, useMe } from "@/lib/hooks"
import type { TicketDetail, User } from "@/lib/types"

export function TicketWorkspace({ id }: { id: string }) {
  const { data: me } = useMe()
  const params = useSearchParams()
  const from = params.get("from")
  const backHref = queueHref(from, me?.role)
  const backLabel = queueLabel(from, me?.role)

  const { data: ticket, error, isLoading } = useQuery({
    queryKey: qk.ticket(id),
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
    refetchInterval: (q) => (isTriaging(q.state.data?.status) ? 3000 : false),
  })

  if (isLoading || !me) return <WorkspaceSkeleton />

  if (error || !ticket) {
    const status = error instanceof ApiError ? error.status : 0
    return (
      <EmptyState
        icon={status === 403 ? ShieldAlert : FileQuestion}
        title={status === 403 ? "This ticket belongs to another team" : status === 404 ? "Ticket not found" : "Could not load the ticket"}
        description={
          status === 403
            ? "You can only open tickets in your team's queue."
            : status === 404
              ? "It may have been removed, or the link is wrong."
              : error instanceof Error
                ? error.message
                : undefined
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>Back to {backLabel}</Link>
          </Button>
        }
      />
    )
  }

  return <WorkspaceBody key={ticket.id} ticket={ticket} me={me} backHref={backHref} backLabel={backLabel} />
}

function WorkspaceBody({
  ticket,
  me,
  backHref,
  backLabel,
}: {
  ticket: TicketDetail
  me: User
  backHref: string
  backLabel: string
}) {
  const finished = isFinished(ticket.status)
  const draft = useDraft(ticket, !finished && !isTriaging(ticket.status))
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const reviewer = isReviewer(me.role)

  return (
    <div className="space-y-6">
      <TicketHeader ticket={ticket} me={me} backHref={backHref} backLabel={backLabel} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <EscalationCallout ticket={ticket} reviewer={reviewer} />
          <CustomerMessageCard ticket={ticket} />
          <ReplyCard ticket={ticket} draft={draft} />
          <ActionBar ticket={ticket} me={me} draft={draft} backHref={backHref} />
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pr-1 lg:pb-4 scrollbar-thin">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setLabelsOpen(true)} disabled={ticket.status === "processing"}>
              <Tags /> Edit labels
            </Button>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History /> Triage history
              {ticket.triage_history.length ? (
                <Badge variant="secondary" className="h-5 min-w-5 px-1 tabular-nums">
                  {ticket.triage_history.length}
                </Badge>
              ) : null}
            </Button>
          </div>
          <TriageCard ticket={ticket} />
          <GoldCard ticket={ticket} />
          <ActivityCard decisions={ticket.decisions} />
        </aside>
      </div>

      <EditLabelsSheet open={labelsOpen} onOpenChange={setLabelsOpen} ticket={ticket} role={me.role} />
      <TriageHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={ticket.triage_history}
        showRaw={reviewer}
      />
    </div>
  )
}

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading ticket">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="space-y-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-2 rounded-xl border p-4">
              <Skeleton className="ml-auto h-4 w-11/12" />
              <Skeleton className="ml-auto h-4 w-4/5" />
              <Skeleton className="ml-auto h-4 w-2/3" />
            </div>
          </div>
          <div className="space-y-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <div className="space-y-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
