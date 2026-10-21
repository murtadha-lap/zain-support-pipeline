"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, Loader2 } from "lucide-react"
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

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
})

const DEMO = [
  { label: "Admin", email: "admin@zain.local", password: "Admin123!" },
  { label: "Agent", email: "agent@zain.local", password: "Agent123!" },
  { label: "Team", email: "transfers@zain.local", password: "Team123!" },
  { label: "Customer", email: "customer@zain.local", password: "Customer123!" },
]

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const [show, setShow] = useState(false)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })

  const login = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.post<User>("/auth/login", values),
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user)
      const next = params.get("next")
      router.replace(next && next.startsWith("/") ? next : ROLE_HOME[user.role])
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in to your workspace or help centre.</p>
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
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                </FormControl>
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
                  <FormControl>
                    <Input type={show ? "text" : "password"} autoComplete="current-password" className="pr-10" {...field} />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 size-9"
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
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      </Form>
      <div className="space-y-2">
        <p className="text-muted-foreground text-center text-xs">Demo accounts (seeded data)</p>
        <div className="grid grid-cols-4 gap-2">
          {DEMO.map((d) => (
            <Button
              key={d.email}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                form.setValue("email", d.email)
                form.setValue("password", d.password)
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-center text-sm">
        New customer?{" "}
        <Link href="/register" className="text-foreground font-medium underline-offset-4 hover:underline">
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
