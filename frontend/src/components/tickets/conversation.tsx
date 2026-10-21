"use client"

import { Info } from "lucide-react"
import { UserAvatar } from "@/components/shell/user-menu"
import { Markdown } from "@/components/tickets/markdown"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import type { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

export type BubbleSide = "start" | "end"
export type BubbleTone = "neutral" | "primary"

// One chat bubble. Layout direction stays LTR (start = left); the text inside
// picks its own direction, so Arabic is right-to-left within the bubble.
export function ChatBubble({
  author,
  time,
  side,
  tone,
  children,
  label,
}: {
  author: string
  time: string
  side: BubbleSide
  tone: BubbleTone
  children: React.ReactNode
  label?: React.ReactNode
}) {
  return (
    <div className={cn("flex gap-2.5", side === "end" && "flex-row-reverse")}>
      <UserAvatar name={author} className={cn("mt-5 size-7", tone === "primary" && "[&>span]:bg-primary [&>span]:text-primary-foreground")} />
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-1", side === "end" && "items-end")}>
        <div className={cn("text-muted-foreground flex items-center gap-2 text-xs", side === "end" && "flex-row-reverse")}>
          <span className="text-foreground font-medium">{author}</span>
          {label}
          <TimeAgo value={time} />
        </div>
        <div
          className={cn(
            "rounded-2xl border px-4 py-2.5 shadow-xs",
            tone === "primary" ? "border-primary/20 bg-primary/8" : "bg-muted/50",
            side === "start" ? "rounded-tl-sm" : "rounded-tr-sm",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function SystemNote({ message }: { message: Message }) {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-1 text-xs">
      <Info className="size-3.5" />
      <span dir="auto">{message.body_md}</span>
      <span aria-hidden>·</span>
      <TimeAgo value={message.created_at} />
    </div>
  )
}

// Staff view of the thread: customer on the left (neutral), staff on the right (primary).
export function StaffThread({ messages }: { messages: Message[] }) {
  if (!messages.length) return null
  return (
    <div className="space-y-4">
      {messages.map((m) =>
        m.author_type === "system" ? (
          <SystemNote key={m.id} message={m} />
        ) : (
          <ChatBubble
            key={m.id}
            author={m.author_name}
            time={m.created_at}
            side={m.author_type === "staff" ? "end" : "start"}
            tone={m.author_type === "staff" ? "primary" : "neutral"}
            label={m.author_type === "staff" ? <span className="text-primary">Sent reply</span> : null}
          >
            <Markdown>{m.body_md}</Markdown>
          </ChatBubble>
        ),
      )}
    </div>
  )
}
