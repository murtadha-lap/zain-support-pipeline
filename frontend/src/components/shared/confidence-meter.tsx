"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { percent } from "@/lib/format"
import { cn } from "@/lib/utils"

interface Props {
  value: number | null
  threshold?: number
  size?: "sm" | "md"
  showLabel?: boolean
  className?: string
}

// Confidence = probability of the category tokens (from vLLM logprobs), not a
// number the model reports about itself. The tick marks the calibrated threshold.
export function ConfidenceMeter({ value, threshold, size = "sm", showLabel = true, className }: Props) {
  if (value === null || value === undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("text-muted-foreground text-xs", className)}>n/a</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          This model returns no token log-probabilities, so there is no confidence score.
        </TooltipContent>
      </Tooltip>
    )
  }
  const tone =
    threshold === undefined
      ? "bg-primary"
      : value >= threshold
        ? "bg-success"
        : value >= threshold - 0.1
          ? "bg-warning"
          : "bg-destructive"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-2", className)}>
          <div className={cn("bg-muted relative overflow-hidden rounded-full", size === "sm" ? "h-1.5 w-16" : "h-2 w-full min-w-24")}>
            <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(2, value * 100)}%` }} />
            {threshold !== undefined ? (
              <div className="bg-foreground/60 absolute inset-y-0 w-px" style={{ left: `${threshold * 100}%` }} />
            ) : null}
          </div>
          {showLabel ? <span className="text-xs font-medium tabular-nums">{percent(value)}</span> : null}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Category-token probability {percent(value, 1)}
        {threshold !== undefined ? ` · threshold ${percent(threshold)}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}
