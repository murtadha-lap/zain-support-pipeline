"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Suspense, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/shared/page"
import { Brand } from "@/components/shell/brand"
import { ThemeToggle, UserMenu } from "@/components/shell/user-menu"
import { ROLE_HOME, useMe } from "@/lib/hooks"

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe()
  const router = useRouter()

  useEffect(() => {
    if (isError) router.replace("/login")
    if (me && me.role !== "customer") router.replace(ROLE_HOME[me.role])
  }, [me, isError, router])

  return (
    <div className="from-primary/5 via-background to-background min-h-svh bg-gradient-to-b">
      <header className="bg-background/70 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/portal">
            <Brand subtitle="Customer help centre" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/portal/new">
                <Plus className="size-4" /> New request
              </Link>
            </Button>
            <ThemeToggle />
            <UserMenu compact />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {isLoading || !me || me.role !== "customer" ? (
          <PageSkeleton />
        ) : (
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        )}
      </main>
    </div>
  )
}
