"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, FileJson, FileSpreadsheet, FileUp, Play, Sparkles, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatBytes, LoadingButton } from "@/components/admin/common"
import { ModelSelect, ModelWarning, useModelChoice } from "@/components/admin/model-select"
import { useOverview } from "@/components/admin/queries"
import { api, errorMessage } from "@/lib/api"
import { qk, useMeta } from "@/lib/hooks"
import type { Batch, TicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

function useBatchCreated() {
  const qc = useQueryClient()
  const router = useRouter()
  return (batch: Batch, title: string) => {
    qc.invalidateQueries({ queryKey: qk.batches })
    qc.invalidateQueries({ queryKey: qk.overview })
    qc.invalidateQueries({ queryKey: ["tickets"] })
    toast.success(title, {
      description: `${batch.name} · ${batch.total.toLocaleString()} ticket${batch.total === 1 ? "" : "s"}`,
      action: { label: "View", onClick: () => router.push(`/app/admin/batches/${batch.id}`) },
    })
  }
}

/* ------------------------------------------------------------------ */
/* New batch over existing tickets                                     */
/* ------------------------------------------------------------------ */

export function NewBatchDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New batch</DialogTitle>
          <DialogDescription>
            Triage existing tickets with a model. Code checks then route each ticket to a team or escalate it to a human agent.
          </DialogDescription>
        </DialogHeader>
        <NewBatchForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

const BATCHABLE: TicketStatus[] = ["new", "routed", "escalated", "resolved", "closed"]

function NewBatchForm({ onDone }: { onDone: () => void }) {
  const ids = useId()
  const { data: meta } = useMeta()
  const { data: overview } = useOverview()
  const choice = useModelChoice()
  const [name, setName] = useState("")
  const [statuses, setStatuses] = useState<TicketStatus[]>(["new"])
  const created = useBatchCreated()

  const matched = overview ? statuses.reduce((sum, s) => sum + (overview.by_status[s] ?? 0), 0) : null
  const statusOptions = BATCHABLE.map((key) => ({
    key,
    label: meta?.statuses.find((s) => s.key === key)?.label ?? key,
    count: overview?.by_status[key],
  }))

  const create = useMutation({
    mutationFn: () =>
      api.post<Batch>("/batches", {
        name: name.trim() || undefined,
        model_config_id: choice.value ?? undefined,
        statuses,
      }),
    onSuccess: (batch) => {
      created(batch, "Batch started")
      onDone()
    },
    onError: (err) => toast.error("Couldn't start the batch", { description: errorMessage(err) }),
  })

  const toggle = (s: TicketStatus, on: boolean) =>
    setStatuses((prev) => (on ? [...new Set([...prev, s])] : prev.filter((x) => x !== s)))

  const canSubmit = statuses.length > 0 && choice.value !== null && !create.isPending

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) create.mutate()
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-name`}>
          Name <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id={`${ids}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning backlog"
          maxLength={120}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-model`}>Model</Label>
        <ModelSelect
          id={`${ids}-model`}
          models={choice.models}
          value={choice.value}
          onChange={choice.setValue}
          isLoading={choice.isLoading}
        />
        <ModelWarning model={choice.selected} liveTickets />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Include tickets with status</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {statusOptions.map((s) => {
            const checked = statuses.includes(s.key)
            return (
              <label
                key={s.key}
                className={cn(
                  "hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  checked && "border-primary/40 bg-primary/5",
                )}
              >
                <Checkbox checked={checked} onCheckedChange={(v) => toggle(s.key, v === true)} />
                <span className="flex-1">{s.label}</span>
                {s.count !== undefined ? (
                  <span className="text-muted-foreground text-xs tabular-nums">{s.count.toLocaleString()}</span>
                ) : null}
              </label>
            )
          })}
        </div>
        <p className={cn("text-xs", statuses.length === 0 ? "text-destructive" : "text-muted-foreground")}>
          {statuses.length === 0
            ? "Pick at least one status."
            : matched !== null
              ? matched === 0
                ? "No tickets currently match these statuses."
                : `About ${matched.toLocaleString()} ticket${matched === 1 ? "" : "s"} will be re-triaged.`
              : "Tickets already triaged get a new triage row; history is kept."}
        </p>
      </fieldset>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <LoadingButton type="submit" loading={create.isPending} disabled={!canSubmit} icon={Play}>
          Start batch
        </LoadingButton>
      </DialogFooter>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Upload a dataset file                                               */
/* ------------------------------------------------------------------ */

export function UploadBatchDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload tickets</DialogTitle>
          <DialogDescription>
            Import a dataset file as synthetic tickets. Rows that carry gold <code className="font-mono text-xs">labels</code> get
            an evaluation against the model&apos;s answers.
          </DialogDescription>
        </DialogHeader>
        <UploadForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

const ACCEPT = [".jsonl", ".json", ".csv"]

interface FileInfo {
  rows: number | null
  gold: number
  error?: string
  warning?: string
}

function countCsvRecords(text: string) {
  let records = 0
  let inQuotes = false
  let hasContent = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === "\n" && !inQuotes) {
      if (hasContent) records++
      hasContent = false
      continue
    }
    if (c !== "\r") hasContent = true
  }
  if (hasContent) records++
  return records
}

async function inspectFile(file: File): Promise<FileInfo> {
  if (file.size > 40 * 1024 * 1024) return { rows: null, gold: 0, warning: "Large file: row count skipped." }
  const text = await file.text()
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
  try {
    if (ext === ".jsonl") {
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      let gold = 0
      let bad = 0
      for (const line of lines) {
        try {
          const row = JSON.parse(line)
          if (row && typeof row === "object" && "labels" in row) gold++
          if (!row || typeof row.text !== "string") bad++
        } catch {
          bad++
        }
      }
      return {
        rows: lines.length,
        gold,
        warning: bad ? `${bad} line${bad === 1 ? "" : "s"} without a valid "text" field will be rejected.` : undefined,
      }
    }
    if (ext === ".json") {
      const data = JSON.parse(text)
      if (!Array.isArray(data)) return { rows: null, gold: 0, error: "The JSON file must contain an array of tickets." }
      const gold = data.filter((r) => r && typeof r === "object" && "labels" in r).length
      return { rows: data.length, gold }
    }
    const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
    const header = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase())
    const rows = Math.max(0, countCsvRecords(text) - 1)
    if (!header.includes("text")) return { rows, gold: 0, error: 'The CSV needs a "text" column in its header row.' }
    return { rows, gold: 0 }
  } catch (err) {
    return { rows: null, gold: 0, error: `Couldn't parse the file: ${errorMessage(err)}` }
  }
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const ids = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const choice = useModelChoice()
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [name, setName] = useState("")
  const [run, setRun] = useState(true)
  const created = useBatchCreated()

  const pick = async (f: File | undefined | null) => {
    if (!f) return
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."))
    if (!ACCEPT.includes(ext)) {
      toast.error("Unsupported file type", { description: "Use a .jsonl, .json or .csv file." })
      return
    }
    setFile(f)
    setInfo(null)
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ""))
    setInspecting(true)
    try {
      setInfo(await inspectFile(f))
    } finally {
      setInspecting(false)
    }
  }

  const clear = () => {
    setFile(null)
    setInfo(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append("file", file as File)
      if (name.trim()) form.append("name", name.trim())
      if (choice.value !== null) form.append("model_config_id", String(choice.value))
      form.append("run", run ? "true" : "false")
      return api.upload<Batch>("/batches/upload", form)
    },
    onSuccess: (batch) => {
      created(batch, run ? "Upload started" : "Tickets imported")
      onDone()
    },
    onError: (err) => toast.error("Upload failed", { description: errorMessage(err) }),
  })

  const canSubmit = Boolean(file) && !info?.error && !inspecting && (!run || choice.value !== null) && !upload.isPending
  const FileIcon = file?.name.toLowerCase().endsWith(".csv") ? FileSpreadsheet : FileJson

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) upload.mutate()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a file to upload, or drop it here"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files?.[0])
          }}
          className={cn(
            "focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-[3px]",
            dragging ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-accent/40",
          )}
        >
          <div className={cn("flex size-11 items-center justify-center rounded-full", dragging ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            <FileUp className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{dragging ? "Drop to upload" : "Drop a file here or click to browse"}</p>
            <p className="text-muted-foreground text-xs">
              <code className="font-mono">.jsonl</code>, <code className="font-mono">.json</code> array, or{" "}
              <code className="font-mono">.csv</code> with a <code className="font-mono">text</code> column
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-muted/40 flex items-start gap-3 rounded-xl border p-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <FileIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatBytes(file.size)}
              {inspecting ? " · counting rows…" : null}
              {info?.rows !== null && info?.rows !== undefined ? ` · ${info.rows.toLocaleString()} row${info.rows === 1 ? "" : "s"}` : null}
            </p>
            {info?.gold ? (
              <p className="text-success flex items-center gap-1 text-xs">
                <Sparkles className="size-3" /> {info.gold.toLocaleString()} rows carry gold labels, so the batch gets an evaluation.
              </p>
            ) : null}
            {info?.warning ? <p className="text-warning-foreground dark:text-warning text-xs">{info.warning}</p> : null}
            {info?.error ? (
              <p className="text-destructive flex items-center gap-1 text-xs">
                <AlertCircle className="size-3" /> {info.error}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={clear} aria-label="Remove file">
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-name`}>
          Batch name <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" maxLength={120} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-model`}>Model</Label>
        <ModelSelect
          id={`${ids}-model`}
          models={choice.models}
          value={choice.value}
          onChange={choice.setValue}
          isLoading={choice.isLoading}
          disabled={!run}
        />
        {run ? <ModelWarning model={choice.selected} liveTickets={false} /> : null}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor={`${ids}-run`}>Run immediately</Label>
          <p className="text-muted-foreground text-xs">
            {run ? "Tickets are triaged as soon as the upload finishes." : "Tickets are imported as new; start a batch later."}
          </p>
        </div>
        <Switch id={`${ids}-run`} checked={run} onCheckedChange={setRun} />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <LoadingButton type="submit" loading={upload.isPending} disabled={!canSubmit} icon={Upload}>
          {run ? "Upload and run" : "Upload"}
        </LoadingButton>
      </DialogFooter>
    </form>
  )
}
