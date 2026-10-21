"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { Loader2, MoreHorizontal, Pencil, Search, UserCheck, UserPlus, UserX, Users, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable } from "@/components/shared/data-table"
import { PageHeader } from "@/components/shared/page"
import { UserAvatar } from "@/components/shell/user-menu"
import { ConfirmDialog, QueryError, TeamDot, useDebounced, useDialogTarget } from "@/components/admin/common"
import { AddUserDialog, EditUserSheet, RoleBadge } from "@/components/admin/user-forms"
import { api, errorMessage } from "@/lib/api"
import { dateTime, shortDate } from "@/lib/format"
import { qk, useMe, useTeams } from "@/lib/hooks"
import type { Role, User } from "@/lib/types"

const TABS: { value: "all" | Role; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admins" },
  { value: "agent", label: "Agents" },
  { value: "team_member", label: "Team" },
  { value: "customer", label: "Customers" },
]

export default function UsersPage() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: teams } = useTeams()
  const [role, setRole] = useState<"all" | Role>("all")
  const [search, setSearch] = useState("")
  const q = useDebounced(search.trim(), 300)
  const [addOpen, setAddOpen] = useState(false)
  const editing = useDialogTarget<User>()
  const deactivating = useDialogTarget<User>()
  const [pendingId, setPendingId] = useState<number | null>(null)

  const filters = { role: role === "all" ? undefined : role, q: q || undefined }
  const users = useQuery({
    queryKey: qk.users(filters),
    queryFn: () => api.get<User[]>("/users", filters),
    placeholderData: keepPreviousData,
  })

  const setActive = useMutation({
    mutationFn: ({ user, active }: { user: User; active: boolean }) => api.patch<User>(`/users/${user.id}`, { is_active: active }),
    onMutate: ({ user }) => setPendingId(user.id),
    onSuccess: (u) => {
      toast.success(u.is_active ? "User reactivated" : "User deactivated", { description: u.full_name })
      qc.invalidateQueries({ queryKey: qk.users() })
      qc.invalidateQueries({ queryKey: qk.teams })
    },
    onError: (err) => toast.error("Couldn't change access", { description: errorMessage(err) }),
    onSettled: () => setPendingId(null),
  })

  const deactivate = useMutation({
    mutationFn: (user: User) => api.delete(`/users/${user.id}`),
    onSuccess: (_, user) => {
      toast.success("User deactivated", { description: `${user.full_name} can no longer log in.` })
      qc.invalidateQueries({ queryKey: qk.users() })
      qc.invalidateQueries({ queryKey: qk.teams })
      deactivating.close()
    },
    onError: (err) => toast.error("Couldn't deactivate the user", { description: errorMessage(err) }),
  })

  const columns: ColumnDef<User, unknown>[] = [
    {
      accessorKey: "full_name",
      header: "User",
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex min-w-48 items-center gap-3">
            <UserAvatar name={u.full_name} className={u.is_active ? undefined : "opacity-50"} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={u.is_active ? "truncate font-medium" : "text-muted-foreground truncate font-medium line-through decoration-1"}>
                  {u.full_name}
                </span>
                {u.id === me?.id ? (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    You
                  </Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground truncate text-xs">{u.email}</div>
            </div>
          </div>
        )
      },
    },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <RoleBadge role={row.original.role} /> },
    {
      accessorKey: "team_name",
      header: "Team",
      cell: ({ row }) => {
        const u = row.original
        if (!u.team_key) return <span className="text-muted-foreground text-sm">—</span>
        const team = teams?.find((t) => t.key === u.team_key)
        return (
          <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
            <TeamDot color={team?.color} />
            {u.team_name ?? team?.name ?? u.team_key}
          </span>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: "Active",
      cell: ({ row }) => {
        const u = row.original
        const self = u.id === me?.id
        const pending = pendingId === u.id
        const control = (
          <div className="flex items-center gap-2">
            <Switch
              checked={u.is_active}
              disabled={self || pending}
              onCheckedChange={(v) => setActive.mutate({ user: u, active: v })}
              aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.full_name}`}
            />
            {pending ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
          </div>
        )
        return self ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{control}</span>
            </TooltipTrigger>
            <TooltipContent>You can&apos;t deactivate yourself</TooltipContent>
          </Tooltip>
        ) : (
          control
        )
      },
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground text-sm whitespace-nowrap tabular-nums">{shortDate(row.original.created_at)}</span>
          </TooltipTrigger>
          <TooltipContent>{dateTime(row.original.created_at)}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const u = row.original
        const self = u.id === me?.id
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.full_name}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => editing.show(u)}>
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {u.is_active ? (
                  <DropdownMenuItem variant="destructive" disabled={self} onSelect={() => deactivating.show(u)}>
                    <UserX className="size-4" /> {self ? "Can't deactivate yourself" : "Deactivate"}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setActive.mutate({ user: u, active: true })}>
                    <UserCheck className="size-4" /> Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const count = users.data?.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Accounts, roles and team membership. Deactivated users keep their history but can't log in."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" /> Add user
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={role} onValueChange={(v) => setRole(v as "all" | Role)}>
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <div className="flex items-center gap-3">
          {count !== undefined ? (
            <span className="text-muted-foreground hidden text-sm whitespace-nowrap tabular-nums sm:inline">
              {count.toLocaleString()} user{count === 1 ? "" : "s"}
            </span>
          ) : null}
          <div className="relative w-full md:w-72">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              className="pr-9 pl-8"
            />
            {users.isFetching && !users.isLoading ? (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
            ) : search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {users.isError ? (
        <QueryError error={users.error} onRetry={() => users.refetch()} title="Couldn't load users" />
      ) : (
        <DataTable
          columns={columns}
          data={users.data}
          loading={users.isLoading}
          rowClassName={(u) => (u.is_active ? undefined : "bg-muted/30")}
          empty={
            q || role !== "all"
              ? {
                  icon: Search,
                  title: "No users match",
                  description: "Try another search or role filter.",
                  action: (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("")
                        setRole("all")
                      }}
                    >
                      Clear filters
                    </Button>
                  ),
                }
              : {
                  icon: Users,
                  title: "No users yet",
                  description: "Add agents, team members and admins to start working tickets.",
                  action: (
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      <UserPlus className="size-4" /> Add user
                    </Button>
                  ),
                }
          }
        />
      )}

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditUserSheet
        user={editing.target}
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        isSelf={editing.target?.id === me?.id}
      />
      <ConfirmDialog
        open={deactivating.open}
        onOpenChange={deactivating.onOpenChange}
        title={`Deactivate ${deactivating.target?.full_name ?? "user"}?`}
        description={
          <>
            <p>
              They can no longer sign in. Their tickets, decisions and replies stay in the history, and tickets
              assigned to them keep the assignment until someone reassigns them.
            </p>
            <p>You can reactivate the account later.</p>
          </>
        }
        confirmLabel="Deactivate"
        icon={UserX}
        loading={deactivate.isPending}
        onConfirm={() => deactivating.target && deactivate.mutate(deactivating.target)}
      />
    </div>
  )
}
