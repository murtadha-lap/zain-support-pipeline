"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useMe, useMyStats } from "@/lib/hooks"
import { Brand } from "./brand"
import { navFor, type NavItem } from "./nav"
import { UserMenu } from "./user-menu"

function useIsActive() {
  const pathname = usePathname()
  const search = useSearchParams()
  return (item: NavItem) => {
    const [path, qs] = item.href.split("?")
    if (qs) return pathname === path && search.toString() === qs
    if (path === "/app/admin" || path === "/app/tickets") return pathname === path && !search.get("assignee")
    return pathname === path || pathname.startsWith(`${path}/`)
  }
}

export function AppSidebar() {
  const { data: me } = useMe()
  const { data: stats } = useMyStats(Boolean(me && me.role !== "customer"))
  const isActive = useIsActive()

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/app">
                <Brand />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navFor(me?.role).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = item.badge && stats ? stats[item.badge] : 0
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count ? <SidebarMenuBadge className="tabular-nums">{count}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
