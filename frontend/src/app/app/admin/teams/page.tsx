"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Boxes, Inbox, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CategoryBadge } from "@/components/shared/badges"
import { EmptyState, PageHeader } from "@/components/shared/page"
import { ConfirmDialog, QueryError, useDialogTarget } from "@/components/admin/common"
import { RoutingEditor, useCategoriesByTeam } from "@/components/admin/routing-editor"
import { TeamDialog } from "@/components/admin/team-dialog"
import { api, errorMessage } from "@/lib/api"
import { qk, useTeams } from "@/lib/hooks"
import type { Category, Team } from "@/lib/types"

function TeamCard({ team, categories, onEdit, onDelete }: { team: Team; categories: Category[]; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="relative gap-4 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: team.color }} aria-hidden />
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white shadow-sm"
            style={{ background: team.color }}
            aria-hidden
          >
            {team.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base" title={team.name}>
              {team.name}
            </div>
            <div dir="rtl" className="text-muted-foreground truncate text-left text-sm font-normal">
              {team.name_ar}
            </div>
          </div>
        </CardTitle>
        <CardAction>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${team.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="text-muted-foreground font-mono text-xs">{team.key}</p>
        {team.description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">{team.description}</p>
        ) : (
          <p className="text-muted-foreground/70 text-sm italic">No description</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {categories.length ? (
            categories.map((c) => <CategoryBadge key={c} category={c} />)
          ) : (
            <span className="text-muted-foreground text-xs">No categories routed here</span>
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-5 border-t pt-4 text-sm [.border-t]:pt-4">
        <span className="inline-flex items-center gap-1.5">
          <Users className="text-muted-foreground size-4" />
          <span className="font-medium tabular-nums">{team.member_count}</span>
          <span className="text-muted-foreground">member{team.member_count === 1 ? "" : "s"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Inbox className="text-muted-foreground size-4" />
          <span className="font-medium tabular-nums">{team.open_tickets}</span>
          <span className="text-muted-foreground">open</span>
        </span>
      </CardFooter>
    </Card>
  )
}

function TeamCardSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </CardContent>
      <CardFooter className="gap-5 border-t pt-4 [.border-t]:pt-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </CardFooter>
    </Card>
  )
}

export default function TeamsPage() {
  const qc = useQueryClient()
  const teams = useTeams()
  const byTeam = useCategoriesByTeam()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const deleting = useDialogTarget<Team>()

  const remove = useMutation({
    mutationFn: (t: Team) => api.delete(`/teams/${t.key}`),
    onSuccess: (_, t) => {
      toast.success("Team deleted", { description: t.name })
      qc.invalidateQueries({ queryKey: qk.teams })
      deleting.close()
    },
    onError: (err) => {
      toast.error("Couldn't delete the team", { description: errorMessage(err) })
      deleting.close()
    },
  })

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const list = teams.data ?? []
  const target = deleting.target
  const targetCats = target ? (byTeam[target.key] ?? []) : []

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <PageHeader
          title="Teams & routing"
          description="Teams work the tickets routed to them. The routing table maps each category to a team."
          actions={
            <Button onClick={openAdd}>
              <Plus className="size-4" /> Add team
            </Button>
          }
        />

        {teams.isError ? (
          <QueryError error={teams.error} onRetry={() => teams.refetch()} title="Couldn't load teams" />
        ) : teams.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <TeamCardSkeleton key={i} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No teams yet"
            description="Create a team for each queue (transfers, accounts, cards…) and then map categories to it below."
            action={
              <Button onClick={openAdd}>
                <Plus className="size-4" /> Add team
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((t) => (
              <TeamCard
                key={t.key}
                team={t}
                categories={byTeam[t.key] ?? []}
                onEdit={() => {
                  setEditing(t)
                  setFormOpen(true)
                }}
                onDelete={() => deleting.show(t)}
              />
            ))}
          </div>
        )}
      </div>

      <RoutingEditor />

      <TeamDialog open={formOpen} onOpenChange={setFormOpen} team={editing} />
      <ConfirmDialog
        open={deleting.open}
        onOpenChange={deleting.onOpenChange}
        title={`Delete ${target?.name ?? "team"}?`}
        description={
          <>
            <p>The team is removed permanently. Tickets already routed to it keep their history.</p>
            {target && (targetCats.length || target.member_count) ? (
              <p className="text-destructive">
                It still has {target.member_count ? `${target.member_count} member${target.member_count === 1 ? "" : "s"}` : null}
                {target.member_count && targetCats.length ? " and " : null}
                {targetCats.length ? `${targetCats.length} routing rule${targetCats.length === 1 ? "" : "s"}` : null}. Move them to
                another team first, or the server will refuse.
              </p>
            ) : null}
          </>
        }
        confirmLabel="Delete team"
        icon={Trash2}
        loading={remove.isPending}
        onConfirm={() => target && remove.mutate(target)}
      />
    </div>
  )
}
