// Tipos do domínio de workspace/projetos/cards — espelham os serializers do backend.

export type CardStatus =
  | "backlog" | "todo" | "doing" | "review" | "done"
  // fluxo marketing
  | "briefing" | "criacao" | "aprovacao" | "agendado" | "publicado"
export type CardType =
  | "feature" | "bug" | "debt" | "spike" | "chore" | "epic"
  // tipos marketing
  | "post" | "peca" | "campanha" | "artigo" | "email"
// Templates de criação de projeto
export type ProjectTemplate = "software" | "campanha" | "social" | "conteudo"
// Canais de publicação de marketing (calendário editorial)
export type MarketingChannel =
  | "instagram" | "facebook" | "linkedin" | "tiktok"
  | "youtube" | "blog" | "email" | "site"
export type CardPriority = "low" | "medium" | "high" | "urgent"
export type Role = "owner" | "admin" | "member"
export type InvitationStatus = "pending" | "accepted" | "revoked"
export type SprintStatus = "planned" | "active" | "closed"
// Status de presença do usuário (pilar Presença — backend na Fase 5).
export type PresenceStatus = "available" | "focus" | "meeting" | "away"

export interface Workspace {
  id: string
  name: string
  slug: string
}

// Quem enxerga o board: restrito (só quem tem papel ou é da squad dona) ou
// aberto a todo o workspace.
export type ProjectVisibility = "restricted" | "workspace"

export interface Project {
  id: string
  name: string
  key: string
  workspace_id: string
  template?: ProjectTemplate
  squad_id: string | null
  visibility: ProjectVisibility
  avatar_emoji: string
  avatar_color: string
  avatar_url: string | null
  deadline: string | null
  created_at: string
}

// /projects/<id>/ — projeto com os campos da aba "Geral" da configuração do quadro.
// A lista (/projects/) devolve só o `Project` enxuto acima.
export interface ProjectDetail extends Project {
  description: string
  category: string
  avatar_emoji: string
  avatar_color: string
  avatar_url: string | null
  lead_id: string | null
  default_assignee_id: string | null
  // Link público de acompanhamento (sem login). Nulo = desativado.
  public_token: string | null
  public_allow_create: boolean
  // Código de acesso ao board público — a primeira vez que alguém abre o
  // link pede este código; depois o navegador lembra. Nulo = link sozinho
  // já libera (sem portão).
  public_access_code: string | null
  // Membros do workspace que NÃO recebem notificação/bipe quando o cliente
  // escreve no mural deste board. Vazio = todo mundo recebe (default).
  mural_notification_excluded_user_ids: string[]
}

export interface UpdateProjectInput {
  name?: string
  key?: string
  description?: string
  category?: string
  avatar_emoji?: string
  avatar_color?: string
  lead_id?: string | null
  default_assignee_id?: string | null
  squad_id?: string | null
  visibility?: ProjectVisibility
  public_allow_create?: boolean
  // Só o servidor decide o valor do token — isto só pede a ação.
  public_token_action?: "generate" | "revoke"
  public_access_code_action?: "generate" | "revoke"
  deadline?: string | null
  mural_notification_excluded_user_ids?: string[]
}

export interface BoardMessageReplyTo {
  id: string
  author_name: string
  body: string
}

export interface BoardMessage {
  id: string
  author_name: string
  body: string
  from_team: boolean
  created_at: string
  reply_to: BoardMessageReplyTo | null
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
  reporter_id: string | null
  sprint_id: string | null
  start_date: string | null
  due_date: string | null
  order: number
  rank: string
  parent_id: string | null
  epic_id: string | null
  epic_color: string
  labels: string[]
  // Marketing: canal de publicação e data (calendário editorial)
  channel?: string
  publish_date?: string | null
  // Contadores para densidade do card (anotados pelo backend).
  comments_count?: number
  attachments_count?: number
  subtasks_count?: number
  subtasks_done?: number
  // Desfecho: "está na coluna Concluído" ≠ "foi entregue". Só `done` conta como
  // entrega em velocity/lead time.
  resolution?: CardResolution | null
  // Instante real da resolução — base do lead time e da tendência de conclusão.
  // `updated_at` não serve: muda a cada edição posterior.
  resolved_at?: string | null
  original_estimate_seconds?: number | null
  remaining_estimate_seconds?: number | null
  // Sinalizador de atenção (igual "Flag" do Jira) — aura laranja + "!" no card.
  flagged?: boolean
  archived?: boolean
  archived_at?: string | null
  created_at: string | null
  updated_at: string | null
}

