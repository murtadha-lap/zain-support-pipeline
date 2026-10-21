"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { Batch, ModelConfig, Overview, RoutingRule, Settings } from "@/lib/types"
import { isBatchActive } from "@/components/admin/common"

export function useModels() {
  return useQuery({
    queryKey: qk.models,
    queryFn: () => api.get<ModelConfig[]>("/models"),
    staleTime: 30_000,
  })
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<Settings>("/settings"),
    staleTime: 30_000,
  })
}

export function useOverview() {
  return useQuery({
    queryKey: qk.overview,
    queryFn: () => api.get<Overview>("/stats/overview"),
    refetchInterval: (q) => (q.state.data?.recent_batches.some(isBatchActive) ? 5_000 : 60_000),
  })
}

export function useRouting() {
  return useQuery({
    queryKey: qk.routing,
    queryFn: () => api.get<RoutingRule[]>("/routing"),
  })
}

export function useBatches() {
  return useQuery({
    queryKey: qk.batches,
    queryFn: () => api.get<Batch[]>("/batches"),
    refetchInterval: (q) => (q.state.data?.some(isBatchActive) ? 2_000 : false),
  })
}
