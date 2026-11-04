"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, KeyRound, Send, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { QueryError } from "@/components/admin/common"
import { TimeAgo } from "@/components/tickets/ticket-bits"
import { api, errorMessage } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { TelegramStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{20,64}$/

const STATE: Record<TelegramStatus["state"], { label: string; className: string }> = {
  running: { label: "Connected", className: "border-success/30 bg-success/10 text-success" },
  error: { label: "Connection error", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  stopped: { label: "Off", className: "text-muted-foreground" },
}

export function TelegramCard() {
  const ids = useId()
  const qc = useQueryClient()
  const [token, setToken] = useState("")

  const status = useQuery({
    queryKey: qk.telegram,
    queryFn: () => api.get<TelegramStatus>("/telegram"),
    refetchInterval: (q) => (q.state.data?.enabled ? 10_000 : false),
  })

  const update = useMutation({
    mutationFn: (body: { enabled?: boolean; bot_token?: string }) => api.put<TelegramStatus>("/telegram", body),
    onSuccess: (data, body) => {
      qc.setQueryData(qk.telegram, data)
      if (body.bot_token !== undefined) setToken("")
      if (body.bot_token === "") toast.success("Bot token removed", { description: "The bot is off." })
      else if (body.bot_token) toast.success("Bot token saved", { description: `Connected to @${data.bot_username}.` })
      else toast.success(data.enabled ? "Telegram bot is on" : "Telegram bot is off")
    },
    onError: (err) => toast.error("Couldn't update the Telegram bot", { description: errorMessage(err) }),
  })

  const s = status.data
  const tokenInvalid = token.trim() !== "" && !TOKEN_RE.test(token.trim())

  return (
    <Card className="gap-5 lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="text-muted-foreground size-4" /> Telegram bot
        </CardTitle>
        <CardDescription>
          Customers message your bot. Each message becomes a Telegram ticket and goes through triage, checks and routing like any other
          ticket. When a reply is approved, it is sent back to the customer&apos;s chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {status.isError ? (
          <QueryError error={status.error} onRetry={() => status.refetch()} title="Couldn't load the Telegram bot" />
        ) : !s ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("font-normal", STATE[s.state].className)}>
                    {STATE[s.state].label}
                  </Badge>
                  {s.bot_username ? (
                    <a
                      href={`https://t.me/${s.bot_username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
                    >
                      @{s.bot_username} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">No bot connected</span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {s.chats} customer chat{s.chats === 1 ? "" : "s"}
                  {s.last_update_at ? (
                    <>
                      {" "}· last message <TimeAgo value={s.last_update_at} />
                    </>
                  ) : null}
                </p>
                {s.last_error ? <p className="text-destructive text-xs">{s.last_error}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor={`${ids}-enabled`} className="text-sm">
                  Receive messages
                </Label>
                <Switch
                  id={`${ids}-enabled`}
                  checked={s.enabled}
                  disabled={!s.token_set || update.isPending}
                  onCheckedChange={(v) => update.mutate({ enabled: v })}
                />
              </div>
            </div>

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (token.trim() && !tokenInvalid) update.mutate({ bot_token: token.trim(), enabled: true })
              }}
            >
              <Label htmlFor={`${ids}-token`}>Bot token</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`${ids}-token`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  placeholder={s.token_set ? `Saved token ending in ${s.token_hint}. Paste a new one to replace it.` : "123456789:AAH…"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  aria-invalid={tokenInvalid}
                  aria-describedby={`${ids}-token-help`}
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={!token.trim() || tokenInvalid || update.isPending}>
                    <KeyRound className="size-4" /> {update.isPending ? "Checking…" : "Save & connect"}
                  </Button>
                  {s.token_set ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ bot_token: "" })}
                      aria-label="Remove bot token"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <p id={`${ids}-token-help`} className={cn("text-xs", tokenInvalid ? "text-destructive" : "text-muted-foreground")}>
                {tokenInvalid ? (
                  "A bot token looks like 123456789:AAH… (digits, a colon, then letters)."
                ) : (
                  <>
                    In Telegram, open <span className="font-medium">@BotFather</span>, send <code className="font-mono">/newbot</code> and
                    paste the token it gives you. It is checked with Telegram, stored on the server and never shown again.
                  </>
                )}
              </p>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
