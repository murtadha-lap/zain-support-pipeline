"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Workflow } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/page"
import { QueryError, SaveBar, TeamDot } from "@/components/admin/common"
import { useRouting } from "@/components/admin/queries"
import { api, errorMessage } from "@/lib/api"
import { qk, useMeta, useTeams } from "@/lib/hooks"
import type { Category, Priority, RoutingRule } from "@/lib/types"
import { cn } from "@/lib/utils"

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
}

export function RoutingEditor() {
  const qc = useQueryClient()
  const routing = useRouting()
  const { data: teams } = useTeams()
  const { data: meta } = useMeta()
  const [edits, setEdits] = useState<Partial<Record<Category, RoutingRule>>>({})

  const server = routing.data ?? []
  const order = meta?.categories.map((c) => c.key) ?? []
  const rules = [...server]
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
    .map((r) => edits[r.category] ?? r)
  const changed = new Set(
    server
      .filter((r) => {
        const e = edits[r.category]
        return e && (e.team_key !== r.team_key || e.default_priority !== r.default_priority)
      })
      .map((r) => r.category),
  )
  const dirty = changed.size > 0

  const update = (rule: RoutingRule, patch: Partial<RoutingRule>) =>
    setEdits((prev) => ({ ...prev, [rule.category]: { ...rule, ...patch } }))

  const save = useMutation({
    mutationFn: () => api.put<RoutingRule[]>("/routing", rules),
    onSuccess: (data) => {
      qc.setQueryData(qk.routing, data)
      setEdits({})
      qc.invalidateQueries({ queryKey: qk.routing })
      qc.invalidateQueries({ queryKey: qk.teams })
      toast.success("Routing saved", { description: "New triages use the updated table. Existing tickets keep their team." })
    },
    onError: (err) => toast.error("Couldn't save routing", { description: errorMessage(err) }),
  })

  const priorityLabel = (p: Priority) => meta?.priorities.find((o) => o.key === p)?.label ?? p
  const priorities: Priority[] = (meta?.priorities.map((p) => p.key) as Priority[] | undefined) ?? ["high", "medium", "low"]

  return (
    <>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="text-muted-foreground size-4" /> Routing
          </CardTitle>
          <CardDescription>
            Where a ticket goes when every check passes. Final priority is the higher of the model&apos;s priority and the default
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {routing.isError ? (
            <div className="px-6">
              <QueryError error={routing.error} onRetry={() => routing.refetch()} title="Couldn't load routing" />
            </div>
          ) : routing.isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !rules.length ? (
            <div className="px-6">
              <EmptyState icon={Workflow} title="No routing rules" description="The backend seeds one rule per category. Check the seed ran." />
            </div>
          ) : (
            <div>
              <div className="text-muted-foreground hidden grid-cols-[minmax(0,1.3fr)_24px_minmax(0,1fr)_minmax(0,0.7fr)] items-center gap-3 border-b px-6 pb-2 text-xs font-medium tracking-wide uppercase md:grid">
                <span>Category</span>
                <span />
                <span>Team</span>
                <span>Default priority</span>
              </div>
              <ul className="divide-y">
                {rules.map((r) => {
                  const isChanged = changed.has(r.category)
                  const catLabel = meta?.categories.find((c) => c.key === r.category)
                  return (
                    <li
                      key={r.category}
                      className={cn(
                        "relative grid grid-cols-2 items-center gap-3 px-6 py-2.5 transition-colors md:grid-cols-[minmax(0,1.3fr)_24px_minmax(0,1fr)_minmax(0,0.7fr)]",
                        isChanged && "bg-primary/5",
                      )}
                    >
                      {isChanged ? <span className="bg-primary absolute inset-y-0 left-0 w-0.5" aria-hidden /> : null}
                      <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                        <CategoryBadge category={r.category} />
                        {catLabel?.label_ar ? (
                          <span dir="rtl" className="text-muted-foreground hidden truncate text-xs lg:inline">
                            {catLabel.label_ar}
                          </span>
                        ) : null}
                        {isChanged ? <span className="text-primary ml-auto text-[10px] font-medium uppercase md:hidden">edited</span> : null}
                      </div>
                      <ArrowRight className="text-muted-foreground hidden size-4 md:block" aria-hidden />
                      <Select value={r.team_key} onValueChange={(v) => update(r, { team_key: v })}>
                        <SelectTrigger className="w-full" aria-label={`Team for ${catLabel?.label ?? r.category}`}>
                          <SelectValue placeholder="Choose a team" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {(teams ?? []).map((t) => (
                            <SelectItem key={t.key} value={t.key}>
                              <TeamDot color={t.color} />
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={r.default_priority} onValueChange={(v) => update(r, { default_priority: v as Priority })}>
                        <SelectTrigger className="w-full" aria-label={`Default priority for ${catLabel?.label ?? r.category}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {priorities.map((p) => (
                            <SelectItem key={p} value={p}>
                              <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[p])} />
                              {priorityLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <SaveBar
        show={dirty}
        message={`Unsaved routing changes (${changed.size})`}
        hint="applies to new triages"
        onDiscard={() => setEdits({})}
        onSave={() => save.mutate()}
        saving={save.isPending}
      />
    </>
  )
}

/** Categories currently routed to each team, for the team cards. */
export function useCategoriesByTeam() {
  const routing = useRouting()
  const map: Record<string, Category[]> = {}
  for (const r of routing.data ?? []) (map[r.team_key] ??= []).push(r.category)
  return map
}
