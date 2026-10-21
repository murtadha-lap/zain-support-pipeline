"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { PageSkeleton } from "@/components/shared/page"
import { ROLE_HOME, useMe } from "@/lib/hooks"

export default function AppHome() {
  const { data: me } = useMe()
  const router = useRouter()
  useEffect(() => {
    if (me) router.replace(ROLE_HOME[me.role])
  }, [me, router])
  return <PageSkeleton />
}
