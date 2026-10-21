"use client"

import { useParams } from "next/navigation"
import { Suspense } from "react"
import { RoleGuard } from "@/components/shared/page"
import { TicketWorkspace, WorkspaceSkeleton } from "@/components/tickets/workspace/workspace"

export default function TicketPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <RoleGuard roles={["agent", "team_member", "admin"]}>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <TicketWorkspace id={id} />
      </Suspense>
    </RoleGuard>
  )
}
