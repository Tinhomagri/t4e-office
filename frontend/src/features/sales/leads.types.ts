// Tipos de Leads. Espelham `contexts/sales/interface/api/lead_serializers.py`.

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualifying"
  | "qualified"
  | "disqualified"
  | "converted"

export interface Lead {
  id: string
  workspace_id: string
  name: string
  company: string
  email: string
  phone: string
  source: string
  score: number
  status: LeadStatus
  disqualify_reason: string
  owner_id: string | null
  notes: string
  first_contact_due_at: string | null
  contacted_at: string | null
  converted_at: string | null
  converted_deal_id: string | null
  converted_customer_id: string | null
  /** Derivados do domínio — a tela não recalcula prazo/estado. */
  is_open: boolean
  is_overdue: boolean
  created_at: string | null
  updated_at: string | null
}

export interface CreateLeadInput {
  name: string
  company?: string
  email?: string
  phone?: string
  source?: string
  owner_id?: string | null
  notes?: string
}

export type UpdateLeadInput = Partial<CreateLeadInput>

export interface ImportLeadsResult {
  imported: Lead[]
  errors: { row: number; reason: string }[]
}

export interface ConvertLeadInput {
  deal_title?: string
  amount?: string
}

export interface ConvertLeadResult {
  lead: Lead
  customer_id: string
  deal_id: string
}
