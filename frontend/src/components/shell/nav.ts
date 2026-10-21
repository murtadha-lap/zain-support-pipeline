import {
  Boxes,
  Cpu,
  Download,
  Gauge,
  Inbox,
  LayoutList,
  Settings2,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react"
import type { MyStats, Role } from "@/lib/types"

export interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  roles: Role[]
  badge?: keyof MyStats
  description?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      {
        title: "Review queue",
        href: "/app/inbox",
        icon: Inbox,
        roles: ["agent", "admin"],
        badge: "escalated_open",
        description: "Escalated tickets the model was not sure about",
      },
      {
        title: "Team queue",
        href: "/app/team",
        icon: Boxes,
        roles: ["team_member"],
        badge: "team_open",
        description: "Tickets routed to your team",
      },
      {
        title: "Assigned to me",
        href: "/app/tickets?assignee=me",
        icon: UserCheck,
        roles: ["agent", "team_member", "admin"],
        badge: "assigned_to_me",
      },
      {
        title: "All tickets",
        href: "/app/tickets",
        icon: LayoutList,
        roles: ["agent", "admin"],
        description: "Search and filter every ticket",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Dashboard", href: "/app/admin", icon: Gauge, roles: ["admin"], description: "KPIs and charts" },
      { title: "Batches", href: "/app/admin/batches", icon: Workflow, roles: ["admin"], description: "Run and upload batches" },
      { title: "Models", href: "/app/admin/models", icon: Cpu, roles: ["admin"], description: "Local vLLM and cloud models" },
      { title: "Users", href: "/app/admin/users", icon: Users, roles: ["admin"], description: "Accounts and roles" },
      { title: "Teams & routing", href: "/app/admin/teams", icon: Boxes, roles: ["admin"], description: "Teams and category routing" },
      { title: "Settings", href: "/app/admin/settings", icon: Settings2, roles: ["admin"], description: "Threshold and pipeline settings" },
      { title: "Export", href: "/app/admin/export", icon: Download, roles: ["admin"], description: "Corrections for retraining" },
    ],
  },
]

export function navFor(role: Role | undefined): NavGroup[] {
  if (!role) return []
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length)
}
