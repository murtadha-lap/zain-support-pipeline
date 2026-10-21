"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowDownUp, FilterX, Search, ShieldAlert, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges"
import { ConfidenceMeter } from "@/components/shared/confidence-meter"
import { DataTable } from "@/components/shared/data-table"
import { EmptyState, PageHeader, PageSkeleton } from "@/components/shared/page"
import { UserAvatar } from "@/components/shell/user-menu"
import { ticketHref, useDebounced, useThreshold } from "@/components/tickets/lib"
import { MultiSelect } from "@/components/tickets/multi-select"
import { AssignToMeButton, SyntheticBadge, TimeAgo } from "@/components/tickets/ticket-bits"
import { api } from "@/lib/api"
import { qk, useMe, useMeta, useTeams } from "@/lib/hooks"
import type { Page, TicketListItem } from "@/lib/types"

const PAGE_SIZE = 25

const SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-priority", label: "Highest priority" },
  { value: "confidence", label: "Lowest confidence" },
]

const FILTER_KEYS = ["q", "status", "category", "priority", "team_key", "escalation_reason", "is_synthetic"] as const

export default function TicketsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TicketsGate />
    </Suspense>
  )
}

function TicketsGate() {
  const { data: me, isLoading } = useMe()
  const params = useSearchParams()
  if (isLoading) return <PageSkeleton />
  const assignedToMe = params.get("assignee") === "me"
  const allowed = me && (me.role === "agent" || me.role === "admin" || (me.role === "team_member" && assignedToMe))
  if (!allowed) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Team members can open “Assigned to me” and their team queue."
      />
    )
  }
  return <TicketsList />
}

