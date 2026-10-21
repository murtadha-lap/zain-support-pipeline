"use client"

import { AlertTriangle, MessagesSquare } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ArabicText } from "@/components/shared/arabic-text"
import { StaffThread } from "@/components/tickets/conversation"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import { useMeta } from "@/lib/hooks"
import type { TicketDetail } from "@/lib/types"

export function CustomerMessageCard({ ticket }: { ticket: TicketDetail }) {
  const f = ticket.fields
  const highlights = [
    { text: f.transaction_ref, label: "Reference" },
    { text: f.amount_text, label: "Amount" },
    { text: f.date_text, label: "Date" },
  ]
  const grounded = highlights.filter((h) => h.text && ticket.text.includes(h.text))

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessagesSquare className="text-muted-foreground size-4" />
          Customer message
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          {ticket.customer?.full_name ?? ticket.customer_name ?? "Customer"} · <TimeAgo value={ticket.created_at} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="bg-muted/40 rounded-xl border px-4 py-3.5">
          <ArabicText text={ticket.text} highlights={highlights} className="font-arabic text-base" />
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <mark className="grounded">abc</mark>
            Highlighted spans are the extracted fields, found word-for-word in the text
          </span>
          {grounded.length ? (
            <span className="text-foreground/80">({grounded.map((g) => g.label).join(", ")})</span>
          ) : (
            <span>· none extracted yet</span>
          )}
        </div>

        {ticket.messages.length ? (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Conversation</p>
            </div>
            <StaffThread messages={ticket.messages} />
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function EscalationCallout({ ticket, reviewer }: { ticket: TicketDetail; reviewer: boolean }) {
  const { data: meta } = useMeta()
  if (ticket.status !== "escalated") return null
  const reason = meta?.escalation_reasons.find((r) => r.key === ticket.escalation_reason)
  return (
    <Alert className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning">
      <AlertTriangle />
      <AlertTitle>
        Escalated{reason ? `: ${reason.label}` : ticket.escalation_reason ? `: ${ticket.escalation_reason}` : ""}
      </AlertTitle>
      <AlertDescription className="text-warning-foreground/80 dark:text-warning/80">
        {reason?.description ? <p>{reason.description}</p> : null}
        {ticket.escalation_note ? (
          <p dir="auto" className="border-warning/40 text-foreground mt-1 border-l-2 pl-2 italic">
            “{ticket.escalation_note}”
          </p>
        ) : null}
        <p>
          {reviewer
            ? "Check the labels, then approve a reply or route it to a team."
            : "Waiting for a human agent to review it."}
        </p>
      </AlertDescription>
    </Alert>
  )
}
