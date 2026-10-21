"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { ArrowLeft, CalendarDays, Hash, Lightbulb, Loader2, MessageSquareWarning, Send, ShieldAlert, Wallet } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ChannelBadge } from "@/components/shared/badges"
import { useTicketInvalidation } from "@/components/tickets/lib"
import { api, errorMessage } from "@/lib/api"
import { useMeta } from "@/lib/hooks"
import type { Channel, TicketDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

const MIN = 5
const MAX = 4000

const schema = z.object({
  text: z
    .string()
    .refine((v) => v.trim().length >= MIN, `Please write at least ${MIN} characters`)
    .refine((v) => v.trim().length <= MAX, `Please keep it under ${MAX} characters`),
  channel: z.enum(["app", "whatsapp", "telegram"]),
})

type Values = z.infer<typeof schema>

const FALLBACK_CHANNELS: { key: Channel; label: string }[] = [
  { key: "app", label: "App" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" },
]

const TIPS = [
  { icon: Hash, title: "Transaction number", ar: "رقم العملية", example: "TX…" },
  { icon: Wallet, title: "Amount", ar: "المبلغ", example: "١٠٠ الف" },
  { icon: CalendarDays, title: "Date", ar: "التاريخ", example: "البارحة" },
  { icon: MessageSquareWarning, title: "What happened", ar: "شنو صار بالضبط", example: "" },
]

export default function NewRequestPage() {
  const router = useRouter()
  const { data: meta } = useMeta()
  const invalidate = useTicketInvalidation()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { text: "", channel: "app" }, mode: "onChange" })
  const text = useWatch({ control: form.control, name: "text" })
  const length = text.trim().length

  const create = useMutation({
    mutationFn: (v: Values) => api.post<TicketDetail>("/tickets", { text: v.text.trim(), channel: v.channel }),
    onSuccess: (t) => {
      invalidate(t.id, t)
      toast.success("Request received", { description: `Your reference is ${t.ref}. We'll reply here.` })
      router.push(`/portal/tickets/${t.id}`)
    },
    onError: (err) => toast.error("Your request was not sent", { description: errorMessage(err) }),
  })

  const channels = meta?.channels.length ? meta.channels : FALLBACK_CHANNELS

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/portal">
            <ArrowLeft /> My requests
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New request</h1>
        <p className="text-muted-foreground">
          Tell us what went wrong, in Arabic or English.{" "}
          <span dir="rtl" className="font-arabic">
            اكتب بالعربي أو بالإنكليزي.
          </span>
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-5">
                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your message</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          dir="auto"
                          rows={9}
                          maxLength={MAX + 200}
                          placeholder="اكتب مشكلتك هنا… مثلاً: حولت ١٠٠ الف البارحة وما وصلت، رقم العملية TX…"
                          className="font-arabic min-h-56 resize-y text-base leading-relaxed"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault()
                              void form.handleSubmit((v) => create.mutate(v))()
                            }
                          }}
                        />
                      </FormControl>
                      <div className="flex items-center justify-between gap-2">
                        <FormMessage />
                        <span
                          className={cn(
                            "text-muted-foreground ml-auto text-xs tabular-nums",
                            length > 0 && length < MIN && "text-warning-foreground dark:text-warning",
                            length > MAX && "text-destructive font-medium",
                          )}
                          aria-live="polite"
                        >
                          {length.toLocaleString()} / {MAX.toLocaleString()}
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Where should we reply?</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full sm:w-60">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {channels.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              <ChannelBadge channel={c.key} withLabel={false} />
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-xs">
                    A person reads every reply before it is sent to you.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" asChild>
                      <Link href="/portal">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={create.isPending || length < MIN || length > MAX}>
                      {create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                      {create.isPending ? "Sending…" : "Send request"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="text-warning size-4" /> What helps us answer faster
              </CardTitle>
              <CardDescription>Include these if you have them.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {TIPS.map((t) => (
                  <li key={t.title} className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <t.icon className="size-4" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-muted-foreground">
                        <span dir="rtl" className="font-arabic">
                          {t.ar}
                        </span>
                        {t.example ? (
                          <>
                            {" · e.g. "}
                            <span dir="auto" className="font-arabic">
                              {t.example}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div role="note" className="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border p-4">
            <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-4" /> Never share your PIN or verification code
            </p>
            <p className="text-muted-foreground text-sm">We will never ask for it — not here, not by phone, not on WhatsApp.</p>
            <p dir="rtl" className="font-arabic text-foreground/90 text-start text-sm">
              لا تشارك الرمز السري (PIN) أو رمز التحقق مع أي أحد. إحنا ما نطلبه منك أبداً.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
