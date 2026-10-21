"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Eye, EyeOff, Headset, Loader2, Lock, Mail, ShieldCheck, User as UserIcon, Users } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { qk, ROLE_HOME } from "@/lib/hooks"
import type { User } from "@/lib/types"
import { cn } from "@/lib/utils"

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
})
type Values = z.infer<typeof schema>

const DEMO = [
  { label: "Admin", hint: "Dashboard & models", icon: ShieldCheck, email: "admin@zain.local", password: "Admin123!" },
  { label: "Agent", hint: "Review queue", icon: Headset, email: "agent@zain.local", password: "Agent123!" },
  { label: "Team", hint: "Transfers queue", icon: Users, email: "transfers@zain.local", password: "Team123!" },
  { label: "Customer", hint: "Help centre", icon: UserIcon, email: "customer@zain.local", password: "Customer123!" },
]

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const [show, setShow] = useState(false)
  const [demoEmail, setDemoEmail] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })

  const login = useMutation({
    mutationFn: (values: Values) => api.post<User>("/auth/login", values),
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user)
      const next = params.get("next")
      router.replace(next && next.startsWith("/") ? next : ROLE_HOME[user.role])
    },
    onSettled: () => setDemoEmail(null),
  })

  const signInAs = (d: (typeof DEMO)[number]) => {
    form.setValue("email", d.email)
    form.setValue("password", d.password)
    setDemoEmail(d.email)
    login.mutate({ email: d.email, password: d.password })
  }

  const busy = login.isPending

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to your workspace or help centre.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => login.mutate(v))} className="space-y-4">
          {login.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(login.error)}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <div className="relative">
                  <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" className="h-11 pl-9" {...field} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <div className="relative">
                  <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <FormControl>
                    <Input
                      type={show ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-11 pr-11 pl-9"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground absolute top-1/2 right-1 size-9 -translate-y-1/2"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="group h-11 w-full" disabled={busy}>
            {busy && !demoEmail ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
            {!busy ? <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /> : null}
          </Button>
        </form>
      </Form>

      <div className="space-y-3">
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="bg-border h-px flex-1" />
          or try a demo account
          <span className="bg-border h-px flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => {
            const loading = busy && demoEmail === d.email
            return (
              <button
                key={d.email}
                type="button"
                disabled={busy}
                onClick={() => signInAs(d)}
                className={cn(
                  "group bg-card flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  "hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  "disabled:pointer-events-none disabled:opacity-60",
                  loading && "border-primary/50 bg-primary/5",
                )}
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <d.icon className="size-4" />}
                </span>
                <span className="grid leading-tight">
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="text-muted-foreground truncate text-xs">{d.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        New customer?{" "}
        <Link href="/register" className="text-primary font-medium underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
