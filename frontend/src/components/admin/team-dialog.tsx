"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Plus, Save } from "lucide-react"
import { useRef } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton, TEAM_SWATCHES } from "@/components/admin/common"
import { api, errorMessage } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { Team } from "@/lib/types"
import { cn } from "@/lib/utils"

const schema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, "Lowercase letters, digits and underscores; start with a letter (2–40 chars)"),
  name: z.string().trim().min(2, "Enter a team name").max(80),
  name_ar: z.string().trim().min(2, "Enter the Arabic name").max(80),
  description: z.string().trim().max(500, "Keep it under 500 characters"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
})
// Existing keys are not editable, so don't block saving on a legacy key format.
const editSchema = schema.extend({ key: z.string() })
type Values = z.infer<typeof schema>

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40)
}

export function TeamDialog({ open, onOpenChange, team }: { open: boolean; onOpenChange: (o: boolean) => void; team?: Team | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? `Edit ${team.name}` : "Add team"}</DialogTitle>
          <DialogDescription>
            {team ? "The key stays the same so routing rules and members keep pointing here." : "Teams work the tickets routed to them by category."}
          </DialogDescription>
        </DialogHeader>
        <TeamForm key={team?.key ?? "new"} team={team ?? undefined} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function TeamForm({ team, onDone }: { team?: Team; onDone: () => void }) {
  const qc = useQueryClient()
  const keyTouched = useRef(Boolean(team))
  const form = useForm<Values>({
    resolver: zodResolver(team ? editSchema : schema),
    defaultValues: {
      key: team?.key ?? "",
      name: team?.name ?? "",
      name_ar: team?.name_ar ?? "",
      description: team?.description ?? "",
      color: team?.color ?? TEAM_SWATCHES[0].hex,
    },
    mode: "onChange",
  })

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = { name: v.name.trim(), name_ar: v.name_ar.trim(), description: v.description.trim(), color: v.color }
      return team ? api.patch<Team>(`/teams/${team.key}`, body) : api.post<Team>("/teams", { key: v.key.trim(), ...body })
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.teams })
      qc.invalidateQueries({ queryKey: qk.users() })
      toast.success(team ? "Team updated" : "Team added", { description: t.name })
      onDone()
    },
    onError: (err) => toast.error(team ? "Couldn't update the team" : "Couldn't add the team", { description: errorMessage(err) }),
  })

  const swatches: { hex: string; name: string }[] = [...TEAM_SWATCHES]
  const current = form.getValues("color")
  if (team && !swatches.some((s) => s.hex.toLowerCase() === current.toLowerCase())) swatches.push({ hex: current, name: "Current" })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  placeholder="e.g. Transfers"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e)
                    if (!keyTouched.current) form.setValue("key", slug(e.target.value), { shouldValidate: true })
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Key</FormLabel>
              <FormControl>
                <Input
                  className="font-mono text-sm"
                  placeholder="transfers"
                  spellCheck={false}
                  autoCapitalize="off"
                  disabled={Boolean(team)}
                  {...field}
                  onChange={(e) => {
                    keyTouched.current = true
                    field.onChange(e)
                  }}
                />
              </FormControl>
              <FormDescription>{team ? "The key can't be changed." : "Used by routing rules and the API. Can't be changed later."}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name_ar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Arabic name</FormLabel>
              <FormControl>
                <Input dir="rtl" placeholder="قسم الحوالات" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="What this team handles" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Colour</FormLabel>
              <FormControl>
                <div role="radiogroup" aria-label="Team colour" className="flex flex-wrap gap-2">
                  {swatches.map((s) => {
                    const selected = field.value.toLowerCase() === s.hex.toLowerCase()
                    return (
                      <button
                        key={s.hex}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={s.name}
                        title={s.name}
                        onClick={() => field.onChange(s.hex)}
                        className={cn(
                          "focus-visible:ring-ring/50 ring-offset-background flex size-8 items-center justify-center rounded-full transition-transform outline-none hover:scale-110 focus-visible:ring-[3px]",
                          selected && "ring-foreground/70 ring-2 ring-offset-2",
                        )}
                        style={{ background: s.hex }}
                      >
                        {selected ? <Check className="size-4 text-white drop-shadow" /> : null}
                      </button>
                    )
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <LoadingButton
            type="submit"
            loading={save.isPending}
            disabled={!form.formState.isValid || (Boolean(team) && !form.formState.isDirty)}
            icon={team ? Save : Plus}
          >
            {team ? "Save changes" : "Add team"}
          </LoadingButton>
        </DialogFooter>
      </form>
    </Form>
  )
}
