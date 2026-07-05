export type SessionStatus = "waiting" | "voting" | "revealed" | "done"

export const FIBONACCI = ["1", "2", "3", "5", "8", "13", "21", "?"]

export interface PokerSession {
  id: string
  workspace_id: string
  project_id: string
  created_by: string
  name: string
  status: SessionStatus
  current_card_id: string | null
  card_ids: string[]
  created_at: string
  participants: PokerParticipant[]
  votes: PokerVote[]
  // Presentes apenas na listagem (GET /workspaces/<id>/poker/) — contadores
  // agregados para o resumo/histórico, sem custo de N+1 no card individual.
  rounds_count?: number
  participants_count?: number
  avg_points?: number | null
}

// Resultado já decidido de uma rodada — o que foi votado em um card
// específico, preservado mesmo depois de a rodada avançar para o próximo card.
export interface PokerRoundVote {
  participant_name: string
  value: string | null
}

export interface PokerRound {
  id: string
  session_id: string
  card_id: string
  card_ref: string
  card_title: string
  final_points: number
  votes: PokerRoundVote[]
  decided_by_name: string
  decided_at: string
}

// Resumo agregado do workspace inteiro (aba "Resumo" do Planning Poker,
// estilo Jira) — visão geral de tudo que já foi votado, não só uma sessão.
export interface PokerWorkspaceSummary {
  sessions_total: number
  sessions_active: number
  sessions_today: number
  rounds_total: number
  rounds_today: number
  avg_points: number | null
  points_distribution: { points: number; count: number }[]
  top_estimators: { name: string; votes: number }[]
  recent_rounds: (PokerRound & { session_name: string })[]
}

export interface PokerParticipant {
  id: string
  user_id: string
  user_name: string
  avatar_initials: string
  is_host: boolean
}

export interface PokerVote {
  participant_id: string
  participant_name: string
  value: string | null
  has_voted: boolean
}

export interface PokerCard {
  id: string
  title: string
  ref: string
  status: string
  points: number | null
}
