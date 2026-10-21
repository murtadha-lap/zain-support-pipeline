"use client"

import { BarChart3 } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { CATEGORY_COLOR } from "@/components/shared/badges"
import { InfoTip } from "@/components/admin/common"
import { shortDate } from "@/lib/format"
import { useLabel, useMeta, useTeams } from "@/lib/hooks"
import type { Category, Overview, TicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Card wrapper                                                        */
/* ------------------------------------------------------------------ */

export function ChartCard({
  title,
  description,
  info,
  action,
  className,
  children,
}: {
  title: string
  description?: string
  info?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-base">
          {title}
          {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}

export function ChartCardSkeleton({ className, height = 260 }: { className?: string; height?: number }) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </CardContent>
    </Card>
  )
}

function NoChartData({ height = 260, text = "No data yet" }: { height?: number; text?: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm" style={{ height }}>
      <BarChart3 className="size-5" />
      {text}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 14-day activity                                                     */
/* ------------------------------------------------------------------ */

const dailyConfig = {
  created: { label: "Created", color: "var(--chart-1)" },
  resolved: { label: "Resolved", color: "var(--chart-2)" },
  escalated: { label: "Escalated", color: "var(--chart-3)" },
} satisfies ChartConfig

export function DailyChart({ daily }: { daily: Overview["daily"] }) {
  const hasData = daily.some((d) => d.created || d.resolved || d.escalated)
  if (!hasData) return <NoChartData text="No ticket activity in the last 14 days" />
  return (
    <ChartContainer config={dailyConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={daily} margin={{ left: -16, right: 8, top: 8 }}>
        <defs>
          {(Object.keys(dailyConfig) as (keyof typeof dailyConfig)[]).map((k) => (
            <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.35} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(v: string) => shortDate(v)} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => shortDate(String(v))} />} />
        <Area dataKey="created" type="monotone" stroke="var(--color-created)" fill="url(#fill-created)" strokeWidth={2} />
        <Area dataKey="resolved" type="monotone" stroke="var(--color-resolved)" fill="url(#fill-resolved)" strokeWidth={2} />
        <Area dataKey="escalated" type="monotone" stroke="var(--color-escalated)" fill="url(#fill-escalated)" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------ */
/* By category                                                         */
/* ------------------------------------------------------------------ */

export function CategoryChart({ byCategory }: { byCategory: Overview["by_category"] }) {
  const { data: meta } = useMeta()
  const label = useLabel()
  const keys = (meta?.categories.map((c) => c.key) ?? (Object.keys(CATEGORY_COLOR) as Category[])) as Category[]
  const data = keys.map((k) => ({ category: k, label: label("categories", k), count: byCategory[k] ?? 0, fill: CATEGORY_COLOR[k] }))
  const config = Object.fromEntries(keys.map((k) => [k, { label: label("categories", k), color: CATEGORY_COLOR[k] }])) as ChartConfig
  config.count = { label: "Tickets" }
  if (!data.some((d) => d.count)) return <NoChartData />
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-32}
          textAnchor="end"
          height={78}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideLabel nameKey="category" />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
          {data.map((d) => (
            <Cell key={d.category} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------ */
/* By status (donut)                                                   */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<TicketStatus, string> = {
  new: "var(--info)",
  processing: "var(--primary)",
  routed: "var(--chart-5)",
  escalated: "var(--warning)",
  resolved: "var(--success)",
  closed: "var(--muted-foreground)",
}

export function StatusDonut({ byStatus }: { byStatus: Overview["by_status"] }) {
  const label = useLabel()
  const keys = Object.keys(STATUS_COLOR) as TicketStatus[]
  const data = keys.map((k) => ({ status: k, count: byStatus[k] ?? 0, fill: `var(--color-${k})` })).filter((d) => d.count > 0)
  const total = data.reduce((s, d) => s + d.count, 0)
  const config = Object.fromEntries(keys.map((k) => [k, { label: label("statuses", k), color: STATUS_COLOR[k] }])) as ChartConfig
  config.count = { label: "Tickets" }
  if (!total) return <NoChartData />
  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={config} className="mx-auto aspect-square h-[200px]">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="status" />} />
          <Pie data={data} dataKey="count" nameKey="status" innerRadius={62} outerRadius={92} strokeWidth={3} paddingAngle={1}>
            {data.map((d) => (
              <Cell key={d.status} fill={d.fill} stroke="var(--card)" />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold tabular-nums">
                        {total.toLocaleString()}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                        tickets
                      </tspan>
                    </text>
                  )
                }
                return null
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLOR[d.status] }} />
            <span className="text-muted-foreground flex-1 truncate">{label("statuses", d.status)}</span>
            <span className="font-medium tabular-nums">{d.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* By team (horizontal bars)                                           */
/* ------------------------------------------------------------------ */

export function TeamBars({ byTeam, emptyText }: { byTeam: Record<string, number>; emptyText?: string }) {
  const { data: teams } = useTeams()
  const data = Object.entries(byTeam)
    .map(([key, count]) => {
      const team = teams?.find((t) => t.key === key)
      return { key, name: team?.name ?? key.replace(/_/g, " "), count, fill: team?.color ?? "var(--chart-1)" }
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
  const config: ChartConfig = { count: { label: "Tickets", color: "var(--chart-1)" } }
  if (!data.length) return <NoChartData text={emptyText} />
  const height = Math.max(160, data.length * 38 + 24)
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={118}
          tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0]?.payload as { name?: string } | undefined)?.name ?? ""}
            />
          }
        />
        <Bar
          dataKey="count"
          radius={[0, 6, 6, 0]}
          maxBarSize={26}
          label={{ position: "right", className: "fill-foreground text-xs tabular-nums", offset: 8 }}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Confidence histogram                                                */
/* ------------------------------------------------------------------ */

const histConfig = {
  above: { label: "At or above threshold", color: "var(--primary)" },
  below: { label: "Below threshold", color: "var(--warning)" },
  count: { label: "Tickets" },
} satisfies ChartConfig

export function ConfidenceHistogram({ buckets, threshold }: { buckets: Overview["confidence_histogram"]; threshold: number | undefined }) {
  const data = buckets.map((b) => {
    const [lo, hi] = b.bucket.split("-").map(Number)
    const mid = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 0
    const below = threshold !== undefined && mid < threshold
    return { x: mid, bucket: b.bucket, count: b.count, below }
  })
  if (!data.some((d) => d.count)) return <NoChartData text="No tickets with a confidence score yet" />
  return (
    <ChartContainer config={histConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: -16, right: 12, top: 22 }} barCategoryGap="8%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, 1]}
          ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        {threshold !== undefined ? (
          <ReferenceArea x1={0} x2={threshold} fill="var(--warning)" fillOpacity={0.06} ifOverflow="hidden" />
        ) : null}
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { bucket?: string; below?: boolean } | undefined
                return p ? `Confidence ${p.bucket}${p.below ? " · goes to a human" : ""}` : ""
              }}
            />
          }
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={d.below ? "var(--color-below)" : "var(--color-above)"} />
          ))}
        </Bar>
        {threshold !== undefined ? (
          <ReferenceLine
            x={threshold}
            stroke="var(--foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{ value: `threshold ${threshold.toFixed(2)}`, position: "top", fill: "var(--muted-foreground)", fontSize: 11 }}
          />
        ) : null}
      </BarChart>
    </ChartContainer>
  )
}
