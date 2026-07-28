// Tipos do Atendimento (Chatwoot). Espelham os serializers de
// `contexts/chatwoot/interface/api/serializers.py` — o backend já normalizou o
// JSON cru do Chatwoot, então aqui não tem timestamp Unix nem `meta.sender`.

export type ConversationStatus = "open" | "resolved" | "pending" | "snoozed"
export type ConversationPriority = "urgent" | "high" | "medium" | "low"
/** Pastas da barra lateral — o Chatwoot chama de `assignee_type`. */
export type AssigneeFilter = "me" | "unassigned" | "all" | "assigned"
export type MessageDirection = "incoming" | "outgoing" | "activity" | "template"

export interface ChatwootConnection {
  id: string | null
  base_url: string
  account_id: number
  status: "connected" | "error" | "disconnected"
  last_error: string
  last_verified_at: string | null
  agent_name: string
  agent_email: string
  has_token: boolean
  /** URL pronta para colar em Chatwoot → Configurações → Webhooks. */
  webhook_url: string
}

export interface ConnectionState {
  connected: boolean
  connection: ChatwootConnection | null
}

export interface ConnectInput {
  workspace_id: string
  base_url: string
  account_id: number
  /** Vazio na edição = mantém o token já salvo. */
  access_token?: string
}

export interface MessageSender {
  id: number | null
  name: string
  kind: string
  avatar_url: string
  email: string
}

export interface Attachment {
  id: number
  file_type: string
  data_url: string
  thumb_url: string
  file_size: number
}

export interface Message {
  id: number
  conversation_id: number
  content: string
  message_type: number
  direction: MessageDirection
  content_type: string
  content_attributes: Record<string, unknown>
  /** Nota interna: aparece na thread mas o cliente nunca recebe. */
  private: boolean
  status: string
  created_at: string | null
  sender: MessageSender | null
  attachments: Attachment[]
}

export interface Participant {
  id: number | null
  name: string
  avatar_url: string
  email: string
}

export interface ContactSummary {
  id: number
  name: string
  email: string
  phone_number: string
  identifier: string
  avatar_url: string
  additional_attributes: Record<string, unknown>
  custom_attributes: Record<string, unknown>
}

/** Vínculo com o funil — preenchido pelo nosso banco, não pelo Chatwoot. */
export interface ConversationLink {
  deal_id?: string | null
  deal_title?: string
  customer_id?: string | null
  customer_name?: string
}

export interface Conversation {
  id: number
  uuid: string
  inbox_id: number
  status: ConversationStatus
  priority: ConversationPriority | null
  labels: string[]
  custom_attributes: Record<string, unknown>
  additional_attributes: Record<string, unknown>
  unread_count: number
  can_reply: boolean
  muted: boolean
  snoozed_until: string | null
  created_at: string | null
  last_activity_at: string | null
  waiting_since: string | null
  channel: string
  contact: ContactSummary | null
  assignee: Participant | null
  team: Participant | null
  last_message: Message | null
  messages: Message[]
  link: ConversationLink
}

export interface ConversationPage {
  payload: Conversation[]
  mine_count: number
  unassigned_count: number
  assigned_count: number
  all_count: number
}

export interface InboxCounts {
  mine_count: number
  unassigned_count: number
  assigned_count: number
  all_count: number
}

export interface Inbox {
  id: number
  name: string
  channel_type: string
  /** Rótulo em português já resolvido no backend ("WhatsApp", "Chat do site"…). */
  channel_label: string
  medium: string
  provider: string
  avatar_url: string
  website_url: string
  phone_number: string
  enable_auto_assignment: boolean
  working_hours_enabled: boolean
  timezone: string
  csat_survey_enabled: boolean
}

export interface Agent {
  id: number
  name: string
  email: string
  role: string
  avatar_url: string
  availability_status: "online" | "offline" | "busy" | string
}

export interface Team {
  id: number
  name: string
  description: string
  allow_auto_assign: boolean
}

export interface Label {
  id: number
  title: string
  description: string
  color: string
  show_on_sidebar: boolean
}

export interface CannedResponse {
  id: number
  short_code: string
  content: string
}

export interface Catalog {
  inboxes: Inbox[]
  agents: Agent[]
  teams: Team[]
  labels: Label[]
  canned_responses: CannedResponse[]
}

export interface ChatContact {
  id: number
  name: string
  email: string
  phone_number: string
  identifier: string
  avatar_url: string
  blocked: boolean
  availability_status: string
  additional_attributes: Record<string, unknown>
  custom_attributes: Record<string, unknown>
  city: string
  country: string
  company_name: string
  last_activity_at: string | null
  created_at: string | null
}

/** Filtros da caixa de entrada — o que a barra lateral e a busca controlam. */
export interface ConversationFilters {
  status?: ConversationStatus
  assignee_type?: AssigneeFilter
  inbox_id?: number
  team_id?: number
  labels?: string[]
  q?: string
  page?: number
}

export interface SendMessageInput {
  content: string
  private?: boolean
  content_type?: string
  content_attributes?: Record<string, unknown>
}

export interface WebhookEvent {
  id: string
  event: string
  conversation_id: number | null
  contact_id: number | null
  created_at: string
}

export interface EventStream {
  events: WebhookEvent[]
  cursor: string | null
}
