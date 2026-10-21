"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, GraduationCap, Loader2, Lock, Save } from "lucide-react"
import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORY_COLOR } from "@/components/shared/badges"
import { useTicketInvalidation } from "@/components/tickets/lib"
import { api, errorMessage } from "@/lib/api"
import { iqd } from "@/lib/format"
import { useMeta } from "@/lib/hooks"
import type { Category, Priority, Role, TicketDetail } from "@/lib/types"

const NONE = "__none"

const schema = z
  .object({
    category: z.string(),
    secondary_category: z.string(),
    priority: z.string(),
    transaction_ref: z.string().max(120),
    amount_iqd: z
      .string()
      .refine((v) => v.trim() === "" || /^\d+$/.test(v.trim().replace(/,/g, "")), "Whole number of IQD, no decimals"),
    amount_text: z.string().max(200),
    date: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD"),
    date_text: z.string().max(200),
    note: z.string().max(1000),
  })
  .refine((v) => v.secondary_category === NONE || v.secondary_category !== v.category, {
    path: ["secondary_category"],
    message: "Must differ from the primary category",
  })

type Values = z.infer<typeof schema>

function defaults(t: TicketDetail): Values {
  return {
    category: t.category ?? "",
    secondary_category: t.secondary_category ?? NONE,
    priority: t.priority ?? "",
    transaction_ref: t.fields.transaction_ref ?? "",
    amount_iqd: t.fields.amount_iqd !== null ? String(t.fields.amount_iqd) : "",
    amount_text: t.fields.amount_text ?? "",
    date: t.fields.date ?? "",
    date_text: t.fields.date_text ?? "",
    note: "",
  }
}

const orNull = (v: string) => (v.trim() === "" ? null : v.trim())

function NotInText({ value, text }: { value: string; text: string }) {
  if (!value.trim() || text.includes(value.trim())) return null
  return (
    <p className="text-warning-foreground dark:text-warning flex items-center gap-1 text-xs">
      <AlertTriangle className="size-3" /> Not found word-for-word in the customer&apos;s message
    </p>
  )
}

export function EditLabelsSheet({
  open,
  onOpenChange,
  ticket,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: TicketDetail
  role: Role
}) {
  const { data: meta } = useMeta()
  const invalidate = useTicketInvalidation()
  const categoryLocked = role === "team_member"
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(ticket) })

  // Fresh values every time the sheet opens.
  useEffect(() => {
    if (open) form.reset(defaults(ticket))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open])

  const [refValue, amountText, dateText, amountValue] = useWatch({
    control: form.control,
    name: ["transaction_ref", "amount_text", "date_text", "amount_iqd"],
  })

  const save = useMutation({
    mutationFn: (v: Values) =>
      api.patch<TicketDetail>(`/tickets/${ticket.id}/labels`, {
        ...(categoryLocked || !v.category ? {} : { category: v.category as Category }),
        secondary_category: v.secondary_category === NONE ? null : (v.secondary_category as Category),
        ...(v.priority ? { priority: v.priority as Priority } : {}),
        fields: {
          transaction_ref: orNull(v.transaction_ref),
          amount_iqd: v.amount_iqd.trim() ? Number(v.amount_iqd.trim().replace(/,/g, "")) : null,
          amount_text: orNull(v.amount_text),
          date: orNull(v.date),
          date_text: orNull(v.date_text),
        },
        note: v.note.trim() || undefined,
      }),
    onSuccess: (data) => {
      invalidate(ticket.id, data)
      onOpenChange(false)
      toast.success("Labels saved", {
        description:
          data.team_key !== ticket.team_key && data.team_name ? `Category change moved it to ${data.team_name}.` : undefined,
      })
    },
    onError: (err) => toast.error("Could not save the labels", { description: errorMessage(err) }),
  })

  const parsedAmount = amountValue.trim() && /^\d+$/.test(amountValue.trim().replace(/,/g, "")) ? Number(amountValue.replace(/,/g, "")) : null

  return (
    <Sheet open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Edit labels</SheetTitle>
          <SheetDescription>
            Correct what the model got wrong for {ticket.ref}. Spans should be copied exactly from the customer&apos;s message.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <Alert className="border-primary/25 bg-primary/5">
                <GraduationCap className="text-primary" />
                <AlertDescription className="text-foreground/80">
                  Labels changed by a person become training data for the next model version.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/40 rounded-lg border px-3 py-2.5">
                <p dir="auto" className="font-arabic line-clamp-4 text-start text-sm">
                  {ticket.text}
                </p>
              </div>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Classification</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          Category {categoryLocked ? <Lock className="text-muted-foreground size-3" /> : null}
                        </FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={categoryLocked}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Choose a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(meta?.categories ?? []).map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c.key] }} aria-hidden />
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {categoryLocked ? (
                          <FormDescription>
                            Team members can&apos;t change the category. If it&apos;s wrong, send the ticket back to the agents.
                          </FormDescription>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="secondary_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Second issue</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {(meta?.categories ?? []).map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c.key] }} aria-hidden />
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Only when the customer raises a separate problem.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Choose a priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(meta?.priorities ?? []).map((p) => (
                              <SelectItem key={p.key} value={p.key}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Extracted fields</h3>
                <FormField
                  control={form.control}
                  name="transaction_ref"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction reference</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. TX12345678" className="font-mono" autoComplete="off" />
                      </FormControl>
                      <NotInText value={refValue} text={ticket.text} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="amount_iqd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (IQD)</FormLabel>
                        <FormControl>
                          <Input {...field} inputMode="numeric" placeholder="e.g. 250000" className="tabular-nums" autoComplete="off" />
                        </FormControl>
                        <FormDescription className="tabular-nums">{parsedAmount !== null ? iqd(parsedAmount) : "Normalised amount"}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount as written</FormLabel>
                        <FormControl>
                          <Input {...field} dir="auto" placeholder="ربع مليون" className="font-arabic" autoComplete="off" />
                        </FormControl>
                        <NotInText value={amountText} text={ticket.text} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" className="tabular-nums" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date as written</FormLabel>
                        <FormControl>
                          <Input {...field} dir="auto" placeholder="البارحة" className="font-arabic" autoComplete="off" />
                        </FormControl>
                        <NotInText value={dateText} text={ticket.text} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Note <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Why the labels changed" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Save labels
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
