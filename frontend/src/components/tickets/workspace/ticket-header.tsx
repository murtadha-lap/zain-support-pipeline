"use client"

import { ArrowLeft, CalendarClock, Loader2, Mail, UserMinus, UserPlus, Users } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChannelBadge, PriorityBadge, StatusBadge } from "@/components/shared/badges"
import { UserAvatar } from "@/components/shell/user-menu"
import { isFinished } from "@/components/tickets/lib"
import { CopyButton, SyntheticBadge, TimeAgo, useAssign } from "@/components/tickets/ticket-bits"
import type { TicketDetail, User } from "@/lib/types"

export function TicketHeader({
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
  const assign = useAssign(ticket.id)
  const mine = ticket.assignee_id === me.id
  const customerName = ticket.customer?.full_name ?? ticket.customer_name ?? "Unknown customer"
  const finished = isFinished(ticket.status)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={backHref} aria-label={`Back to ${backLabel}`}>
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to {backLabel}</TooltipContent>
        </Tooltip>
        <h1 className="font-mono text-xl font-semibold tracking-tight">{ticket.ref}</h1>
        <CopyButton text={ticket.ref} label="Copy reference" />
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.is_synthetic ? <SyntheticBadge /> : null}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <ChannelBadge channel={ticket.channel} />
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          <TimeAgo value={ticket.created_at} className="text-sm" />
        </span>

        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="text-foreground decoration-muted-foreground/50 hover:decoration-foreground inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-4"
            >
              <UserAvatar name={customerName} className="size-5 rounded-md text-[10px]" />
              {customerName}
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-72">
            <div className="flex gap-3">
              <UserAvatar name={customerName} className="size-10" />
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{customerName}</p>
                {ticket.customer?.email ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={`mailto:${ticket.customer.email}`}
                      className="text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1.5 text-sm"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{ticket.customer.email}</span>
                    </a>
                    <CopyButton text={ticket.customer.email} label="Copy email" />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {ticket.is_synthetic ? "Synthetic ticket, no customer account." : "No account details."}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Customer · wrote via <ChannelBadge channel={ticket.channel} />
                </p>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        {ticket.team_name ? (
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {ticket.team_name}
          </span>
        ) : null}

        <div className="inline-flex items-center gap-2">
          {ticket.assignee_name ? (
            <span className="text-foreground inline-flex items-center gap-1.5">
              <UserAvatar name={ticket.assignee_name} className="size-5 rounded-md text-[10px]" />
              {mine ? "You" : ticket.assignee_name}
            </span>
          ) : (
            <span>Unassigned</span>
          )}
          {!finished && !mine ? (
            <Button
              variant="outline"
              size="xs"
              disabled={assign.isPending}
              onClick={() => assign.mutate(me.id)}
            >
              {assign.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {ticket.assignee_id ? "Take over" : "Assign to me"}
            </Button>
          ) : null}
          {ticket.assignee_id && (mine || me.role === "admin") ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={assign.isPending}
              onClick={() => assign.mutate(null)}
            >
              {assign.isPending ? <Loader2 className="animate-spin" /> : <UserMinus />}
              Unassign
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
