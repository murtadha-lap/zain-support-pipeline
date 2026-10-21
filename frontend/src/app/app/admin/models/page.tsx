"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Cloud, Cpu, FlaskConical, Info, Plus, Server, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/shared/page"
import { ConfirmDialog, QueryError, useDialogTarget } from "@/components/admin/common"
import { ModelCard, ModelCardSkeleton, type ModelCardActions } from "@/components/admin/model-card"
import { ModelFormSheet } from "@/components/admin/model-form"
import { ModelTestDialog } from "@/components/admin/model-test-dialog"
import { useModels, useSettings } from "@/components/admin/queries"
import { api, errorMessage } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { ModelConfig } from "@/lib/types"

const SECTIONS: { key: string; title: string; description: string; icon: React.ElementType; match: (m: ModelConfig) => boolean }[] = [
  {
    key: "local",
    title: "Local (vLLM)",
    description: "On-prem models served with vLLM. Ticket text never leaves the server; logprobs give a confidence score.",
    icon: Server,
    match: (m) => m.provider === "vllm",
  },
  {
    key: "cloud",
    title: "Cloud",
    description: "External APIs. Used for uploaded synthetic tickets and comparisons.",
    icon: Cloud,
    match: (m) => m.provider === "openai_compatible" || m.provider === "anthropic",
  },
  {
    key: "dev",
    title: "Development",
    description: "Offline mock classifier for demos and tests.",
    icon: FlaskConical,
    match: (m) => m.provider === "mock",
  },
]

export default function ModelsPage() {
  const qc = useQueryClient()
  const models = useModels()
  const { data: settings } = useSettings()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ModelConfig | undefined>()
  const testing = useDialogTarget<ModelConfig>()
  const deleting = useDialogTarget<ModelConfig>()

  const toggle = useMutation({
    mutationFn: ({ m, enabled }: { m: ModelConfig; enabled: boolean }) => api.patch<ModelConfig>(`/models/${m.id}`, { enabled }),
    onMutate: async ({ m, enabled }) => {
      await qc.cancelQueries({ queryKey: qk.models })
      const previous = qc.getQueryData<ModelConfig[]>(qk.models)
      qc.setQueryData<ModelConfig[]>(qk.models, (old) => old?.map((x) => (x.id === m.id ? { ...x, enabled } : x)))
      return { previous }
    },
    onError: (err, { m }, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.models, ctx.previous)
      toast.error(`Couldn't update ${m.name}`, { description: errorMessage(err) })
    },
    onSuccess: (m) => toast.success(`${m.name} ${m.enabled ? "enabled" : "disabled"}`),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.models }),
  })

  const setDefault = useMutation({
    mutationFn: (m: ModelConfig) => api.post<ModelConfig>(`/models/${m.id}/default`),
    onMutate: (m) => ({ toastId: toast.loading(`Making ${m.name} the default…`) }),
    onSuccess: (m, _, ctx) => {
      toast.success("Default model changed", { id: ctx?.toastId, description: `${m.name} is now used for auto-triage and new batches.` })
    },
    onError: (err, _, ctx) => toast.error("Couldn't change the default", { id: ctx?.toastId, description: errorMessage(err) }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.models }),
  })

  const remove = useMutation({
    mutationFn: (m: ModelConfig) => api.delete(`/models/${m.id}`),
    onSuccess: (_, m) => {
      toast.success("Model deleted", { description: m.name })
      qc.invalidateQueries({ queryKey: qk.models })
      deleting.close()
    },
    onError: (err) => toast.error("Couldn't delete the model", { description: errorMessage(err) }),
  })

  const actions: ModelCardActions = {
    onEdit: (m) => {
      setEditing(m)
      setFormOpen(true)
    },
    onTest: (m) => testing.show(m),
    onSetDefault: (m) => setDefault.mutate(m),
    onDelete: (m) => deleting.show(m),
    onToggle: (m, enabled) => toggle.mutate({ m, enabled }),
  }

  const openAdd = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  const list = models.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Models"
        description="Which model proposes the triage. Code checks and people make the decisions."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add model
          </Button>
        }
      />

      <Alert className="border-info/30 bg-info/5">
        <Info className="text-info" />
        <AlertTitle>Where ticket text goes</AlertTitle>
        <AlertDescription>
          <p>
            Cloud models only process uploaded synthetic tickets unless <strong className="text-foreground font-medium">Allow cloud for live tickets</strong> is
            on in{" "}
            <Link href="/app/admin/settings" className="text-foreground underline underline-offset-2">
              Settings
            </Link>
            {settings ? (
              <span className={settings.allow_cloud_for_live_tickets ? "text-warning-foreground dark:text-warning font-medium" : undefined}>
                {" "}
                (currently {settings.allow_cloud_for_live_tickets ? "on" : "off"})
              </span>
            ) : null}
            . Local models are served with vLLM (see <code className="font-mono text-xs">docs/vllm.md</code>); each LoRA adapter name is its own
            model id.
          </p>
        </AlertDescription>
      </Alert>

      {models.isError ? (
        <QueryError error={models.error} onRetry={() => models.refetch()} title="Couldn't load models" />
      ) : models.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No models configured"
          description="Add a local vLLM model (or the mock classifier for a quick demo) to start triaging tickets."
          action={
            <Button onClick={openAdd}>
              <Plus className="size-4" /> Add model
            </Button>
          }
        />
      ) : (
        SECTIONS.map((s) => {
          const items = list.filter(s.match)
          if (!items.length) return null
          const Icon = s.icon
          return (
            <section key={s.key} className="space-y-3" aria-labelledby={`models-${s.key}`}>
              <div className="flex items-start gap-2">
                <Icon className="text-muted-foreground mt-0.5 size-4" />
                <div>
                  <h2 id={`models-${s.key}`} className="font-semibold tracking-tight">
                    {s.title} <span className="text-muted-foreground font-normal tabular-nums">· {items.length}</span>
                  </h2>
                  <p className="text-muted-foreground text-sm">{s.description}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((m) => (
                  <ModelCard key={m.id} model={m} actions={actions} />
                ))}
              </div>
            </section>
          )
        })
      )}

      <ModelFormSheet open={formOpen} onOpenChange={setFormOpen} model={editing} />
      <ModelTestDialog model={testing.target} open={testing.open} onOpenChange={testing.onOpenChange} />

      <ConfirmDialog
        open={deleting.open}
        onOpenChange={deleting.onOpenChange}
        title={`Delete ${deleting.target?.name ?? "model"}?`}
        description={
          <p>
            The configuration is removed and the model disappears from batch and re-triage menus. Past triages keep the model name
            and id they were made with. This can&apos;t be undone.
          </p>
        }
        confirmLabel="Delete model"
        icon={Trash2}
        loading={remove.isPending}
        onConfirm={() => deleting.target && remove.mutate(deleting.target)}
      />
    </div>
  )
}
