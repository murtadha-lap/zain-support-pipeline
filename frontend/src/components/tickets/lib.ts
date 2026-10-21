"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { Role, Settings, TicketDetail, TicketStatus } from "@/lib/types"

// Calibrated confidence threshold (staff only), for the tick on list meters.
export function useThreshold() {
  const { data } = useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<Settings>("/settings"),
    staleTime: 5 * 60_000,
  })
  return data?.confidence_threshold
}

// Statuses where the model has not produced a result yet.
export const TRIAGING: TicketStatus[] = ["new", "processing"]
// Statuses where the work is over (no draft editing, no approve).
export const FINISHED: TicketStatus[] = ["resolved", "closed"]

export const isTriaging = (s: TicketStatus | undefined) => !!s && TRIAGING.includes(s)
export const isFinished = (s: TicketStatus | undefined) => !!s && FINISHED.includes(s)

export const isReviewer = (role: Role | undefined) => role === "agent" || role === "admin"

// Draft replies should be short; the footer warns above this.
export const DRAFT_WORD_LIMIT = 60

export function wordCount(md: string | null | undefined) {
  if (!md) return 0
  return md.split(/\s+/).filter((w) => /[A-Za-z0-9؀-ۿݐ-ݿ]/.test(w)).length
}

export function sameDraft(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim() === (b ?? "").trim()
}

// Where the user came from, so "approve" can send them back to the right queue.
export type QueueFrom = "inbox" | "team" | "tickets" | "assigned"

export function queueHref(from: string | null | undefined, role: Role | undefined) {
  switch (from) {
    case "inbox":
      return "/app/inbox"
    case "team":
      return "/app/team"
    case "assigned":
      return "/app/tickets?assignee=me"
    case "tickets":
      return "/app/tickets"
    default:
      return role === "team_member" ? "/app/team" : "/app/inbox"
  }
}

export function queueLabel(from: string | null | undefined, role: Role | undefined) {
  const href = queueHref(from, role)
  if (href === "/app/inbox") return "Review queue"
  if (href === "/app/team") return "Team queue"
  if (href.includes("assignee=me")) return "Assigned to me"
  return "All tickets"
}

export function ticketHref(id: number, from?: QueueFrom) {
  return from ? `/app/tickets/${id}?from=${from}` : `/app/tickets/${id}`
}

// After any ticket mutation: refresh the ticket, every ticket list and the sidebar counters.
export function useTicketInvalidation() {
  const qc = useQueryClient()
  return useCallback(
    (id?: number | string, detail?: TicketDetail) => {
      if (id !== undefined && detail) qc.setQueryData(qk.ticket(id), detail)
      if (id !== undefined) void qc.invalidateQueries({ queryKey: qk.ticket(id) })
      void qc.invalidateQueries({ queryKey: ["tickets"] })
      void qc.invalidateQueries({ queryKey: qk.myStats })
    },
    [qc],
  )
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Re-render every `interval` ms, for "12s ago" style labels.
export function useNow(interval = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
