"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ROLE_HOME, useMe } from "@/lib/hooks"

export default function Home() {
  const { data: me, isError } = useMe()
  const router = useRouter()
  useEffect(() => {
    if (me) router.replace(ROLE_HOME[me.role])
    else if (isError) router.replace("/login")
  }, [me, isError, router])
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}
