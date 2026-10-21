"use client"

import { usePathname, useRouter } from "next/navigation"
import { Fragment, Suspense, useEffect } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { PageSkeleton } from "@/components/shared/page"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { CommandMenu } from "@/components/shell/command-menu"
import { ThemeToggle } from "@/components/shell/user-menu"
import { humanize, useMe } from "@/lib/hooks"

const SEGMENT_LABEL: Record<string, string> = {
  app: "Workspace",
  inbox: "Review queue",
  team: "Team queue",
  tickets: "Tickets",
  admin: "Admin",
  batches: "Batches",
  models: "Models",
  users: "Users",
  teams: "Teams & routing",
  settings: "Settings",
  export: "Export",
}

function Crumbs() {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {parts.map((p, i) => {
          const isId = /^\d+$/.test(p)
          const label =
            SEGMENT_LABEL[p] ??
            (isId ? (parts[i - 1] === "tickets" ? `ZS-${p.padStart(6, "0")}` : `#${p}`) : humanize(p))
          const last = i === parts.length - 1
          return (
            <Fragment key={`${p}-${i}`}>
              <BreadcrumbItem className={i === 0 ? "hidden md:block" : undefined}>
                {last ? <BreadcrumbPage>{label}</BreadcrumbPage> : <span>{label}</span>}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator className={i === 0 ? "hidden md:block" : undefined} /> : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe()
  const router = useRouter()

  useEffect(() => {
    if (isError) router.replace("/login")
    if (me?.role === "customer") router.replace("/portal")
  }, [me, isError, router])

  if (isLoading || !me || me.role === "customer") {
    return (
      <div className="p-8">
        <PageSkeleton />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <Suspense>
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Crumbs />
          <div className="ml-auto flex items-center gap-2">
            <CommandMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