function TicketsList() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: me } = useMe()
  const { data: meta } = useMeta()
  const { data: teams } = useTeams()
  const threshold = useThreshold()

  const assignee = params.get("assignee") ?? undefined
  const assignedToMe = assignee === "me"
  const statuses = useMemo(() => (params.get("status") ?? "").split(",").filter(Boolean), [params])
  const page = Math.max(1, Number(params.get("page")) || 1)
  const sort = params.get("sort") ?? "-created_at"

  const setParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      if (resetPage) next.delete("page")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  // Search box: local state, debounced into the URL.
  const [search, setSearch] = useState(params.get("q") ?? "")
  const debounced = useDebounced(search.trim(), 350)
  const latest = useRef({ params, setParams })
  useEffect(() => {
    latest.current = { params, setParams }
  })
  useEffect(() => {
    const current = latest.current.params.get("q") ?? ""
    if (debounced !== current) latest.current.setParams({ q: debounced || null })
  }, [debounced])

  const query = useMemo(
    () => ({
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
      category: params.get("category") ?? undefined,
      priority: params.get("priority") ?? undefined,
      team_key: params.get("team_key") ?? undefined,
      escalation_reason: params.get("escalation_reason") ?? undefined,
      is_synthetic: params.get("is_synthetic") === "true" ? true : undefined,
      assignee,
      sort,
      page,
      page_size: PAGE_SIZE,
    }),
    [params, assignee, sort, page],
  )

  const { data, isLoading } = useQuery({
    queryKey: qk.tickets(query),
    queryFn: () => api.get<Page<TicketListItem>>("/tickets", query),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length

  const clearFilters = () => {
    setSearch("")
    setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))
  }

  const columns = useMemo<ColumnDef<TicketListItem, unknown>[]>(
    () => [
      {
        header: "Ticket",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-mono text-xs font-medium">{row.original.ref}</div>
            {row.original.is_synthetic ? <SyntheticBadge className="h-5" /> : null}
          </div>
        ),
      },
      {
        header: "Message",
        cell: ({ row }) => (
          <p dir="auto" className="font-arabic line-clamp-2 max-w-md min-w-48 text-start text-sm whitespace-normal">
            {row.original.text_preview}
          </p>
        ),
      },
      { header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { header: "Category", cell: ({ row }) => <CategoryBadge category={row.original.category} /> },
      { header: "Priority", cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
      {
        header: "Confidence",
        cell: ({ row }) => <ConfidenceMeter value={row.original.confidence} threshold={threshold} />,
      },
      {
        header: "Team",
        cell: ({ row }) =>
          row.original.team_name ? (
            <span className="text-sm whitespace-nowrap">{row.original.team_name}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        header: "Assignee",
        cell: ({ row }) =>
          row.original.assignee_name ? (
            <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
              <UserAvatar name={row.original.assignee_name} className="size-6" />
              {row.original.assignee_id === me?.id ? "You" : row.original.assignee_name}
            </span>
          ) : row.original.status === "resolved" || row.original.status === "closed" ? (
            <span className="text-muted-foreground text-xs">—</span>
          ) : (
            <AssignToMeButton ticketId={row.original.id} />
          ),
      },
      { header: "Created", cell: ({ row }) => <TimeAgo value={row.original.created_at} /> },
    ],
    [threshold, me?.id],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            {assignedToMe ? "Assigned to me" : "All tickets"}
            {data ? (
              <Badge variant="secondary" className="h-6 px-2 text-sm tabular-nums">
                {data.total}
              </Badge>
            ) : null}
          </span>
        }
        description={
          assignedToMe
            ? "Tickets you picked up. Finish them or unassign so someone else can."
            : "Search and filter every ticket. Filters live in the URL, so you can share the view."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search text or ZS-…"
            className="h-9 pr-8 pl-8"
            aria-label="Search tickets"
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

        <MultiSelect
          title="Status"
          options={(meta?.statuses ?? []).map((s) => ({ value: s.key, label: s.label }))}
          selected={statuses}
          onChange={(values) => setParams({ status: values.join(",") || null })}
        />
        <FilterSelect
          label="Category"
          value={params.get("category")}
          options={(meta?.categories ?? []).map((c) => ({ value: c.key, label: c.label }))}
          onChange={(v) => setParams({ category: v })}
        />
        <FilterSelect
          label="Priority"
          value={params.get("priority")}
          options={(meta?.priorities ?? []).map((p) => ({ value: p.key, label: p.label }))}
          onChange={(v) => setParams({ priority: v })}
        />
        {me?.role !== "team_member" ? (
          <FilterSelect
            label="Team"
            value={params.get("team_key")}
            options={(teams ?? []).map((t) => ({ value: t.key, label: t.name }))}
            onChange={(v) => setParams({ team_key: v })}
          />
        ) : null}
        <FilterSelect
          label="Escalation reason"
          value={params.get("escalation_reason")}
          options={(meta?.escalation_reasons ?? []).map((r) => ({ value: r.key, label: r.label }))}
          onChange={(v) => setParams({ escalation_reason: v })}
        />
        <div className="flex h-9 items-center gap-2 rounded-md border px-3">
          <Switch
            id="synthetic-only"
            size="sm"
            checked={params.get("is_synthetic") === "true"}
            onCheckedChange={(v) => setParams({ is_synthetic: v ? "true" : null })}
          />
          <Label htmlFor="synthetic-only" className="text-sm font-normal whitespace-nowrap">
            Synthetic only
          </Label>
        </div>
        {activeFilters ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <FilterX /> Clear filters
            <Badge variant="secondary" className="h-5 min-w-5 px-1 tabular-nums">
              {activeFilters}
            </Badge>
          </Button>
        ) : null}

        <div className="ml-auto">
          <Select value={sort} onValueChange={(v) => setParams({ sort: v === "-created_at" ? null : v })}>
            <SelectTrigger className="h-9 w-48" aria-label="Sort tickets">
              <ArrowDownUp className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items}
        loading={isLoading}
        onRowClick={(t) => router.push(ticketHref(t.id, assignedToMe ? "assigned" : "tickets"))}
        empty={
          activeFilters
            ? {
                icon: Search,
                title: "No tickets match these filters",
                description: "Change or clear the filters to see more tickets.",
                action: (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ),
              }
            : assignedToMe
              ? {
                  title: "Nothing assigned to you",
                  description: "Use “Assign to me” in a queue to pick up a ticket.",
                }
              : { title: "No tickets yet", description: "Customer requests and uploaded batches appear here." }
        }
        pagination={
          data
            ? {
                page,
                pageSize: PAGE_SIZE,
                total: data.total,
                onPageChange: (p) => setParams({ page: p > 1 ? String(p) : null }, false),
              }
            : undefined
        }
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger
        className={value ? "border-primary/40 bg-primary/5 h-9" : "h-9"}
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
