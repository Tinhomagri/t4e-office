import type { AvatarConfig } from "@/features/avatar/avatar.types"

export type SessionStatus = "waiting" | "voting" | "revealed" | "done"

// "?" = não sei estimar; "☕" = preciso de uma pausa. Ambos são votos válidos
// e nenhum dos dois é número — as estatísticas os contam na distribuição mas
// os deixam fora da média, e qualquer um deles derruba o consenso.
export const FIBONACCI = ["1", "2", "3", "5", "8", "13", "21", "?", "☕"]

/** Time que estima junto. A sessão é da squad; os cards podem ser de vários
 *  projetos. */
export interface Squad {
  id: string
  workspace_id: string
  name: string
  color: string
  members: { user_id: string; name: string; initials: string }[]
}

export interface PokerSession {
  id: string
  workspace_id: string
  /** Nulo nas sessões da squad — elas não pertencem a um projeto. */
  project_id: string | null
  squad_id: string | null
  created_by: string
  name: string
  status: SessionStatus
  current_card_id: string | null
  presented_card_id?: string | null
  card_ids: string[]
  created_at: string
  participants: PokerParticipant[]
  votes: PokerVote[]
  // Só no detalhe da sala (GET /poker/<id>/); a listagem não carrega.
  reactions?: PokerReaction[]
  presented_card?: PokerPresentedCard | null
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
  // Sprite pixel-art da pessoa (o mesmo avatar do Escritório). `null` para
  // quem nunca criou um — nesse caso a mesa mostra as iniciais.
  avatar_config?: AvatarConfig | null
}

export interface PokerPresentedCard {
  id: string
  ref: string
  title: string
  description: string
  status: string
  priority: string
  type: string
  assignee_name: string
  parent_id: string | null
  parent_ref: string | null
  parent_title: string | null
}

// Catálogo fechado, espelhando `PokerReactionModel.EMOJIS` no backend.
export const REACTION_EMOJIS = ["👏", "🔥", "😂", "🤔", "🎯", "❤️"] as const

// Espelha `PokerReactionModel.EMOTES`. O `anim` é o nome do clipe no chibi.ts.
export const POKER_EMOTES = [
  { anim: "wave", label: "Acenar", icon: "👋" },
  { anim: "dance", label: "Dançar", icon: "🕺" },
  { anim: "jamal", label: "Passinho", icon: "🔥" },
  { anim: "dab", label: "Dab", icon: "😎" },
  { anim: "floss", label: "Floss", icon: "🤸" },
  { anim: "celebrate", label: "Comemorar", icon: "🎉" },
  { anim: "sleep", label: "Dormir", icon: "😴" },
  { anim: "coffee", label: "Café", icon: "☕" },
] as const

// Evento efêmero da sala. Vive só o tempo de atravessar a mesa: o backend
// devolve os dos últimos segundos e o cliente já os viu uma vez.
// Duas formas: reação com alvo (`emoji` + `to_user_id`) ou emote sobre si
// mesmo (`emote`, sem alvo).
export interface PokerReaction {
  id: string
  from_user_id: string
  to_user_id: string | null
  emoji: string
  emote: string
  created_at: string
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
  parent_id: string | null
  parent_ref: string | null
  parent_title: string | null
}
