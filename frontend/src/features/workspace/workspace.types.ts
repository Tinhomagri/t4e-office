// Tipos do domínio de workspace/projetos/cards — espelham os serializers do backend.

export type CardStatus = "backlog" | "todo" | "doing" | "review" | "done"
export type CardType = "feature" | "bug" | "debt" | "spike" | "chore" | "epic"
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
  reporter_id: string | null
  sprint_id: string | null
  start_date: string | null
  due_date: string | null
  order: number
  parent_id: string | null
  labels: string[]
  // Contadores para densidade do card (anotados pelo backend).
  comments_count?: number
  attachments_count?: number
  subtasks_count?: number
  subtasks_done?: number
}

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
  labels?: string[]
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
  created_at: string
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
