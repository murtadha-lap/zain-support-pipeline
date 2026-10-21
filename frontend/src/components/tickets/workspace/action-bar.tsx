"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Cloud,
  Cpu,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Route,
  Send,
  Star,
  Undo2,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChannelBadge } from "@/components/shared/badges"
import { UserAvatar } from "@/components/shell/user-menu"
import {
  copyText,
  DRAFT_WORD_LIMIT,
  isFinished,
  isReviewer,
  isTriaging,
  sameDraft,
  useTicketInvalidation,
  wordCount,
} from "@/components/tickets/lib"
import { Markdown } from "@/components/tickets/markdown"
import type { useDraft } from "@/components/tickets/workspace/use-draft"
import { api, errorMessage } from "@/lib/api"
import { qk, useLabel, useTeams } from "@/lib/hooks"
import type { ModelConfig, RoutingRule, TicketDetail, User } from "@/lib/types"
import { cn } from "@/lib/utils"

type Draft = ReturnType<typeof useDraft>

interface Props {
  ticket: TicketDetail
  me: User
  draft: Draft
  backHref: string
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-background/20 border-background/30 ml-1.5 rounded border px-1 font-mono text-[10px]">{children}</kbd>
  )
}

// Button that explains, in a tooltip, why it is disabled.
function ActionButton({
  disabledReason,
  tooltip,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { disabledReason?: string | null; tooltip?: React.ReactNode }) {
  const disabled = !!disabledReason || props.disabled
  const tip = disabledReason ?? tooltip
  const button = <Button {...props} disabled={disabled}>{children}</Button>
  if (!tip) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span tabIndex={0} className="inline-flex rounded-md">
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

export function ActionBar({ ticket, me, draft, backHref }: Props) {
  const router = useRouter()
  const invalidate = useTicketInvalidation()
  const label = useLabel()
  const reviewer = isReviewer(me.role)
  const triaging = isTriaging(ticket.status)
  const finished = isFinished(ticket.status)
  const statusLabel = label("statuses", ticket.status).toLowerCase()

  const [approveOpen, setApproveOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  const triagingReason = triaging ? "Ticket is still being triaged" : null
  const finishedReason = finished ? `Ticket is already ${statusLabel}` : null
  const approveReason =
    triagingReason ?? finishedReason ?? (draft.draft.trim() === "" ? "Write a reply before approving" : null)
  const routeReason = triagingReason ?? finishedReason
  const sendBackReason =
    triagingReason ??
    finishedReason ??
    (ticket.status !== "routed" ? "Only tickets in your team queue can be sent back" : null)
  const closeReason = ticket.status === "processing" ? "Ticket is still being triaged" : finishedReason
  const retriageReason =
    ticket.status === "processing" ? "Triage is already running" : finished ? `Ticket is already ${statusLabel}` : null

  // Ctrl/Cmd+Enter opens the approve dialog (capture phase, before the editor sees it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !approveReason) {
        if (document.querySelector("[role=dialog],[role=alertdialog]")) return
        e.preventDefault()
        e.stopPropagation()
        setApproveOpen(true)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [approveReason])

  // Re-run triage with a chosen model.
  const { data: models } = useQuery({
    queryKey: qk.models,
    queryFn: () => api.get<ModelConfig[]>("/models"),
    enabled: reviewer,
    staleTime: 60_000,
  })
  const retriage = useMutation({
    mutationFn: (model: ModelConfig) =>
      api.post<TicketDetail>(`/tickets/${ticket.id}/retriage`, { model_config_id: model.id }),
    onMutate: (model) => ({ toastId: toast.loading(`Re-running triage with ${model.name}…`) }),
    onSuccess: (data, model, ctx) => {
      draft.adopt(data.draft_md)
      invalidate(ticket.id, data)
      const outcome =
        data.status === "routed" ? `routed to ${data.team_name ?? "a team"}` : data.status === "escalated" ? "escalated" : data.status
      toast.success(`Triage finished with ${model.name}`, { id: ctx?.toastId, description: `The ticket was ${outcome}.` })
    },
    onError: (err, _model, ctx) =>
      toast.error("Re-triage failed", { id: ctx?.toastId, description: errorMessage(err) }),
  })

  const close = useMutation({
    mutationFn: (note: string) => api.post<TicketDetail>(`/tickets/${ticket.id}/close`, { note: note || undefined }),
    onSuccess: (data) => {
      draft.markClean()
      invalidate(ticket.id, data)
      setCloseOpen(false)
      toast.success(`${data.ref} closed`, { description: "Nothing was sent to the customer." })
    },
    onError: (err) => toast.error("Could not close the ticket", { description: errorMessage(err) }),
  })

  const enabledModels = (models ?? []).filter((m) => m.enabled)

  return (
    <>
      <div className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border p-2.5 shadow-lg backdrop-blur">
        <ActionButton
          disabledReason={approveReason}
          tooltip={
            <span>
              Review and send the reply <Kbd>Ctrl</Kbd>
              <Kbd>Enter</Kbd>
            </span>
          }
          onClick={() => setApproveOpen(true)}
        >
          <Send /> Approve &amp; send
        </ActionButton>

        {reviewer ? (
          <ActionButton
            variant="outline"
            disabledReason={routeReason}
            tooltip="Send the ticket to a team queue"
            onClick={() => setRouteOpen(true)}
          >
            <Route /> Route to team
          </ActionButton>
        ) : null}

        {me.role === "team_member" ? (
          <ActionButton
            variant="outline"
            disabledReason={sendBackReason}
            tooltip="Return the ticket to the human agents with a note"
            onClick={() => setSendBackOpen(true)}
          >
            <Undo2 /> Send back to agents
          </ActionButton>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <ActionButton
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabledReason={closeReason}
            tooltip="Close without replying"
            onClick={() => setCloseOpen(true)}
          >
            <XCircle /> Close
          </ActionButton>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    {retriage.isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="w-60">
              {reviewer && (retriageReason || retriage.isPending) ? (
                <DropdownMenuItem disabled className="items-start">
                  <RefreshCw className="mt-0.5" />
                  <div>
                    <div>Re-run triage</div>
                    <div className="text-muted-foreground text-xs">{retriage.isPending ? "Running…" : retriageReason}</div>
                  </div>
                </DropdownMenuItem>
              ) : reviewer ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <RefreshCw /> Re-run triage
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                      Runs the pipeline again and replaces the AI draft
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {models === undefined ? (
                      <DropdownMenuItem disabled>
                        <Loader2 className="animate-spin" /> Loading models…
                      </DropdownMenuItem>
                    ) : enabledModels.length === 0 ? (
                      <DropdownMenuItem disabled>No enabled models</DropdownMenuItem>
                    ) : (
                      enabledModels.map((m) => {
                        const missingKey = m.is_cloud && !m.has_api_key
                        return (
                          <DropdownMenuItem
                            key={m.id}
                            disabled={missingKey}
                            onSelect={() => retriage.mutate(m)}
                            className="items-start"
                          >
                            {m.is_cloud ? <Cloud className="mt-0.5" /> : <Cpu className="mt-0.5" />}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{m.name}</span>
                                {m.is_default ? <Star className="text-warning fill-warning size-3" aria-label="Default" /> : null}
                              </div>
                              <div className="text-muted-foreground truncate text-xs">
                                {label("providers", m.provider)}
                                {missingKey ? " · API key not set" : ` · ${m.model_id}`}
                              </div>
                            </div>
                            {m.is_cloud ? (
                              <Badge variant="outline" className="border-info/30 text-info ml-auto h-5 text-[10px]">
                                Cloud
                              </Badge>
                            ) : null}
                          </DropdownMenuItem>
                        )
                      })
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              <DropdownMenuItem
                onSelect={async () => {
                  const ok = await copyText(`${window.location.origin}/app/tickets/${ticket.id}`)
                  if (ok) toast.success("Ticket link copied")
                  else toast.error("Could not copy the link")
                }}
              >
                <Link2 /> Copy ticket link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        ticket={ticket}
        draft={draft}
        onDone={() => router.push(backHref)}
      />
      {reviewer ? <RouteDialog open={routeOpen} onOpenChange={setRouteOpen} ticket={ticket} /> : null}
      {me.role === "team_member" ? (
        <SendBackDialog
          open={sendBackOpen}
          onOpenChange={setSendBackOpen}
          ticket={ticket}
          onDone={() => router.push(backHref)}
        />
      ) : null}
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        pending={close.isPending}
        onConfirm={(note) => close.mutate(note)}
        refLabel={ticket.ref}
      />
    </>
  )
}

function ApproveDialog({
  open,
  onOpenChange,
  ticket,
  draft,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: TicketDetail
  draft: Draft
  onDone: () => void
}) {
  const invalidate = useTicketInvalidation()
  const [note, setNote] = useState("")
  const words = wordCount(draft.draft)
  const edited = ticket.ai_draft.trim() !== "" && !sameDraft(draft.draft, ticket.ai_draft)
  const recipient = ticket.customer?.full_name ?? ticket.customer_name ?? "the customer"

  useEffect(() => {
    if (open) setNote("")
  }, [open])

  const approve = useMutation({
    mutationFn: () =>
      api.post<TicketDetail>(`/tickets/${ticket.id}/approve`, { draft_md: draft.draft, note: note.trim() || undefined }),
    onMutate: () => draft.markClean(),
    onSuccess: (data) => {
      invalidate(ticket.id, data)
      onOpenChange(false)
      toast.success(`Reply sent to ${recipient}`, { description: `${data.ref} is resolved.` })
      onDone()
    },
    onError: (err) => toast.error("The reply was not sent", { description: errorMessage(err) }),
  })

  return (
    <AlertDialog open={open} onOpenChange={(o) => !approve.isPending && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Send this reply to {recipient}?</AlertDialogTitle>
          <AlertDialogDescription>
            This sends the reply to the customer. Nothing is sent until you confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2">
              <UserAvatar name={recipient} className="size-6" />
              <span className="font-medium">{recipient}</span>
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1">
              via <ChannelBadge channel={ticket.channel} />
            </span>
            <span
              className={cn(
                "text-muted-foreground tabular-nums",
                words > DRAFT_WORD_LIMIT && "text-warning-foreground dark:text-warning font-medium",
              )}
            >
              {words} words{words > DRAFT_WORD_LIMIT ? ` · over ${DRAFT_WORD_LIMIT}` : ""}
            </span>
            <Badge variant="outline" className={cn("font-normal", edited ? "border-primary/30 text-primary" : "text-muted-foreground")}>
              {edited ? "Edited from AI draft" : "Unedited AI draft"}
            </Badge>
          </div>

          <div className="bg-muted/40 rounded-xl border p-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">What the customer sees</p>
            <div className="bg-card max-h-72 overflow-y-auto rounded-2xl rounded-tl-sm border px-4 py-3 shadow-xs">
              <Markdown size="base">{draft.draft}</Markdown>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="approve-note" className="text-sm">
              Internal note <span className="text-muted-foreground font-normal">(optional, not sent)</span>
            </Label>
            <Input
              id="approve-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Checked the transfer in the core system"
              maxLength={500}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={approve.isPending}>Cancel</AlertDialogCancel>
          <Button onClick={() => approve.mutate()} disabled={approve.isPending || !draft.draft.trim()}>
            {approve.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {approve.isPending ? "Sending…" : "Approve & send"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RouteDialog({
  open,
  onOpenChange,
  ticket,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: TicketDetail
}) {
  const invalidate = useTicketInvalidation()
  const label = useLabel()
  const { data: teams } = useTeams()
  const { data: routing } = useQuery({
    queryKey: qk.routing,
    queryFn: () => api.get<RoutingRule[]>("/routing"),
    staleTime: 60_000,
    enabled: open,
  })
  const ruleTeam = routing?.find((r) => r.category === ticket.category)?.team_key
  const [team, setTeam] = useState<string>("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (open) {
      setTeam(ruleTeam ?? ticket.team_key ?? "")
      setNote("")
    }
  }, [open, ruleTeam, ticket.team_key])

  const route = useMutation({
    mutationFn: () =>
      api.post<TicketDetail>(`/tickets/${ticket.id}/route`, { team_key: team || undefined, note: note.trim() || undefined }),
    onSuccess: (data) => {
      invalidate(ticket.id, data)
      onOpenChange(false)
      toast.success(`Routed to ${data.team_name ?? "the team"}`, {
        description: "The team will review the draft and reply.",
      })
    },
    onError: (err) => toast.error("Could not route the ticket", { description: errorMessage(err) }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !route.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Route to a team</DialogTitle>
          <DialogDescription>
            The ticket leaves the review queue and lands in the team&apos;s queue with the current labels and draft.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (team) route.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="route-team">Team</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger id="route-team" className="w-full">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    <span className="size-2 rounded-full" style={{ background: t.color }} aria-hidden />
                    {t.name}
                    {t.key === ruleTeam ? <span className="text-muted-foreground text-xs">· routing table</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {ruleTeam
                ? `The routing table sends “${label("categories", ticket.category)}” to ${teams?.find((t) => t.key === ruleTeam)?.name ?? ruleTeam}.`
                : "No category yet, so there is no routing-table default."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="route-note">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="route-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the team should know"
              rows={3}
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={route.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!team || route.isPending}>
              {route.isPending ? <Loader2 className="animate-spin" /> : <Route />}
              Route ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SendBackDialog({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: TicketDetail
  onDone: () => void
}) {
  const invalidate = useTicketInvalidation()
  const [note, setNote] = useState("")
  useEffect(() => {
    if (open) setNote("")
  }, [open])
  const valid = note.trim().length >= 3

  const escalate = useMutation({
    mutationFn: () => api.post<TicketDetail>(`/tickets/${ticket.id}/escalate`, { note: note.trim() }),
    onSuccess: (data) => {
      invalidate(ticket.id, data)
      onOpenChange(false)
      toast.success(`${data.ref} sent back to the agents`)
      onDone()
    },
    onError: (err) => toast.error("Could not send the ticket back", { description: errorMessage(err) }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !escalate.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send back to agents</DialogTitle>
          <DialogDescription>
            Use this when the ticket is not for your team or needs a human agent first. It goes to the review queue
            with your note.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) escalate.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sendback-note">Why are you sending it back?</Label>
            <Textarea
              id="sendback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. This is a card issue, not a transfer"
              rows={4}
              maxLength={1000}
              aria-invalid={note.length > 0 && !valid}
              autoFocus
            />
            <p className="text-muted-foreground text-xs">Required. The agents see this note on the ticket.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={escalate.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || escalate.isPending}>
              {escalate.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Send back
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CloseDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
  refLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: (note: string) => void
  refLabel: string
}) {
  const [note, setNote] = useState("")
  useEffect(() => {
    if (open) setNote("")
  }, [open])
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close {refLabel} without replying?</AlertDialogTitle>
          <AlertDialogDescription>
            The customer gets no reply. Use it for spam, duplicates or requests that were handled elsewhere. The ticket
            reopens if the customer writes again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="close-note">
            Note <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="close-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Duplicate of ZS-000041"
            rows={3}
            maxLength={1000}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => onConfirm(note.trim())}>
            {pending ? <Loader2 className="animate-spin" /> : <XCircle />}
            Close ticket
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
