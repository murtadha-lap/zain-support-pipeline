"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, FileQuestion, Hourglass, Loader2, Send } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ChannelBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/page"
import { markSeen, portalStage, PortalStatusBadge, StatusStepper } from "@/components/portal/portal-status"
import { ChatBubble, SystemNote } from "@/components/tickets/conversation"
import { CopyButton } from "@/components/tickets/ticket-bits"
import { useTicketInvalidation } from "@/components/tickets/lib"
import { Markdown } from "@/components/tickets/markdown"
import { api, ApiError, errorMessage } from "@/lib/api"
import { dateTime } from "@/lib/format"
import { qk, useMe } from "@/lib/hooks"
import type { TicketDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX = 4000

export default function PortalTicketPage() {
  const { id } = useParams<{ id: string }>()
  const { data: me } = useMe()
  const invalidate = useTicketInvalidation()
  const [reply, setReply] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: qk.ticket(id),
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
    refetchInterval: 5000,
  })

  const messageCount = ticket?.messages.length ?? 0
  useEffect(() => {
    if (ticket) markSeen(ticket.id, ticket.updated_at)
  }, [ticket])
  useEffect(() => {
    if (messageCount > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messageCount])

  const send = useMutation({
    mutationFn: (body: string) => api.post<TicketDetail>(`/tickets/${id}/messages`, { body }),
    onSuccess: (data) => {
      invalidate(id, data)
      setReply("")
      toast.success("Message sent", {
        description: portalStage(ticket?.status ?? "new") !== portalStage(data.status) ? "Your request is open again." : undefined,
      })
    },
    onError: (err) => toast.error("Your message was not sent", { description: errorMessage(err) }),
  })

  if (isLoading) return <PortalTicketSkeleton />

  if (error || !ticket) {
    const status = error instanceof ApiError ? error.status : 0
    return (
      <EmptyState
        icon={FileQuestion}
        title={status === 404 || status === 403 ? "Request not found" : "Could not load this request"}
        description={status === 404 || status === 403 ? "It may belong to another account, or the link is wrong." : errorMessage(error)}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/portal">Back to my requests</Link>
          </Button>
        }
        className="bg-card"
      />
    )
  }

  const stage = portalStage(ticket.status)
  const trimmed = reply.trim()
  const canSend = trimmed.length > 0 && trimmed.length <= MAX && !send.isPending
  const myName = me?.full_name ?? ticket.customer?.full_name ?? "You"

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/portal">
            <ArrowLeft /> My requests
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold tracking-tight">{ticket.ref}</h1>
          <CopyButton text={ticket.ref} label="Copy reference" />
          <PortalStatusBadge status={ticket.status} />
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>Sent {dateTime(ticket.created_at)}</span>
          <ChannelBadge channel={ticket.channel} />
        </p>
      </div>

      <Card className="py-5">
        <CardContent className="px-5">
          <StatusStepper status={ticket.status} />
        </CardContent>
      </Card>

      <section className="space-y-4" aria-label="Conversation">
        <ChatBubble author={myName} time={ticket.created_at} side="end" tone="primary">
          <p dir="auto" className="font-arabic text-start text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {ticket.text}
          </p>
        </ChatBubble>

        {ticket.messages.map((m) =>
          m.author_type === "system" ? (
            <SystemNote key={m.id} message={m} />
          ) : m.author_type === "customer" ? (
            <ChatBubble key={m.id} author={m.author_name || myName} time={m.created_at} side="end" tone="primary">
              <Markdown>{m.body_md}</Markdown>
            </ChatBubble>
          ) : (
            <ChatBubble
              key={m.id}
              author={m.author_name || "Support team"}
              time={m.created_at}
              side="start"
              tone="neutral"
              label={<span className="text-success">Support</span>}
            >
              <Markdown size="base">{m.body_md}</Markdown>
            </ChatBubble>
          ),
        )}

        {stage === "received" || stage === "review" ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-2 text-sm">
            {stage === "received" ? <Loader2 className="size-4 animate-spin" /> : <Hourglass className="size-4" />}
            {stage === "received"
              ? "We received your request and are sorting it to the right team."
              : "A specialist is reviewing your request. Our reply will appear here."}
          </div>
        ) : null}
        <div ref={endRef} />
      </section>

      <Card className="sticky bottom-4 gap-3 py-4 shadow-lg">
        <CardContent className="space-y-3 px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (canSend) send.mutate(trimmed)
            }}
            className="space-y-2"
          >
            <label htmlFor="reply" className="sr-only">
              Write a message
            </label>
            <Textarea
              id="reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              dir="auto"
              rows={3}
              placeholder={stage === "answered" || stage === "closed" ? "Still need help? Write to us… اكتب رسالتك" : "Add more details… اكتب رسالتك"}
              className="font-arabic max-h-60 resize-none text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  if (canSend) send.mutate(trimmed)
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {stage === "answered" || stage === "closed"
                  ? "Replying reopens this request."
                  : "Never share your PIN or verification code."}
                <span className="hidden sm:inline"> · Ctrl+Enter to send</span>
              </p>
              <div className="flex items-center gap-3">
                <span className={cn("text-muted-foreground text-xs tabular-nums", trimmed.length > MAX && "text-destructive")}>
                  {trimmed.length > 0 ? `${trimmed.length} / ${MAX}` : null}
                </span>
                <Button type="submit" size="sm" disabled={!canSend}>
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  Send
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function PortalTicketSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-4">
        <div className="flex flex-row-reverse gap-2.5">
          <Skeleton className="size-7 rounded-lg" />
          <Skeleton className="h-24 w-3/4 rounded-2xl" />
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="size-7 rounded-lg" />
          <Skeleton className="h-20 w-2/3 rounded-2xl" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}