/** Espelha `CardResolution` no domínio do backend. */
export type CardResolution =
  | "done"
  | "wont_do"
  | "duplicate"
  | "cannot_reproduce"
  | "incomplete"

export interface Comment {
  id: string
  card_id: string
  author_id: string
  author_name: string
  body: string
  created_at: string
}

export interface CardHistoryEntry {
  id: string
  card_id: string
  author_id: string | null
  author_name: string
  field: string
  old_value: string
  new_value: string
  created_at: string
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  goal: string
  start_date: string | null
  end_date: string | null
  status: SprintStatus
  started_at?: string | null
  completed_at?: string | null
}

export type LinkType = "relates" | "blocks" | "duplicates"
export type LinkDirection = "outgoing" | "incoming"

export interface LinkedCard {
  id: string
  ref: string
  title: string
  status: CardStatus
  type: CardType
}

export interface IssueLink {
  id: string
  link_type: LinkType
  direction: LinkDirection
  other_card: LinkedCard | null
}

export interface CreateIssueLinkInput {
  target_id: string
  link_type: LinkType
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
  template?: ProjectTemplate
  squad_id?: string | null
  member_ids?: string[]
  visibility?: ProjectVisibility
}

export interface CreateCardInput {
  title: string
  description?: string
  status?: CardStatus
  type?: CardType
  priority?: CardPriority
  points?: number | null
  assignee_id?: string | null
  reporter_id?: string | null
  sprint_id?: string | null
  start_date?: string | null
  due_date?: string | null
  parent_id?: string | null
  epic_id?: string | null
  epic_color?: string
  labels?: string[]
  channel?: string
  publish_date?: string | null
  flagged?: boolean
}

export type UpdateCardInput = Partial<CreateCardInput> & { order?: number }

export interface Version {
  id: string
  project_id: string
  name: string
  description: string
  release_date: string | null
  released: boolean
  created_at: string
}

export interface Component {
  id: string
  project_id: string
  name: string
  lead_id: string | null
}

export type WorkflowCategory = "todo" | "in_progress" | "done"

export interface WorkflowStatus {
  id: string
  project_id: string
  name: string
  slug: string
  category: WorkflowCategory
  color: string
  order: number
  is_default: boolean
  // null = coluna sem limite de WIP.
  wip_limit: number | null
  /** Card nesta coluna significa "estou trabalhando nisso agora": senta o
   *  boneco na mesa da pessoa no Escritório e conta o tempo desde a entrada. */
  is_working: boolean
  /** Card nesta coluna significa "foi entregue" — usado pelo atalho de
   *  concluir card em vez de assumir o slug "done". */
  is_done: boolean
}

export interface CreateWorkflowStatusInput {
  name: string
  slug?: string
  category?: WorkflowCategory
  color?: string
}

export interface UpdateWorkflowStatusInput {
  name?: string
  category?: WorkflowCategory
  color?: string
  order?: number
  wip_limit?: number | null
  is_working?: boolean
  is_done?: boolean
}

// ---- Configuração do quadro (swimlanes, layout do card, cores) ----

export type SwimlaneMode = "none" | "epic" | "assignee" | "priority" | "subtask"

export type CardColorRule = "none" | "priority" | "issue_type" | "assignee" | "epic"

