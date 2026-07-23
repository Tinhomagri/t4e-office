// Indicadores agregados do funil (/api/sales/pipeline/metrics/). Somente
// leitura: alimenta a barra de KPIs, o forecast e os alertas do Comercial.
import { useQuery } from "@tanstack/react-query"

import { api } from "@/shared/api/client"

export interface StageMetrics {
  stage_id: string
  name: string
  kind: "open" | "won" | "lost"
  color: string
  order: number
  count: number
  /** Decimal do DRF chega como string — converta com Number() na exibição. */
  total_amount: string
  weighted_amount: string
  stale_count: number
  avg_age_days: number
}

export interface OwnerMetrics {
  owner_id: string | null
  name: string
  open_count: number
  open_amount: string
  weighted_amount: string
  won_count: number
  won_amount: string
}

export interface OverdueDeal {
  id: string
  title: string
  customer: string
  amount: string
  expected_close_date: string
  days_overdue: number
  owner: string
}

export interface OverdueActivity {
  id: string
  deal_id: string
  deal_title: string
  content: string
  due_date: string | null
  assignee: string
}

export interface PipelineMetrics {
  by_stage: StageMetrics[]
  open: { count: number; amount: string; weighted_amount: string }
  closed: {
    days: number
    won_count: number
    lost_count: number
    won_amount: string
    lost_amount: string
    win_rate: number
    avg_ticket: string
    avg_cycle_days: number
  }
  forecast: { month: string; amount: string; weighted: string }[]
  by_owner: OwnerMetrics[]
  overdue_deals: OverdueDeal[]
  overdue_activities: OverdueActivity[]
}

export async function getPipelineMetrics(
  workspaceId: string,
  days = 90,
): Promise<PipelineMetrics> {
  const { data } = await api.get<PipelineMetrics>("/sales/pipeline/metrics/", {
    params: { workspace_id: workspaceId, days },
  })
  return data
}

export function usePipelineMetrics(workspaceId: string | null, days = 90) {
  return useQuery({
    queryKey: ["sales-pipeline-metrics", workspaceId, days] as const,
    queryFn: () => getPipelineMetrics(workspaceId as string, days),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}
