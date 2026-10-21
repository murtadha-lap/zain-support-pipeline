"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Meta, MyStats, Option, Role, Team, User } from "@/lib/types"

// Query keys shared across features so invalidation stays consistent.
export const qk = {
  me: ["me"] as const,
  meta: ["meta"] as const,
  teams: ["teams"] as const,
  routing: ["routing"] as const,
  models: ["models"] as const,
  settings: ["settings"] as const,
  users: (q?: object) => ["users", q ?? {}] as const,
  tickets: (q?: object) => ["tickets", q ?? {}] as const,
  ticket: (id: number | string) => ["ticket", String(id)] as const,
  batches: ["batches"] as const,
  batch: (id: number | string) => ["batch", String(id)] as const,
  overview: ["stats", "overview"] as const,
  myStats: ["stats", "me"] as const,
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<User>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  })
}

export function useMeta() {
  return useQuery({
    queryKey: qk.meta,
    queryFn: () => api.get<Meta>("/meta"),
    staleTime: Infinity,
  })
}

export function useTeams(enabled = true) {
  return useQuery({
    queryKey: qk.teams,
    queryFn: () => api.get<Team[]>("/teams"),
    staleTime: 60_000,
    enabled,
  })
}

export function useMyStats(enabled = true) {
  return useQuery({
    queryKey: qk.myStats,
    queryFn: () => api.get<MyStats>("/stats/me"),
    refetchInterval: 15_000,
    enabled,
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      qc.clear()
      router.replace("/login")
    },
  })
}

// Label lookup from /api/meta with a readable fallback while meta is loading.
export function useLabel() {
  const { data } = useMeta()
  return (group: keyof Meta, key: string | null | undefined): string => {
    if (!key) return "—"
    const list = (data?.[group] ?? []) as Option[]
    return list.find((o) => o.key === key)?.label ?? humanize(key)
  }
}

export function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

export const ROLE_HOME: Record<Role, string> = {
  customer: "/portal",
  agent: "/app/inbox",
  team_member: "/app/team",
  admin: "/app/admin",
}

export const STAFF_ROLES: Role[] = ["agent", "team_member", "admin"]
