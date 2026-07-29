// Tipos de Metas & Forecast. Espelham
// `contexts/sales/interface/api/goal_serializers.py` e `goal_views.py`.
//
// Valores monetários chegam como string (Decimal do DRF) — quem calcula é o
// backend, o frontend só formata.

export interface Goal {
  id: string
  workspace_id: string
  period: string // "AAAA-MM"
  target_amount: string
  currency: string
  owner_id: string | null
}

export interface GoalProgress extends Goal {
  achieved_amount: string
  forecast_weighted_amount: string
  gap_amount: string
  attainment_pct: number
}

export interface GoalForecast {
  period: string
  goals: GoalProgress[]
}

export interface CreateGoalInput {
  period: string
  target_amount: string
  currency?: string
  owner_id?: string | null
}

export interface UpdateGoalInput {
  target_amount?: string
  currency?: string
}
