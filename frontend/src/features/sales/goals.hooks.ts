// Hooks de Metas & Forecast — react-query no padrão de proposals.hooks.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { toast } from "@/shared/ui/toast"

import * as goalsApi from "./goals.api"
import type { CreateGoalInput, UpdateGoalInput } from "./goals.types"

export const goalKeys = {
  forecast: (workspaceId: string | null, period: string) =>
    ["sales-goals-forecast", workspaceId, period] as const,
}

export function useGoalForecast(workspaceId: string | null, period: string) {
  return useQuery({
    queryKey: goalKeys.forecast(workspaceId, period),
    queryFn: () => goalsApi.getGoalForecast(workspaceId as string, period),
    enabled: Boolean(workspaceId && period),
  })
}

export function useCreateGoal(workspaceId: string | null, period: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGoalInput) => goalsApi.createGoal(workspaceId as string, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: goalKeys.forecast(workspaceId, period) })
      toast.success("Meta criada.")
    },
    onError: () => toast.error("Não foi possível criar a meta. Já existe uma para esse escopo?"),
  })
}

export function useUpdateGoal(workspaceId: string | null, period: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGoalInput }) =>
      goalsApi.updateGoal(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: goalKeys.forecast(workspaceId, period) })
      toast.success("Meta atualizada.")
    },
  })
}

export function useDeleteGoal(workspaceId: string | null, period: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.deleteGoal(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: goalKeys.forecast(workspaceId, period) })
      toast.success("Meta removida.")
    },
  })
}
