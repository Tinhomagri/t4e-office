// Tipos do domínio de workspace/projetos/cards — espelham os serializers do backend.

export type CardStatus = "backlog" | "todo" | "doing" | "review" | "done"
export type CardType = "feature" | "bug" | "debt" | "spike" | "chore"
export type CardPriority = "low" | "medium" | "high" | "urgent"
export type Role = "owner" | "admin" | "member"
export type InvitationStatus = "pending" | "accepted" | "revoked"
export type SprintStatus = "planned" | "active" | "closed"

export interface Workspace {
  id: string
  name: string
  slug: string
}

export interface Project {
  id: string
  name: string
  key: string
  workspace_id: string
}

export interface Card {
  id: string
  ref: string // ex.: MIA-142
  project_id: string
  number: number
  title: string
  description: string
  status: CardStatus
  type: CardType
  priority: CardPriority
  points: number | null
  assignee_id: string | null
  sprint_id: string | null
  order: number
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  goal: string
  start_date: string | null
  end_date: string | null
  status: SprintStatus
}

export interface Member {
  user_id: string
  name: string
  email: string
  role: Role
}

export interface Invitation {
  id: string
  email: string
  role: Role
  status: InvitationStatus
}

export interface CreateProjectInput {
  workspace_id: string
  name: string
  key: string
}

export interface CreateCardInput {
  title: string
  description?: string
  status?: CardStatus
  type?: CardType
  priority?: CardPriority
  points?: number | null
  assignee_id?: string | null
  sprint_id?: string | null
}

export type UpdateCardInput = Partial<CreateCardInput> & { order?: number }

export interface CreateSprintInput {
  name: string
  goal?: string
  start_date?: string | null
  end_date?: string | null
}

export type UpdateSprintInput = Partial<CreateSprintInput> & { status?: SprintStatus }
