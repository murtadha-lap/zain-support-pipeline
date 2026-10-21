"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CheckCheck, RefreshCw, Search, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader, RoleGuard } from "@/components/shared/page"
import { cnChip, QueueList } from "@/components/tickets/queue-list"
import { useDebounced, useThreshold } from "@/components/tickets/lib"
import { api } from "@/lib/api"
import { qk, useMeta } from "@/lib/hooks"
import type { Page, TicketListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

export default function InboxPage() {
  return (
    <RoleGuard roles={["agent", "admin"]}>
      <ReviewQueue />
    </RoleGuard>
  )
}

function ReviewQueue() {
  const { data: meta } = useMeta()
  const threshold = useThreshold()
  const [reason, setReason] = useState<string>("all")
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim(), 350)

  const query = useMemo(
    () => ({
      status: "escalated",
      sort: "-priority",
      escalation_reason: reason === "all" ? undefined : reason,
      assignee: onlyUnassigned ? "none" : undefined,
      q: q || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [reason, onlyUnassigned, q, page],
  )

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: qk.tickets(query),
    queryFn: () => api.get<Page<TicketListItem>>("/tickets", query),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  })

  const items = data?.items

  const filtered = reason !== "all" || !!q || onlyUnassigned

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            Review queue
            {data ? (
              <Badge variant="secondary" className="h-6 px-2 text-sm tabular-nums">
                {data.total}
              </Badge>
            ) : null}
          </span>
        }
        description="Tickets the model was not sure about. Check the labels, fix the draft and approve. Nothing is sent automatically."
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn(isFetching && "animate-spin")} />
                Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent>The queue also refreshes every 15 seconds</TooltipContent>
          </Tooltip>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative md:w-80">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search text or reference…"
              className="pr-8 pl-8"
              aria-label="Search the review queue"
            />
            {search ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X />
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <Switch
              id="only-unassigned"
              checked={onlyUnassigned}
              onCheckedChange={setOnlyUnassigned}
            />
            <Label htmlFor="only-unassigned" className="text-sm font-normal">
              Only unassigned
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by escalation reason">
          <button
            type="button"
            className={cnChip(reason === "all")}
            aria-pressed={reason === "all"}
            onClick={() => {
              setReason("all")
              setPage(1)
            }}
          >
            All reasons
          </button>
          {(meta?.escalation_reasons ?? []).map((r) => (
            <Tooltip key={r.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cnChip(reason === r.key)}
                  aria-pressed={reason === r.key}
                  onClick={() => {
                    setReason(r.key)
                    setPage(1)
                  }}
                >
                  {r.label}
                </button>
              </TooltipTrigger>
              {r.description ? <TooltipContent className="max-w-64">{r.description}</TooltipContent> : null}
            </Tooltip>
          ))}
        </div>
      </div>

      <QueueList
        tickets={items}
        loading={isLoading}
        from="inbox"
        threshold={threshold}
        empty={
          filtered
            ? {
                icon: Search,
                title: "No tickets match these filters",
                description: "Try another reason or clear the search.",
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReason("all")
                      setSearch("")
                      setOnlyUnassigned(false)
                      setPage(1)
                    }}
                  >
                    Clear filters
                  </Button>
                ),
              }
            : {
                icon: CheckCheck,
                title: "Queue is clear",
                description: "Every escalated ticket has been handled. New ones appear here automatically.",
              }
        }
        pagination={data ? { page, pageSize: PAGE_SIZE, total: data.total, onPageChange: setPage } : undefined}
      />
    </div>
  )
}
