// Tipos do contexto Comercial (sales). Espelham o modelo de dados do spec
// "Fundação Comercial — Clientes + Pipeline". Valores monetários chegam do DRF
// como string (Decimal), por isso `amount` é string e a conversão para número
// acontece nos helpers de sales.shared.ts.

export type CustomerKind = "company" | "person"
export type StageKind = "open" | "won" | "lost"
export type ActivityKind = "note" | "task" | "meeting"

export interface Customer {
  id: string
  workspace_id: string
  kind: CustomerKind
  name: string
  legal_name: string
  document: string
  email: string
  phone: string
  website: string
  notes: string
  owner_id: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  customer_id: string
  name: string
  role: string
  email: string
  phone: string
  is_primary: boolean
}

export interface PipelineStage {
  id: string
  workspace_id: string
  name: string
  slug: string
  color: string
  order: number
  probability_default: number
  kind: StageKind
}

export interface Deal {
  id: string
  workspace_id: string
  title: string
  customer_id: string
  customer_name: string
  contact_id: string | null
  stage_id: string
  amount: string
  currency: string
  probability: number
  expected_close_date: string | null
  source: string
  owner_id: string | null
  lost_reason: string
  lost_notes: string
  won_at: string | null
  lost_at: string | null
  delivery_project_id: string | null
  rank: string
  created_at: string
  updated_at: string
}

export interface DealActivity {
  id: string
  deal_id: string
  deal_title?: string
  kind: ActivityKind
  content: string
  author_id: string | null
  author_name: string
  due_date: string | null
  assignee_id: string | null
  done_at: string | null
  google_event_id: string | null
  created_at: string
}

// Filtros do feed de atividades do workspace. `pending` = ainda sem done_at.
export interface WorkspaceActivityFilters {
  kind?: ActivityKind
  assigneeId?: string
  pending?: boolean
}

export interface DealHistoryEntry {
  id: string
  deal_id: string
  author_name: string
  field: string
  from_value: string
  to_value: string
  at: string
}

// ─── Entradas de escrita ─────────────────────────────────────────────────────

export interface CreateCustomerInput {
  kind: CustomerKind
  name: string
  legal_name?: string
  document?: string
  email?: string
  phone?: string
  website?: string
  notes?: string
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>

export interface CreateContactInput {
  name: string
  role?: string
  email?: string
  phone?: string
  is_primary?: boolean
}

export type UpdateContactInput = Partial<CreateContactInput>

export interface CreateDealInput {
  title: string
  customer_id: string
  stage_id?: string
  amount?: string
  currency?: string
  probability?: number
  expected_close_date?: string | null
  source?: string
  contact_id?: string | null
}

export type UpdateDealInput = Partial<
  Omit<CreateDealInput, "customer_id"> & { customer_id: string; owner_id: string | null }
>

export interface WinDealInput {
  create_delivery_project: boolean
}

export interface LoseDealInput {
  lost_reason: string
  lost_notes?: string
}

export interface CreateActivityInput {
  kind: ActivityKind
  content: string
  due_date?: string | null
  assignee_id?: string | null
}

// Resposta de win/lose: o deal atualizado + aviso opcional (ex.: Google não
// conectado ao agendar reunião, projeto de entrega não criado, etc.).
export interface DealActionResult {
  deal: Deal
  warning?: string
}

// Criar atividade usa o mesmo envelope: a reunião pode ser registrada sem o
// evento no Google (usuário sem conta conectada) — aí vem `warning` junto.
export interface ActivityActionResult {
  activity: DealActivity
  warning?: string
}
