"use client"

import { CircleCheckBig, CircleSlash, Loader2, PenSquare, RotateCcw } from "lucide-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DraftEditor } from "@/components/tickets/draft-editor"
import { isTriaging, sameDraft } from "@/components/tickets/lib"
import { Markdown } from "@/components/tickets/markdown"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import type { useDraft } from "@/components/tickets/workspace/use-draft"
import { dateTime } from "@/lib/format"
import type { TicketDetail } from "@/lib/types"

type Draft = ReturnType<typeof useDraft>

export function ReplyCard({ ticket, draft }: { ticket: TicketDetail; draft: Draft }) {
  const [confirmRestore, setConfirmRestore] = useState(false)

  if (ticket.status === "resolved") {
    const sent = [...ticket.messages].reverse().find((m) => m.author_type === "staff")
    return (
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleCheckBig className="text-success size-4" /> Reply sent
          </CardTitle>
          <CardDescription>
            {sent ? (
              <>
                {sent.author_name} · <TimeAgo value={sent.created_at} />
              </>
            ) : (
              `Resolved ${dateTime(ticket.resolved_at)}`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          {sent ? (
            <div className="border-success/25 bg-success/5 rounded-xl border px-4 py-3">
              <Markdown size="base">{sent.body_md}</Markdown>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">The reply is no longer in the thread.</p>
          )}
          <p className="text-muted-foreground mt-3 text-xs">The ticket reopens automatically if the customer writes again.</p>
        </CardContent>
      </Card>
    )
  }

  if (ticket.status === "closed") {
    const closing = ticket.decisions.find((d) => d.action === "close")
    return (
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleSlash className="text-muted-foreground size-4" /> Closed without a reply
          </CardTitle>
          <CardDescription>
            {closing ? (
              <>
                Closed by {closing.user_name} · <TimeAgo value={closing.created_at} />
              </>
            ) : (
              "Nothing was sent to the customer."
            )}
          </CardDescription>
        </CardHeader>
        {closing?.note ? (
          <CardContent className="px-5">
            <p dir="auto" className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
              {closing.note}
            </p>
          </CardContent>
        ) : null}
      </Card>
    )
  }

  const triaging = isTriaging(ticket.status)
  const hasAi = ticket.ai_draft.trim() !== ""
  const differs = !sameDraft(draft.draft, ticket.ai_draft)
  const restoreDisabledReason = !hasAi
    ? "There is no AI draft for this ticket"
    : !differs
      ? "The draft already matches the AI draft"
      : null

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <PenSquare className="text-muted-foreground size-4" /> Reply
        </CardTitle>
        <CardDescription>
          Markdown draft. Arabic paragraphs turn right-to-left on their own. Saved automatically, sent only when approved.
        </CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={restoreDisabledReason ? 0 : -1} className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!restoreDisabledReason || triaging || draft.saving}
                  onClick={() => setConfirmRestore(true)}
                >
                  <RotateCcw /> Restore AI draft
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{restoreDisabledReason ?? "Replace the current draft with the untouched AI draft"}</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        {triaging ? (
          <div className="bg-primary/5 text-primary border-primary/20 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            The model is triaging this ticket. Its draft will appear here.
          </div>
        ) : null}
        <DraftEditor
          value={draft.draft}
          onChange={draft.setDraft}
          readOnly={triaging}
          aiDraft={ticket.ai_draft}
          transactionRef={ticket.fields.transaction_ref}
          resetKey={`${ticket.id}-${draft.resetKey}-${triaging ? "ro" : "rw"}`}
          saveState={draft.saveState}
          onRetrySave={draft.retry}
          placeholder={
            triaging
              ? "The AI draft will appear here…"
              : hasAi
                ? "Write the reply to the customer…"
                : "No AI draft for this ticket. Write the reply to the customer…"
          }
        />
      </CardContent>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore the AI draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits are replaced by the draft the model wrote in the latest triage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted/40 max-h-56 overflow-y-auto rounded-lg border px-4 py-3">
            <Markdown>{ticket.ai_draft}</Markdown>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my edits</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                draft.restore(ticket.ai_draft)
                setConfirmRestore(false)
              }}
            >
              <RotateCcw /> Replace draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
