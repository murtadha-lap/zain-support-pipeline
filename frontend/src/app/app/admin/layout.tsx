import type { Metadata } from "next"
import { RoleGuard } from "@/components/shared/page"

export const metadata: Metadata = { title: "Admin" }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["admin"]}>{children}</RoleGuard>
}
