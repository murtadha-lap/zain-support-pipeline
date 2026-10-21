"use client"

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Inbox,
  Loader2,
  MessageCircle,
  Route,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLabel, useMeta } from "@/lib/hooks"
import type { Category, Channel, EscalationReason, Flag, Priority, TicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<TicketStatus, { className: string; icon: React.ElementType }> = {
  new: { className: "bg-info/10 text-info border-info/25", icon: Inbox },
  processing: { className: "bg-primary/10 text-primary border-primary/25", icon: Loader2 },
  routed: { className: "bg-chart-5/10 text-chart-5 border-chart-5/25", icon: Route },
  escalated: { className: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30", icon: AlertTriangle },
  resolved: { className: "bg-success/10 text-success border-success/25", icon: CheckCircle2 },
  closed: { className: "bg-muted text-muted-foreground border-border", icon: XCircle },
}

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const label = useLabel()
  const { className: tone, icon: Icon } = STATUS_STYLE[status] ?? STATUS_STYLE.new
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", tone, className)}>
      <Icon className={cn("size-3", status === "processing" && "animate-spin")} />
      {label("statuses", status)}
    </Badge>
  )
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
}

export function PriorityBadge({ priority, className }: { priority: Priority | null; className?: string }) {
  const label = useLabel()
  if (!priority) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        priority === "high" && "border-destructive/30 text-destructive",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[priority])} />
      {label("priorities", priority)}
    </Badge>
  )
}

// Stable colour per category, reused by charts.
export const CATEGORY_COLOR: Record<Category, string> = {
  failed_transfer: "oklch(0.645 0.246 16.439)",
  wrong_recipient: "oklch(0.705 0.213 47.604)",
  login_problem: "oklch(0.623 0.214 259.815)",
  agent_dispute: "oklch(0.769 0.188 70.08)",
  card_issue: "oklch(0.627 0.265 303.9)",
  topup_balance: "oklch(0.696 0.17 162.48)",
  bill_payment: "oklch(0.715 0.143 215.221)",
  suspected_fraud: "oklch(0.577 0.245 27.325)",
  general_question: "oklch(0.552 0.016 285.938)",
}

export function CategoryBadge({ category, className }: { category: Category | null; className?: string }) {
  const { data: meta } = useMeta()
  if (!category) return <span className="text-muted-foreground text-xs">Not triaged</span>
  const opt = meta?.categories.find((c) => c.key === category)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className={cn("gap-1.5 font-medium", className)}>
          <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[category] }} />
          {opt?.label ?? category}
        </Badge>
      </TooltipTrigger>
      {opt?.label_ar ? (
        <TooltipContent>
          <span dir="rtl">{opt.label_ar}</span>
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}

const CHANNEL_ICON: Record<Channel, React.ElementType> = {
  app: Smartphone,
  whatsapp: MessageCircle,
  telegram: Send,
}

export function ChannelBadge({ channel, withLabel = true }: { channel: Channel; withLabel?: boolean }) {
  const label = useLabel()
  const Icon = CHANNEL_ICON[channel] ?? CircleDashed
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <Icon className="size-3.5" />
      {withLabel ? label("channels", channel) : null}
    </span>
  )
}

const FLAG_TONE: Partial<Record<Flag, string>> = {
  instruction_in_text: "border-destructive/40 text-destructive bg-destructive/5",
  mixed_issue: "border-warning/40 text-warning-foreground dark:text-warning bg-warning/10",
  ambiguous_category: "border-warning/40 text-warning-foreground dark:text-warning bg-warning/10",
  money_already_gone: "border-chart-4/40 text-chart-4 bg-chart-4/5",
}

export function FlagBadge({ flag }: { flag: Flag }) {
  const { data: meta } = useMeta()
  const opt = meta?.flags.find((f) => f.key === flag)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("font-normal", FLAG_TONE[flag])}>
          {opt?.label ?? flag.replace(/_/g, " ")}
        </Badge>
      </TooltipTrigger>
      {opt?.description ? <TooltipContent className="max-w-64">{opt.description}</TooltipContent> : null}
    </Tooltip>
  )
}

export function EscalationBadge({ reason }: { reason: EscalationReason | null }) {
  const { data: meta } = useMeta()
  if (!reason) return null
  const opt = meta?.escalation_reasons.find((r) => r.key === reason)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning gap-1 font-normal">
          <AlertTriangle className="size-3" />
          {opt?.label ?? reason.replace(/_/g, " ")}
        </Badge>
      </TooltipTrigger>
      {opt?.description ? <TooltipContent className="max-w-64">{opt.description}</TooltipContent> : null}
    </Tooltip>
  )
}
