import { CheckCircle2, ShieldCheck, Sparkles, Users } from "lucide-react"
import { Brand } from "@/components/shell/brand"

const POINTS = [
  { icon: Sparkles, text: "Every ticket arrives sorted, prioritised and with a draft reply" },
  { icon: ShieldCheck, text: "Code checks the model: grounded fields, calibrated confidence, one issue" },
  { icon: Users, text: "Unsure tickets go to a person. Nothing is sent without approval" },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <Brand />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-muted-foreground text-center text-xs">Synthetic data only · no real customer information</p>
      </div>
      <div className="from-primary via-primary/90 to-chart-5 relative hidden overflow-hidden bg-gradient-to-br p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10 blur-3xl" />
        <div className="relative space-y-3">
          <h2 className="max-w-md text-3xl font-semibold tracking-tight">Support agents should solve tickets, not sort them.</h2>
          <p className="max-w-md text-white/80">
            A small local model reads Iraqi-dialect messages, extracts the transaction details and drafts a reply. People stay in charge.
          </p>
        </div>
        <div className="relative space-y-4">
          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur">
            <p dir="rtl" className="font-arabic text-[15px]">
              حولت ربع مليون لأخوية البارحة وطلعتلي العملية ناجحة بس للحين ما وصلته. رقم العملية TX84213907
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/20 px-2.5 py-1">Failed transfer · 94%</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1">High priority</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1">250,000 IQD</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1">→ Transfers team</span>
            </div>
          </div>
          <ul className="space-y-2.5">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-white/90">
                <Icon className="mt-0.5 size-4 shrink-0" /> {text}
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1.5 text-xs text-white/70">
            <CheckCircle2 className="size-3.5" /> Runs on one on-prem GPU with vLLM
          </p>
        </div>
      </div>
    </div>
  )
}
