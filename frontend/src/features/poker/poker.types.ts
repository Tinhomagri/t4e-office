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
