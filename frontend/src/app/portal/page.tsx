"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CreditCard, Inbox, MessageSquareText, Plus, Receipt, Send } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/shared/page"
import { getSeen, PortalStatusBadge } from "@/components/portal/portal-status"
import { dateTime, timeAgo } from "@/lib/format"
import { qk, useMe } from "@/lib/hooks"
import { api } from "@/lib/api"
import type { Page, TicketListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const QUERY = { sort: "-created_at", page: 1, page_size: 50 }

export default function PortalHome() {
  const { data: me } = useMe()
  const firstName = me?.full_name.split(/\s+/)[0] ?? ""
  const { data, isLoading } = useQuery({
    queryKey: qk.tickets({ portal: true, ...QUERY }),
    queryFn: () => api.get<Page<TicketListItem>>("/tickets", QUERY),
    refetchInterval: 20_000,
  })

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Hi {firstName}
        </h1>
        <p className="text-muted-foreground">
          <span dir="rtl" className="font-arabic">
            أهلاً بيك
          </span>{" "}
          · Here are your requests and our replies.
        </p>
      </div>

      <Card className="from-primary/12 via-primary/5 to-background relative overflow-hidden border-primary/20 bg-gradient-to-br p-0">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Need help with a transfer, card or bill?</h2>
            <p dir="rtl" className="font-arabic text-muted-foreground text-start">
              عندك مشكلة بحوالة، بطاقة، أو دفع فاتورة؟ اكتبلنا وراح نرد عليك بأسرع وقت.
            </p>
            <div className="text-muted-foreground flex flex-wrap gap-3 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Send className="size-3.5" /> Transfers
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="size-3.5" /> Cards
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="size-3.5" /> Bills &amp; top-ups
              </span>
            </div>
          </div>
          <Button asChild size="lg" className="shadow-primary/20 shadow-lg">
            <Link href="/portal/new">
              <Plus /> New request
            </Link>
          </Button>
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Your requests</h2>
          {data?.total ? <span className="text-muted-foreground text-sm tabular-nums">{data.total} total</span> : null}
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card space-y-3 rounded-xl border p-4">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="ml-auto h-4 w-11/12" />
                <Skeleton className="ml-auto h-4 w-3/4" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={Inbox}
            title="No requests yet"
            description="When you send us a request, it shows up here with our reply."
            action={
              <Button asChild size="sm">
                <Link href="/portal/new">
                  <Plus /> New request
                </Link>
              </Button>
            }
            className="bg-card"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.items.map((t) => (
              <li key={t.id}>
                <TicketCard ticket={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TicketCard({ ticket: t }: { ticket: TicketListItem }) {
  const seen = getSeen(t.id)
  const newReply = t.status === "resolved" && (!seen || seen < t.updated_at)
  return (
    <Link
      href={`/portal/tickets/${t.id}`}
      className={cn(
        "group bg-card hover:border-primary/30 focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 shadow-xs transition-all outline-none hover:shadow-md focus-visible:ring-[3px]",
        newReply && "border-success/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          {newReply ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative flex size-2.5" aria-label="New reply">
                  <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                  <span className="bg-success relative inline-flex size-2.5 rounded-full" />
                </span>
              </TooltipTrigger>
              <TooltipContent>New reply from our team</TooltipContent>
            </Tooltip>
          ) : null}
          <span className="font-mono text-xs font-medium">{t.ref}</span>
        </span>
        <PortalStatusBadge status={t.status} />
      </div>
      <p dir="auto" className="font-arabic line-clamp-2 flex-1 text-start text-sm leading-relaxed">
        {t.text_preview}
      </p>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-3">
          <span title={dateTime(t.updated_at)}>Updated {timeAgo(t.updated_at)}</span>
          {t.message_count > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageSquareText className="size-3.5" /> {t.message_count}
            </span>
          ) : null}
        </span>
        <span className={cn("inline-flex items-center gap-1 font-medium", newReply ? "text-success" : "group-hover:text-foreground")}>
          {newReply ? "Read reply" : "Open"}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
