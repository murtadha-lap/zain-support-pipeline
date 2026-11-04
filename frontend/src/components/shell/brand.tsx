import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export function Brand({ className, subtitle = "Support pipeline" }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <div className="from-primary to-chart-5 text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm">
        <Sparkles className="size-4" />
      </div>
      {/* hidden in the collapsed (icon) sidebar, where only the logo fits */}
      <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="text-sm font-semibold">Wallet Care</span>
        <span className="text-muted-foreground text-xs">{subtitle}</span>
      </div>
    </div>
  )
}
