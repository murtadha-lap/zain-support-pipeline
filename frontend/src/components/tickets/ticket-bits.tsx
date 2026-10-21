"use client"

import { useMutation } from "@tanstack/react-query"
import { Check, Copy, FlaskConical, Loader2, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FlagBadge } from "@/components/shared/badges"
import { UserAvatar } from "@/components/shell/user-menu"
import { copyText, useTicketInvalidation } from "@/components/tickets/lib"
import { api, errorMessage } from "@/lib/api"
import { dateTime, timeAgo } from "@/lib/format"
import { useLabel, useMe } from "@/lib/hooks"
import type { Flag, TicketDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

export function FlagList({ flags, max = 2 }: { flags: Flag[]; max?: number }) {
  const label = useLabel()
  if (!flags.length) return null
  const shown = flags.slice(0, max)
  const rest = flags.slice(max)
  return (
    <>
      {shown.map((f) => (
        <FlagBadge key={f} flag={f} />
      ))}
      {rest.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-default font-normal tabular-nums" tabIndex={0}>
              +{rest.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <ul className="space-y-0.5">
              {rest.map((f) => (
                <li key={f}>{label("flags", f)}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  )
}

export function TimeAgo({ value, className }: { value: string | null | undefined; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value ?? undefined} className={cn("text-muted-foreground text-xs whitespace-nowrap tabular-nums", className)}>
          {timeAgo(value)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{dateTime(value)}</TooltipContent>
    </Tooltip>
  )
}

export function SyntheticBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("text-muted-foreground gap-1 font-normal", className)}>
          <FlaskConical className="size-3" /> Synthetic
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">Uploaded or generated test ticket, not from a real customer.</TooltipContent>
    </Tooltip>
  )
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("text-muted-foreground", className)}
          aria-label={label}
          onClick={async (e) => {
            e.stopPropagation()
            if (await copyText(text)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } else {
              toast.error("Could not copy to the clipboard")
            }
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  )
}

export function useAssign(ticketId: number) {
  const invalidate = useTicketInvalidation()
  return useMutation({
    mutationFn: (userId: number | null) => api.post<TicketDetail>(`/tickets/${ticketId}/assign`, { user_id: userId }),
    onSuccess: (data, userId) => {
      invalidate(ticketId, data)
      toast.success(userId === null ? `Unassigned ${data.ref}` : `${data.ref} is assigned to you`)
    },
    onError: (err) => toast.error("Could not change the assignee", { description: errorMessage(err) }),
  })
}

// Inline "Assign to me" for list rows; never triggers the row click.
export function AssignToMeButton({ ticketId, className }: { ticketId: number; className?: string }) {
  const { data: me } = useMe()
  const assign = useAssign(ticketId)
  return (
    <Button
      variant="outline"
      size="xs"
      className={cn("gap-1", className)}
      disabled={!me || assign.isPending}
      onClick={(e) => {
        e.stopPropagation()
        if (me) assign.mutate(me.id)
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {assign.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
      Assign to me
    </Button>
  )
}

export function AssigneeAvatar({ name, isMe }: { name: string; isMe?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0} aria-label={`Assigned to ${name}`}>
          <UserAvatar name={name} className={cn("size-7", isMe && "ring-primary/50 ring-2")} />
        </span>
      </TooltipTrigger>
      <TooltipContent>Assigned to {isMe ? `you (${name})` : name}</TooltipContent>
    </Tooltip>
  )
}
