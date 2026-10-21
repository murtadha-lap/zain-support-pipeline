import { ArrowRight, Lock, ShieldCheck, Sparkles, Users } from "lucide-react"
import { Brand } from "@/components/shell/brand"

const POINTS = [
  {
    icon: Sparkles,
    title: "Sorted before you open it",
    text: "Every ticket arrives with its category, priority, transaction details and a draft reply.",
  },
  {
    icon: ShieldCheck,
    title: "Checked by code, not trust",
    text: "Fields must appear in the message and confidence must clear a calibrated threshold.",
  },
  {
    icon: Users,
    title: "People stay in charge",
    text: "Unsure tickets go to an agent. Nothing reaches a customer without approval.",
  },
]

const STEPS = ["Read", "Classify", "Check", "Approve"]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <Brand />
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Lock className="size-3" /> Synthetic data only · no real customer information
        </p>
      </div>

      <div className="relative hidden overflow-hidden lg:block">
        <div className="from-primary via-primary/90 to-chart-5 absolute inset-0 bg-gradient-to-br" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-black/15 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
            The model proposes · people approve
          </span>

          <div className="max-w-lg space-y-10">
            <div className="space-y-4">
              <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
                Spend the day solving tickets, not sorting them.
              </h2>
              <p className="text-lg text-white/75">
                Iraqi-dialect support, triaged by a local model on your own server and reviewed by your team.
              </p>
            </div>

            <ul className="space-y-3">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex gap-4 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.12]"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-white/70">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-sm text-white/80">
            {STEPS.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">{step}</span>
                {i < STEPS.length - 1 ? <ArrowRight className="size-3.5 text-white/50" /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