// Chaves aceitas em `card_fields`. Espelha BoardConfigModel.AVAILABLE_CARD_FIELDS
// no backend; `summary` não entra porque é sempre visível.
export type CardFieldKey =
  | "key"
  | "issue_type"
  | "priority"
  | "assignee"
  | "labels"
  | "epic"
  | "due_date"
  | "start_date"
  | "story_points"
  | "status"
  | "reporter"
  | "subtask_progress"
  | "created_at"
  | "updated_at"
  | "cover_image"

export interface BoardConfig {
  project_id: string
  swimlane_mode: SwimlaneMode
  card_fields: CardFieldKey[]
  card_color_rule: CardColorRule
  card_color_map: Record<string, string>
  // 0 = nunca esconder cards concluídos.
  hide_done_after_days: number
  sprints_enabled: boolean
  estimation_enabled: boolean
  // Devolvido pelo servidor para o front montar a lista de toggles.
  available_card_fields: CardFieldKey[]
}

export type UpdateBoardConfigInput = Partial<
  Omit<BoardConfig, "project_id" | "available_card_fields">
>

export interface SavedFilter {
  id: string
  project_id: string
  owner_id: string
  name: string
  jql: string
  shared: boolean
}

export interface CreateSavedFilterInput {
  name: string
  jql: string
  shared?: boolean
}

// Documento colaborativo do projeto (aba Documentos) — persistido no
// servidor e visível para todo o time (não é mais um protótipo local).
export interface DocumentSummary {
  id: string
  project_id: string
  title: string
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface DocumentDetail extends DocumentSummary {
  content: string
}

export interface CreateDocumentInput {
  title?: string
  content?: string
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
}

// Entrada do feed de atividade recente do projeto (aba Resumo, estilo Jira).
export interface ActivityEntry {
  id: string
  card_ref: string
  card_title: string
  field: string
  old_value: string
  new_value: string
  author_id: string | null
  author_name: string
  created_at: string
}

export type CustomFieldType = "text" | "number" | "date" | "select" | "multiselect" | "checkbox" | "user"

export interface CustomField {
  id: string
  project_id: string
  name: string
  field_type: CustomFieldType
  options: string[]
  required: boolean
}

export interface FieldValue {
  id: string
  card_id: string
  field_id: string
  field_name: string
  field_type: CustomFieldType
  value_json: unknown
}

export interface CreateCustomFieldInput {
  name: string
  field_type: CustomFieldType
  options?: string[]
  required?: boolean
}

export interface Attachment {
  id: string
  card_id: string
  author_id: string
  filename: string
  url: string | null
  mime_type: string
  size: number
  // Versionamento de peça (fluxo de aprovação de marketing)
  group_id: string
  version: number
  approval_status: "" | "approved" | "rejected"
  created_at: string
}

// Resultado da decisão de aprovação de um card de marketing
export interface ApprovalResult {
  card_id: string
  decision: "approved" | "rejected"
  old_status: string
  new_status: string
  comment: string
}

// ---- Marketing Hub: relatório, fila de publicação e biblioteca ----
export interface MarketingQueueCard {
  id: string
  ref: string
  title: string
  status: string
  type: string
  channel: string
  publish_date: string | null
  assignee_id: string | null
}

export interface CardMetrics {
  reach: number
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
  conversions: number
  engagement?: number
  updated_at: string | null
}

export interface MarketingPerformance {
  has_data: boolean
  pieces_measured: number
  totals: Omit<CardMetrics, "engagement" | "updated_at">
  engagement_rate: number | null
  by_channel: Record<
    string,
    { reach: number; engagement: number; clicks: number; conversions: number }
  >
  best_channel: string | null
  best_piece: { id: string; ref: string; title: string; channel: string; reach: number } | null
}

export interface MarketingReport {
  totals: { cards: number; planned: number; published: number; overdue: number }
  by_status: Record<string, number>
  by_channel: Record<string, number>
  approval: { approved: number; rejected: number; rate: number | null }
  queue: {
    overdue: MarketingQueueCard[]
    today: MarketingQueueCard[]
    week: MarketingQueueCard[]
  }
  done_statuses: string[]
  performance: MarketingPerformance
}

// Peça aprovada da biblioteca (anexo + card de origem)
export interface MarketingAsset extends Attachment {
  card: MarketingQueueCard
}

export interface Worklog {
  id: string
  card_id: string
  author_id: string
  author_name: string
  time_seconds: number
  started_at: string
  comment: string
  created_at: string
}

export interface CreateWorklogInput {
  time_seconds: number
  started_at?: string
  comment?: string
}

export interface CreateVersionInput {
  name: string
  description?: string
  release_date?: string | null
  released?: boolean
}

export interface CreateComponentInput {
  name: string
  lead_id?: string | null
}

export interface CreateSprintInput {
  name: string
  goal?: string
  start_date?: string | null
  end_date?: string | null
}

export type UpdateSprintInput = Partial<CreateSprintInput> & { status?: SprintStatus }

// ── Automations ──────────────────────────────────────────────────────────────

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | "card_assigned"
  | "card_commented"
  | "card_status_changed"
  | "automation_ran"
  | "sprint_started"
  | "board_message"

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  link: string
  read: boolean
  created_at: string
}

