"use client"

import { Check, Download, FileJson, FileSpreadsheet, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page"
import { useOverview } from "@/components/admin/queries"
import { api } from "@/lib/api"

interface ExportItem {
  key: string
  title: string
  description: string
  format: string
  file: string
  icon: React.ElementType
  contains: string[]
  count: (o: { resolved: number; total: number }) => string
}

const EXPORTS: ExportItem[] = [
  {
    key: "corrections",
    title: "Corrections for retraining",
    description:
      "Human-confirmed labels and the replies that were actually sent, in the dataset schema. Feed it to the next LoRA fine-tune so the model learns from reviewer corrections.",
    format: "JSONL",
    file: "corrections.jsonl",
    icon: FileJson,
    contains: [
      "One resolved ticket per line, in schemas/ticket.schema.json format",
      "labels = final labels after human review (category, priority, fields, flags)",
      "draft_reply = the text a person approved and sent",
      'meta.source = "human", meta.split = "train"',
    ],
    count: ({ resolved }) => `${resolved.toLocaleString()} resolved ticket${resolved === 1 ? "" : "s"} available`,
  },
  {
    key: "tickets",
    title: "Tickets for reporting",
    description: "Every ticket with its final labels and pipeline outcome, ready for a spreadsheet or BI tool.",
    format: "CSV",
    file: "tickets.csv",
    icon: FileSpreadsheet,
    contains: [
      "All tickets, live and uploaded",
      "Final category, priority and status",
      "Team, confidence and escalation reason",
    ],
    count: ({ total }) => `${total.toLocaleString()} ticket${total === 1 ? "" : "s"}`,
  },
]

export default function ExportPage() {
  const overview = useOverview()
  const counts = overview.data ? { resolved: overview.data.by_status.resolved ?? 0, total: overview.data.tickets_total } : null

  return (
    <div className="space-y-6">
      <PageHeader title="Export" description="Download what people confirmed, for retraining and for reporting." />

      <div className="grid gap-6 lg:grid-cols-2">
        {EXPORTS.map((x) => {
          const Icon = x.icon
          const empty = counts ? (x.key === "corrections" ? counts.resolved === 0 : counts.total === 0) : false
          return (
            <Card key={x.key} className="gap-5">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-1.5">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {x.title}
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {x.format}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{x.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <p className="text-sm font-medium">What it contains</p>
                <ul className="space-y-2">
                  {x.contains.map((c) => (
                    <li key={c} className="text-muted-foreground flex items-start gap-2 text-sm">
                      <Check className="text-success mt-0.5 size-4 shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-3 border-t pt-5 [.border-t]:pt-5">
                <div className="text-muted-foreground text-sm tabular-nums">
                  {overview.isLoading ? <Skeleton className="h-4 w-36" /> : counts ? x.count(counts) : x.file}
                </div>
                <Button asChild>
                  <a href={api.url(`/export/${x.file}`)} download={x.file}>
                    <Download className="size-4" /> Download {x.file}
                  </a>
                </Button>
              </CardFooter>
              {empty ? (
                <div className="-mt-2 px-6">
                  <p className="text-warning-foreground dark:text-warning text-xs">
                    {x.key === "corrections"
                      ? "Nothing resolved yet: the file will be empty until reviewers approve replies."
                      : "No tickets yet: the file will only contain the header row."}
                  </p>
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Alert>
        <Info />
        <AlertDescription>
          Exports are generated on demand with your admin session and may contain customer text. Store them on approved systems only.
        </AlertDescription>
      </Alert>
    </div>
  )
}
