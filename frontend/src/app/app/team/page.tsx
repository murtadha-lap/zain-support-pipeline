"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CheckCheck, CircleCheckBig, RefreshCw, Undo2 } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader, PageSkeleton, RoleGuard } from "@/components/shared/page"
import { QueueList } from "@/components/tickets/queue-list"
import { useThreshold } from "@/components/tickets/lib"
import { api } from "@/lib/api"
import { qk, useMe, useTeams } from "@/lib/hooks"
import type { Page, TicketListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

type TabKey = "open" | "sent_back" | "resolved"

const TABS: { key: TabKey; label: string; query: Record<string, string> }[] = [
  { key: "open", label: "Open", query: { status: "routed", sort: "-priority" } },
  { key: "sent_back", label: "Sent back", query: { status: "escalated", escalation_reason: "manual", sort: "-created_at" } },
  { key: "resolved", label: "Resolved", query: { status: "resolved", sort: "-created_at" } },
]

export default function TeamPage() {
  return (
    <RoleGuard roles={["team_member"]}>
      <Suspense fallback={<PageSkeleton />}>
        <TeamQueue />
      </Suspense>
    </RoleGuard>
  )
}

function useTab(tab: (typeof TABS)[number], page: number) {
  const query = useMemo(() => ({ ...tab.query, page, page_size: PAGE_SIZE }), [tab, page])
  return useQuery({
    queryKey: qk.tickets(query),
    queryFn: () => api.get<Page<TicketListItem>>("/tickets", query),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  })
}

function TeamQueue() {
  const { data: me } = useMe()
  const { data: teams } = useTeams()
  const team = teams?.find((t) => t.key === me?.team_key)
  const threshold = useThreshold()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tabParam = params.get("tab")
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "open"
  const [pages, setPages] = useState<Record<TabKey, number>>({ open: 1, sent_back: 1, resolved: 1 })

  const open = useTab(TABS[0], pages.open)
  const sentBack = useTab(TABS[1], pages.sent_back)
  const resolved = useTab(TABS[2], pages.resolved)
  const results: Record<TabKey, typeof open> = { open, sent_back: sentBack, resolved }
  const fetching = open.isFetching || sentBack.isFetching || resolved.isFetching

  const setTab = (value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value === "open") next.delete("tab")
    else next.set("tab", value)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const empties: Record<TabKey, { icon: React.ElementType; title: string; description: string }> = {
    open: {
      icon: CheckCheck,
      title: "Nothing waiting for your team",
      description: "Routed tickets appear here as soon as the model has triaged them.",
    },
    sent_back: {
      icon: Undo2,
      title: "No tickets sent back",
      description: "Tickets your team returned to the human agents show up here until they are re-routed.",
    },
    resolved: {
      icon: CircleCheckBig,
      title: "No resolved tickets yet",
      description: "Replies your team approved will be listed here.",
    },
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            {team ? <span className="size-3 rounded-full" style={{ background: team.color }} aria-hidden /> : null}
            {me?.team_name ?? team?.name ?? "Team"} queue
          </span>
        }
        description={
          <>
            {team?.name_ar ? (
              <span dir="rtl" className="font-arabic mr-2">
                {team.name_ar}
              </span>
            ) : null}
            Tickets routed to your team. Review the draft, edit if needed, and approve.
          </>
        }
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={fetching}
                onClick={() => {
                  void open.refetch()
                  void sentBack.refetch()
                  void resolved.refetch()
                }}
              >
                <RefreshCw className={cn(fetching && "animate-spin")} />
                Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent>The queue also refreshes every 15 seconds</TooltipContent>
          </Tooltip>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          {TABS.map((t) => {
            const total = results[t.key].data?.total
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-2 px-3">
                {t.label}
                {total !== undefined ? (
                  <Badge
                    variant={t.key === "open" && total > 0 ? "default" : "secondary"}
                    className="h-5 min-w-5 px-1.5 tabular-nums"
                  >
                    {total}
                  </Badge>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {TABS.map((t) => {
          const r = results[t.key]
          return (
            <TabsContent key={t.key} value={t.key}>
              <QueueList
                tickets={r.data?.items}
                loading={r.isLoading}
                from="team"
                threshold={threshold}
                showDraftReady={t.key === "open"}
                showStatus={t.key === "resolved"}
                showEscalation={t.key !== "resolved"}
                empty={empties[t.key]}
                pagination={
                  r.data
                    ? {
                        page: pages[t.key],
                        pageSize: PAGE_SIZE,
                        total: r.data.total,
                        onPageChange: (p) => setPages((prev) => ({ ...prev, [t.key]: p })),
                      }
                    : undefined
                }
              />
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