export type AutomationTriggerType = "cron" | "status_changed" | "card_created"
export type AutomationActionType =
  | "change_status"
  | "assign_user"
  | "add_label"
  | "remove_label"
  | "set_priority"
export type AutomationSchedule =
  | "hourly"
  | "daily_morning"
  | "daily_evening"
  | "weekly_monday"

export interface AutomationCondition {
  field: string
  op: "=" | "!=" | "~"
  value: string
}

export interface AutomationRule {
  id: string
  project_id: string
  name: string
  enabled: boolean
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, string>
  conditions: AutomationCondition[]
  action_type: AutomationActionType
  action_config: Record<string, string>
  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  created_at: string
}

export interface AutomationRunLog {
  id: string
  rule_id: string
  triggered_by: string
  cards_affected: number
  error: string
  ran_at: string
}

export interface CreateAutomationRuleInput {
  name: string
  enabled?: boolean
  trigger_type: AutomationTriggerType
  trigger_config?: Record<string, string>
  conditions?: AutomationCondition[]
  action_type: AutomationActionType
  action_config: Record<string, string>
}

// ---- Permissões de projeto (Domínio 12) ----
export type Capability =
  | "browse"
  | "create_issue"
  | "edit_issue"
  | "delete_issue"
  | "transition_issue"
  | "assign_issue"
  | "comment"
  | "manage_sprints"
  | "manage_versions"
  | "manage_components"
  | "manage_custom_fields"
  | "manage_workflow"
  | "manage_automation"
  | "administer_project"

export interface ProjectPermissions {
  project_id: string
  role: string
  capabilities: Capability[]
}

// Papel de projeto (RBAC nível projeto — distinto do papel de workspace).
export type ProjectRoleSlug = "admin" | "developer" | "viewer"

// Item de /projects/<id>/access/ — membro do workspace visto pelo prisma do projeto.
export interface ProjectAccessMember {
  user_id: string
  name: string
  email: string
  workspace_role: Role
  project_role: ProjectRoleSlug | null // efetivo (explícito ou derivado)
  explicit_role: ProjectRoleSlug | null // null = derivado do papel de workspace
  can_delete_cards: boolean // grant individual, não vem do papel
}

// /projects/<id>/permission-scheme/ — matriz papel×capacidade.
export interface PermissionSchemeRole {
  slug: ProjectRoleSlug
  name: string
  capabilities: Capability[]
}

export interface PermissionScheme {
  project_id: string
  roles: PermissionSchemeRole[]
  all_capabilities: Capability[]
}

// /auth/workspaces/<id>/audit-log/ — trilha de mudanças de papel/remoções.
export type AuditAction = "role_changed" | "member_removed"

export interface AuditLogEntry {
  id: string
  actor_id: string
  target_user_id: string
  action: AuditAction
  old_role: string
  new_role: string
  created_at: string
}
