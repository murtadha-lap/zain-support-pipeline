"use client"

import {
  Activity,
  FlaskConical,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldOff,
  Star,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ProviderIcon } from "@/components/admin/model-select"
import { useLabel } from "@/lib/hooks"
import type { ModelConfig } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ModelCardActions {
  onEdit: (m: ModelConfig) => void
  onTest: (m: ModelConfig) => void
  onSetDefault: (m: ModelConfig) => void
  onDelete: (m: ModelConfig) => void
  onToggle: (m: ModelConfig, enabled: boolean) => void
  settingDefaultId?: number | null
}

function Pill({ tone, icon: Icon, children, tip }: { tone: string; icon: React.ElementType; children: React.ReactNode; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("cursor-default gap-1 font-normal", tone)} tabIndex={0}>
          <Icon className="size-3" /> {children}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  )
}

export function ModelCard({ model: m, actions }: { model: ModelConfig; actions: ModelCardActions }) {
  const label = useLabel()
  const switchId = `model-enabled-${m.id}`
  const params = [
    m.temperature !== null ? `temp ${m.temperature}` : null,
    `${m.max_tokens.toLocaleString()} max tokens`,
    `${m.timeout_s}s timeout`,
    m.effort ? `effort ${m.effort}` : null,
    m.provider === "anthropic" ? (m.use_fallbacks ? "fallbacks on" : "fallbacks off") : null,
  ].filter(Boolean)

  return (
    <Card className={cn("gap-4 transition-colors", m.is_default && "border-primary/40 ring-primary/15 ring-1", !m.enabled && "bg-muted/30")}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              m.is_cloud ? "bg-info/10 text-info" : m.provider === "mock" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
            )}
          >
            <ProviderIcon provider={m.provider} />
          </div>
          <span className={cn("truncate", !m.enabled && "text-muted-foreground")} title={m.name}>
            {m.name}
          </span>
          {m.is_default ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Star className="fill-warning text-warning size-4 shrink-0" aria-label="Default model" tabIndex={0} />
              </TooltipTrigger>
              <TooltipContent>Default model: used for auto-triage and new batches</TooltipContent>
            </Tooltip>
          ) : null}
        </CardTitle>
        <CardAction>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => actions.onEdit(m)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onTest(m)}>
                <FlaskConical className="size-4" /> Test
              </DropdownMenuItem>
              <DropdownMenuItem disabled={m.is_default || !m.enabled} onSelect={() => actions.onSetDefault(m)}>
                <Star className="size-4" /> {m.is_default ? "Already default" : m.enabled ? "Set as default" : "Enable to set default"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {m.is_default ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem disabled variant="destructive">
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">The default model can&apos;t be deleted. Set another default first.</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(m)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="font-normal">
            {label("providers", m.provider)}
          </Badge>
          {m.is_default ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning gap-1 font-normal">
              <Star className="size-3" /> Default
            </Badge>
          ) : null}
          {m.supports_logprobs ? (
            <Pill tone="border-success/30 bg-success/10 text-success" icon={Activity} tip="Token logprobs give a real confidence score for the category.">
              Logprobs
            </Pill>
          ) : (
            <Pill tone="text-muted-foreground" icon={ShieldOff} tip="No logprobs: confidence is empty. Tickets escalate when 'Escalate without confidence' is on.">
              No logprobs
            </Pill>
          )}
          {m.api_key_env ? (
            m.has_api_key ? (
              <Pill tone="border-success/30 bg-success/10 text-success" icon={KeyRound} tip={`${m.api_key_env} is set on the server.`}>
                Key set
              </Pill>
            ) : (
              <Pill tone="border-destructive/30 bg-destructive/5 text-destructive" icon={KeyRound} tip={`${m.api_key_env} is not set on the server. Calls will fail until it is.`}>
                Key missing
              </Pill>
            )
          ) : null}
        </div>

        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Model id</dt>
            <dd className="bg-muted/60 mt-0.5 truncate rounded-md px-2 py-1 font-mono text-xs" title={m.model_id}>
              {m.model_id}
            </dd>
          </div>
          {m.base_url ? (
            <div>
              <dt className="text-muted-foreground text-xs">Base URL</dt>
              <dd className="truncate font-mono text-xs" title={m.base_url}>
                {m.base_url}
              </dd>
            </div>
          ) : null}
          {m.api_key_env ? (
            <div>
              <dt className="text-muted-foreground text-xs">API key env</dt>
              <dd className="truncate font-mono text-xs">{m.api_key_env}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-muted-foreground text-xs tabular-nums">{params.join(" · ")}</p>
        {m.notes ? <p className="text-muted-foreground line-clamp-2 text-xs italic">{m.notes}</p> : null}
      </CardContent>

      <CardFooter className="justify-between gap-2 border-t pt-4 [.border-t]:pt-4">
        <div className="flex items-center gap-2">
          {m.is_default ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch id={switchId} checked={m.enabled} disabled aria-label="Enabled" />
                </span>
              </TooltipTrigger>
              <TooltipContent>The default model must stay enabled</TooltipContent>
            </Tooltip>
          ) : (
            <Switch id={switchId} checked={m.enabled} onCheckedChange={(v) => actions.onToggle(m, v)} />
          )}
          <Label htmlFor={switchId} className="text-sm font-normal">
            {m.enabled ? "Enabled" : "Disabled"}
          </Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => actions.onTest(m)}>
          <FlaskConical className="size-3.5" /> Test
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ModelCardSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
      <CardFooter className="justify-between border-t pt-4 [.border-t]:pt-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-16" />
      </CardFooter>
    </Card>
  )
}
