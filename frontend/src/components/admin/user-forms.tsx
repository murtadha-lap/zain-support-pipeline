"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Save, UserPlus } from "lucide-react"
import { useState } from "react"
import { useForm, useWatch, type Control, type FieldValues, type Path } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { UserAvatar } from "@/components/shell/user-menu"
import { LoadingButton, TeamDot } from "@/components/admin/common"
import { api, errorMessage } from "@/lib/api"
import { qk, useMeta, useTeams } from "@/lib/hooks"
import type { Role, User } from "@/lib/types"
import { cn } from "@/lib/utils"

const ROLES = ["admin", "agent", "team_member", "customer"] as const

export const ROLE_TONE: Record<Role, string> = {
  admin: "border-primary/30 bg-primary/10 text-primary",
  agent: "border-info/30 bg-info/10 text-info",
  team_member: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  customer: "border-border bg-muted text-muted-foreground",
}

const ROLE_HINT: Record<Role, string> = {
  admin: "Manages models, batches, users, teams and settings.",
  agent: "Reviews escalated tickets the model wasn't sure about.",
  team_member: "Works the queue of one team.",
  customer: "Uses the customer portal to open tickets.",
}

export function RoleBadge({ role }: { role: Role }) {
  const { data: meta } = useMeta()
  const label = meta?.roles.find((r) => r.key === role)?.label ?? role.replace(/_/g, " ")
  return (
    <Badge variant="outline" className={cn("font-medium", ROLE_TONE[role])}>
      {label}
    </Badge>
  )
}

function useRoleLabel() {
  const { data: meta } = useMeta()
  return (r: Role) => meta?.roles.find((o) => o.key === r)?.label ?? r.replace(/_/g, " ")
}

/* Shared fields --------------------------------------------------------- */

function RoleField<T extends FieldValues>({ control, name, disabled }: { control: Control<T>; name: Path<T>; disabled?: boolean }) {
  const roleLabel = useRoleLabel()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Role</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
            </FormControl>
            <SelectContent position="popper">
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{disabled ? "You can't change your own role." : ROLE_HINT[field.value as Role] ?? ""}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function TeamField<T extends FieldValues>({ control, name }: { control: Control<T>; name: Path<T> }) {
  const { data: teams, isLoading } = useTeams()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Team</FormLabel>
          <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isLoading}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={isLoading ? "Loading teams…" : "Choose a team"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent position="popper">
              {(teams ?? []).map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  <TeamDot color={t.color} />
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>Team members see only this team&apos;s queue.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} autoComplete="new-password" className="pr-10" {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground absolute top-0.5 right-0.5"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  )
}

/* Add user -------------------------------------------------------------- */

const createSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter the full name").max(120),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "At least 8 characters").max(128),
    role: z.enum(ROLES),
    team_key: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "team_member" && !v.team_key) ctx.addIssue({ code: "custom", path: ["team_key"], message: "Team members need a team" })
  })
type CreateValues = z.infer<typeof createSchema>

export function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a staff or customer account. Share the password with them securely.</DialogDescription>
        </DialogHeader>
        <AddUserForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { full_name: "", email: "", password: "", role: "agent", team_key: "" },
    mode: "onChange",
  })
  const role = useWatch({ control: form.control, name: "role" })

  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      api.post<User>("/users", {
        full_name: v.full_name.trim(),
        email: v.email.trim().toLowerCase(),
        password: v.password,
        role: v.role,
        team_key: v.role === "team_member" ? v.team_key : undefined,
      }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: qk.users() })
      qc.invalidateQueries({ queryKey: qk.teams })
      toast.success("User added", { description: `${u.full_name} · ${u.email}` })
      onDone()
    },
    onError: (err) => toast.error("Couldn't add the user", { description: errorMessage(err) }),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-4">
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoFocus autoComplete="off" placeholder="e.g. Zahraa Kareem" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" placeholder="name@company.iq" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder="At least 8 characters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <RoleField control={form.control} name="role" />
        {role === "team_member" ? <TeamField control={form.control} name="team_key" /> : null}
        <DialogFooter className="pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <LoadingButton type="submit" loading={create.isPending} disabled={!form.formState.isValid} icon={UserPlus}>
            Add user
          </LoadingButton>
        </DialogFooter>
      </form>
    </Form>
  )
}

/* Edit user ------------------------------------------------------------- */

const editSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter the full name").max(120),
    role: z.enum(ROLES),
    team_key: z.string(),
    is_active: z.boolean(),
    password: z.string().refine((v) => v === "" || v.length >= 8, "At least 8 characters, or leave empty"),
  })
  .superRefine((v, ctx) => {
    if (v.role === "team_member" && !v.team_key) ctx.addIssue({ code: "custom", path: ["team_key"], message: "Team members need a team" })
  })
type EditValues = z.infer<typeof editSchema>

export function EditUserSheet({
  user,
  open,
  onOpenChange,
  isSelf,
}: {
  user: User | null
  open: boolean
  onOpenChange: (o: boolean) => void
  isSelf: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Edit user</SheetTitle>
          <SheetDescription>Change the name, role, team or access. Leave the password empty to keep it.</SheetDescription>
        </SheetHeader>
        {user ? <EditUserForm key={user.id} user={user} isSelf={isSelf} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function EditUserForm({ user, isSelf, onDone }: { user: User; isSelf: boolean; onDone: () => void }) {
  const qc = useQueryClient()
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      full_name: user.full_name,
      role: user.role,
      team_key: user.team_key ?? "",
      is_active: user.is_active,
      password: "",
    },
    mode: "onChange",
  })
  const role = useWatch({ control: form.control, name: "role" })

  const save = useMutation({
    mutationFn: (v: EditValues) => {
      const body: Record<string, unknown> = {}
      if (v.full_name.trim() !== user.full_name) body.full_name = v.full_name.trim()
      if (v.role !== user.role) body.role = v.role
      const team = v.role === "team_member" ? v.team_key : null
      if (team !== user.team_key) body.team_key = team
      if (v.is_active !== user.is_active) body.is_active = v.is_active
      if (v.password) body.password = v.password
      return api.patch<User>(`/users/${user.id}`, body)
    },
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: qk.users() })
      qc.invalidateQueries({ queryKey: qk.teams })
      if (isSelf) qc.invalidateQueries({ queryKey: qk.me })
      toast.success("User updated", { description: u.full_name })
      onDone()
    },
    onError: (err) => toast.error("Couldn't update the user", { description: errorMessage(err) }),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-3">
            <UserAvatar name={user.full_name} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="text-muted-foreground text-xs">Email can&apos;t be changed</p>
            </div>
          </div>
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RoleField control={form.control} name="role" disabled={isSelf} />
          {role === "team_member" ? <TeamField control={form.control} name="team_key" /> : null}
          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <FormLabel>Active</FormLabel>
                  <FormDescription>{isSelf ? "You can't deactivate yourself." : "Inactive users can't log in. Their history is kept."}</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  New password <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <PasswordInput placeholder="Leave empty to keep the current one" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <LoadingButton
            type="submit"
            loading={save.isPending}
            disabled={!form.formState.isValid || !form.formState.isDirty}
            icon={Save}
          >
            Save changes
          </LoadingButton>
        </SheetFooter>
      </form>
    </Form>
  )
}
