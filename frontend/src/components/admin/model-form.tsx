"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Info, Save } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton } from "@/components/admin/common"
import { ProviderIcon } from "@/components/admin/model-select"
import { api, errorMessage } from "@/lib/api"
import { qk, useMeta } from "@/lib/hooks"
import type { ModelConfig, ModelConfigInput, Provider } from "@/lib/types"

const PROVIDERS = ["vllm", "openai_compatible", "anthropic", "mock"] as const

const intIn = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} is required`)
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `${what} must be a whole number from ${min} to ${max}`)

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Keep the name under 100 characters"),
    provider: z.enum(PROVIDERS),
    model_id: z.string().trim().min(1, "Model id is required").max(200),
    base_url: z.string().trim(),
    api_key_env: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(v), "Use an environment variable name like MY_API_KEY"),
    temperature: z
      .string()
      .trim()
      .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 2), "Temperature must be between 0 and 2"),
    supports_logprobs: z.boolean(),
    effort: z.enum(["low", "medium", "high"]),
    use_fallbacks: z.boolean(),
    max_tokens: intIn(64, 32000, "Max tokens"),
    timeout_s: intIn(1, 600, "Timeout"),
    enabled: z.boolean(),
    notes: z.string().max(1000, "Keep notes under 1000 characters"),
  })
  .superRefine((v, ctx) => {
    if (v.provider === "vllm" || v.provider === "openai_compatible") {
      if (!v.base_url) ctx.addIssue({ code: "custom", path: ["base_url"], message: "Base URL is required for this provider" })
      else if (!/^https?:\/\/\S+$/.test(v.base_url))
        ctx.addIssue({ code: "custom", path: ["base_url"], message: "Use a full URL, e.g. http://localhost:8001/v1" })
    }
  })

type FormValues = z.infer<typeof schema>

function defaults(model?: ModelConfig): FormValues {
  if (model) {
    return {
      name: model.name,
      provider: model.provider,
      model_id: model.model_id,
      base_url: model.base_url ?? "",
      api_key_env: model.api_key_env ?? "",
      temperature: model.temperature === null ? "" : String(model.temperature),
      supports_logprobs: model.supports_logprobs,
      effort: model.effort ?? "medium",
      use_fallbacks: model.use_fallbacks,
      max_tokens: String(model.max_tokens),
      timeout_s: String(model.timeout_s),
      enabled: model.enabled,
      notes: model.notes ?? "",
    }
  }
  return {
    name: "",
    provider: "vllm",
    model_id: "",
    base_url: "http://localhost:8001/v1",
    api_key_env: "",
    temperature: "0",
    supports_logprobs: true,
    effort: "medium",
    use_fallbacks: true,
    max_tokens: "1024",
    timeout_s: "60",
    enabled: true,
    notes: "",
  }
}

function toPayload(v: FormValues): ModelConfigInput {
  const openaiLike = v.provider === "vllm" || v.provider === "openai_compatible"
  const anthropic = v.provider === "anthropic"
  return {
    name: v.name.trim(),
    provider: v.provider,
    model_id: v.model_id.trim(),
    base_url: openaiLike ? v.base_url.trim() : null,
    api_key_env: openaiLike || anthropic ? v.api_key_env.trim() || null : null,
    supports_logprobs: openaiLike ? v.supports_logprobs : false,
    temperature: openaiLike && v.temperature !== "" ? Number(v.temperature) : null,
    effort: anthropic ? v.effort : null,
    use_fallbacks: anthropic ? v.use_fallbacks : false,
    max_tokens: Number(v.max_tokens),
    timeout_s: Number(v.timeout_s),
    enabled: v.enabled,
    notes: v.notes.trim(),
  }
}

export function ModelFormSheet({
  open,
  onOpenChange,
  model,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: ModelConfig
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{model ? `Edit ${model.name}` : "Add model"}</SheetTitle>
          <SheetDescription>
            {model
              ? "Changes apply to the next triage call. Running batches keep the settings they started with."
              : "Register a local vLLM model, a cloud API, or the offline mock classifier."}
          </SheetDescription>
        </SheetHeader>
        <ModelForm key={model?.id ?? "new"} model={model} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function ModelForm({ model, onDone }: { model?: ModelConfig; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: meta } = useMeta()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(model), mode: "onChange" })
  const provider = useWatch({ control: form.control, name: "provider" })
  const openaiLike = provider === "vllm" || provider === "openai_compatible"

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      model ? api.patch<ModelConfig>(`/models/${model.id}`, toPayload(v)) : api.post<ModelConfig>("/models", toPayload(v)),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: qk.models })
      toast.success(model ? "Model updated" : "Model added", { description: m.name })
      onDone()
    },
    onError: (err) => toast.error(model ? "Couldn't update the model" : "Couldn't add the model", { description: errorMessage(err) }),
  })

  const onProviderChange = (p: Provider) => {
    form.setValue("provider", p, { shouldValidate: true, shouldDirty: true })
    const v = form.getValues()
    if (p === "anthropic") {
      if (!v.api_key_env) form.setValue("api_key_env", "ANTHROPIC_API_KEY", { shouldValidate: true })
      form.setValue("supports_logprobs", false)
    } else if (p === "vllm") {
      if (!v.base_url) form.setValue("base_url", "http://localhost:8001/v1", { shouldValidate: true })
      if (v.api_key_env === "ANTHROPIC_API_KEY") form.setValue("api_key_env", "", { shouldValidate: true })
      form.setValue("supports_logprobs", true)
    } else if (p === "openai_compatible") {
      if (v.base_url.includes("localhost")) form.setValue("base_url", "", { shouldValidate: true })
      if (v.api_key_env === "ANTHROPIC_API_KEY" || !v.api_key_env) form.setValue("api_key_env", "OPENAI_API_KEY", { shouldValidate: true })
    }
    form.trigger()
  }

  const providerLabel = (p: Provider) => meta?.providers.find((o) => o.key === p)?.label ?? p
  const disabled = save.isPending || !form.formState.isValid || (Boolean(model) && !form.formState.isDirty)

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input autoFocus placeholder="e.g. Qwen3 8B + triage LoRA" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <Select value={field.value} onValueChange={(v) => onProviderChange(v as Provider)} disabled={Boolean(model)}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent position="popper">
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        <ProviderIcon provider={p} className="text-muted-foreground" />
                        {providerLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {model
                    ? "The provider can't be changed after creation; add a new model instead."
                    : provider === "mock"
                      ? "Offline keyword classifier for development and demos. No network calls."
                      : provider === "vllm"
                        ? "Runs on-prem; ticket text never leaves the server."
                        : "Cloud provider: ticket text is sent to an external API."}
                </FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model id</FormLabel>
                <FormControl>
                  <Input
                    className="font-mono text-sm"
                    placeholder={provider === "anthropic" ? "claude-opus-5-5" : provider === "mock" ? "mock-keywords" : "zain-triage-lora"}
                    spellCheck={false}
                    autoCapitalize="off"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {provider === "vllm"
                    ? "The name vLLM serves. Each LoRA adapter (--lora-modules name=path) is its own model id."
                    : "Exactly as the provider's API expects it."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {openaiLike ? (
            <>
              <FormField
                control={form.control}
                name="base_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL</FormLabel>
                    <FormControl>
                      <Input
                        className="font-mono text-sm"
                        placeholder={provider === "vllm" ? "http://localhost:8001/v1" : "https://api.example.com/v1"}
                        spellCheck={false}
                        autoCapitalize="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>OpenAI-compatible endpoint, including /v1.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="api_key_env"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        API key env var <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input className="font-mono text-sm" placeholder="VLLM_API_KEY" spellCheck={false} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="temperature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperature</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" step="0.1" min={0} max={2} placeholder="0" className="tabular-nums" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="supports_logprobs"
                render={({ field }) => (
                  <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                      <FormLabel>Supports logprobs</FormLabel>
                      <FormDescription>
                        Needed for a confidence score. Without it, tickets escalate if &quot;Escalate without confidence&quot; is on.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          ) : null}

          {provider === "anthropic" ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="effort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effort</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper">
                          <SelectItem value="low">Low (fastest)</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High (most thorough)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="api_key_env"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API key env var</FormLabel>
                      <FormControl>
                        <Input className="font-mono text-sm" placeholder="ANTHROPIC_API_KEY" spellCheck={false} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="use_fallbacks"
                render={({ field }) => (
                  <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                      <FormLabel>Use fallbacks</FormLabel>
                      <FormDescription>On a policy refusal, the API retries the request on another Claude model.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Alert>
                <Info />
                <AlertDescription className="text-xs">
                  Claude models return no token logprobs, so their confidence is empty. Temperature is not sent.
                </AlertDescription>
              </Alert>
            </>
          ) : null}

          <Separator />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="max_tokens"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max tokens</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={64} max={32000} className="tabular-nums" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timeout_s"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timeout (seconds)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={1} max={600} className="tabular-nums" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <FormLabel>Enabled</FormLabel>
                  <FormDescription>Disabled models are hidden from batch and re-triage menus.</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={model?.is_default} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Training run, dataset version, known weaknesses…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <LoadingButton type="submit" loading={save.isPending} disabled={disabled} icon={Save}>
            {model ? "Save changes" : "Add model"}
          </LoadingButton>
        </SheetFooter>
      </form>
    </Form>
  )
}
