// Camada HTTP de Metas & Forecast.
import { api } from "@/shared/api/client"

import type { CreateGoalInput, Goal, GoalForecast, UpdateGoalInput } from "./goals.types"

export async function listGoals(workspaceId: string, period?: string): Promise<Goal[]> {
  const { data } = await api.get<Goal[]>("/sales/goals/", {
    params: { workspace_id: workspaceId, period },
  })
  return data
}

export async function createGoal(
  workspaceId: string,
  input: CreateGoalInput,
): Promise<Goal> {
  const { data } = await api.post<Goal>("/sales/goals/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

export async function updateGoal(goalId: string, input: UpdateGoalInput): Promise<Goal> {
  const { data } = await api.patch<Goal>(`/sales/goals/${goalId}/`, input)
  return data
}

export async function deleteGoal(goalId: string): Promise<void> {
  await api.delete(`/sales/goals/${goalId}/`)
}

export async function getGoalForecast(
  workspaceId: string,
  period?: string,
): Promise<GoalForecast> {
  const { data } = await api.get<GoalForecast>("/sales/goals/forecast/", {
    params: { workspace_id: workspaceId, period },
  })
  return data
}
