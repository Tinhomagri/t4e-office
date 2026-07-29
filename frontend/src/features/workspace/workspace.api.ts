import { api } from "@/shared/api/client"

import type {
  ActivityEntry,
  ApprovalResult,
  Attachment,
  AutomationRule,
  AutomationRunLog,
  BoardConfig,
  ProjectDetail,
  UpdateBoardConfigInput,
  UpdateProjectInput,
  Card,
  Notification,
  CreateAutomationRuleInput,
  CreateCustomFieldInput,
  CreateDocumentInput,
  CreateSavedFilterInput,
  CreateWorkflowStatusInput,
  CustomField,
  DocumentDetail,
  DocumentSummary,
  FieldValue,
  SavedFilter,
  UpdateDocumentInput,
  UpdateWorkflowStatusInput,
  WorkflowStatus,
  CardHistoryEntry,
  Comment,
  Component,
  CreateCardInput,
  CreateComponentInput,
  CreateIssueLinkInput,
  CreateProjectInput,
  CreateSprintInput,
  CreateVersionInput,
  CreateWorklogInput,
  AuditLogEntry,
  Invitation,
  IssueLink,
  CardMetrics,
  MarketingAsset,
  MarketingReport,
  Member,
  PermissionScheme,
  Project,
  ProjectAccessMember,
  ProjectPermissions,
  ProjectRoleSlug,
  Role,
  Sprint,
  UpdateCardInput,
  UpdateSprintInput,
  Version,
  Workspace,
  Worklog,
} from "./workspace.types"

// ---- Workspaces ----
export async function listWorkspaces(): Promise<Workspace[]> {
  const { data } = await api.get<Workspace[]>("/auth/workspaces/")
  return data
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const { data } = await api.post<Workspace>("/auth/workspaces/", { name })
  return data
}

// ---- Membros e convites ----
export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { data } = await api.get<Member[]>(`/auth/workspaces/${workspaceId}/members/`)
  return data
}

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data } = await api.get<Invitation[]>(
    `/auth/workspaces/${workspaceId}/invitations/`,
  )
  return data
}

export async function createInvitation(
  workspaceId: string,
  payload: { email: string; role: Role },
): Promise<Invitation> {
  const { data } = await api.post<Invitation>(
    `/auth/workspaces/${workspaceId}/invitations/`,
    payload,
  )
  return data
}

export async function acceptInvitation(token: string): Promise<{ workspace_id: string }> {
  const { data } = await api.post("/auth/invitations/accept/", { token })
  return data
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await api.post(`/auth/invitations/${invitationId}/revoke/`)
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await api.patch(`/auth/workspaces/${workspaceId}/members/${userId}/`, { role })
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await api.delete(`/auth/workspaces/${workspaceId}/members/${userId}/`)
}

export async function listAuditLog(workspaceId: string): Promise<AuditLogEntry[]> {
  const { data } = await api.get<AuditLogEntry[]>(
    `/auth/workspaces/${workspaceId}/audit-log/`,
  )
  return data
}

// ---- Acesso e esquema de permissões por projeto (RBAC Domínio 12) ----
export async function getProjectAccess(
  projectId: string,
): Promise<ProjectAccessMember[]> {
  const { data } = await api.get<ProjectAccessMember[]>(
    `/projects/${projectId}/access/`,
  )
  return data
}

export async function assignProjectRole(
  projectId: string,
  userId: string,
  role: ProjectRoleSlug,
): Promise<void> {
  await api.put(`/projects/${projectId}/access/`, { user_id: userId, role })
}

export async function resetProjectRole(
  projectId: string,
  userId: string,
): Promise<void> {
  await api.delete(`/projects/${projectId}/access/`, { params: { user_id: userId } })
}

export async function getPermissionScheme(
  projectId: string,
): Promise<PermissionScheme> {
  const { data } = await api.get<PermissionScheme>(
    `/projects/${projectId}/permission-scheme/`,
  )
  return data
}

// ---- Projetos ----
export async function listProjects(workspaceId: string): Promise<Project[]> {
  const { data } = await api.get<Project[]>("/projects/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function createProject(payload: CreateProjectInput): Promise<Project> {
  const { data } = await api.post<Project>("/projects/", payload)
  return data
}

// ---- Cards ----
export async function listCards(projectId: string, jql?: string): Promise<Card[]> {
  const { data } = await api.get<Card[]>(`/projects/${projectId}/cards/`, {
    params: jql ? { jql } : undefined,
  })
  return data
}

export async function createCard(
  projectId: string,
  payload: CreateCardInput,
): Promise<Card> {
  const { data } = await api.post<Card>(`/projects/${projectId}/cards/`, payload)
  return data
}

export async function updateCard(
  cardId: string,
  payload: UpdateCardInput,
): Promise<Card> {
  const { data } = await api.patch<Card>(`/cards/${cardId}/`, payload)
  return data
}

// ---- Vínculos entre cards (issue links) ----
export async function listCardLinks(cardId: string): Promise<IssueLink[]> {
  const { data } = await api.get<IssueLink[]>(`/cards/${cardId}/links/`)
  return data
}

export async function createCardLink(
  cardId: string,
  payload: CreateIssueLinkInput,
): Promise<IssueLink> {
  const { data } = await api.post<IssueLink>(`/cards/${cardId}/links/`, payload)
  return data
}

export async function deleteCardLink(linkId: string): Promise<void> {
  await api.delete(`/links/${linkId}/`)
}

// ---- Comentários ----
export async function listComments(cardId: string): Promise<Comment[]> {
  const { data } = await api.get<Comment[]>(`/cards/${cardId}/comments/`)
  return data
}

export async function createComment(
  cardId: string,
  body: string,
  mentions: string[] = [],
): Promise<Comment> {
  const { data } = await api.post<Comment>(`/cards/${cardId}/comments/`, { body, mentions })
  return data
}

export async function listCardHistory(cardId: string): Promise<CardHistoryEntry[]> {
  const { data } = await api.get<CardHistoryEntry[]>(`/cards/${cardId}/history/`)
  return data
}

// ---- Sprints ----
export async function listSprints(projectId: string): Promise<Sprint[]> {
  const { data } = await api.get<Sprint[]>(`/projects/${projectId}/sprints/`)
  return data
}

export async function createSprint(
  projectId: string,
  payload: CreateSprintInput,
): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/projects/${projectId}/sprints/`, payload)
  return data
}

export async function updateSprint(
  sprintId: string,
  payload: UpdateSprintInput,
): Promise<Sprint> {
  const { data } = await api.patch<Sprint>(`/sprints/${sprintId}/`, payload)
  return data
}

export async function startSprint(
  sprintId: string,
  payload: { start_date?: string; end_date?: string; goal?: string } = {},
): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/sprints/${sprintId}/start/`, payload)
  return data
}

export interface SprintCompleteResult extends Sprint {
  summary: { completed_cards: number; moved_cards: number; moved_to: string }
}

export async function completeSprint(
  sprintId: string,
  moveTo: "backlog" | string = "backlog",
): Promise<SprintCompleteResult> {
  const { data } = await api.post<SprintCompleteResult>(`/sprints/${sprintId}/complete/`, {
    move_to: moveTo,
  })
  return data
}

// ---- Épicos ----
export interface Epic {
  id: string
  ref: string
  title: string
  status: string
  color: string
  start_date: string | null
  due_date: string | null
  children_total: number
  children_done: number
  points_total: number
  points_done: number
}

export async function listEpics(projectId: string): Promise<Epic[]> {
  const { data } = await api.get<Epic[]>(`/projects/${projectId}/epics/`)
  return data
}

// ---- Ranking (Lexorank) ----
export async function rankCard(
  cardId: string,
  payload: { before_id?: string | null; after_id?: string | null },
): Promise<{ id: string; rank: string }> {
  const { data } = await api.post(`/cards/${cardId}/rank/`, payload)
  return data
}

// ---- Hierarquia (filhos de épico/subtarefas) ----
export interface CardChild {
  id: string
  ref: string
  title: string
  status: string
  type: string
  priority: string
  points: number | null
  assignee_id: string | null
}

export async function listCardChildren(cardId: string): Promise<CardChild[]> {
  const { data } = await api.get<CardChild[]>(`/cards/${cardId}/children/`)
  return data
}

// ---- Versions ----
export async function listVersions(projectId: string): Promise<Version[]> {
  const { data } = await api.get<Version[]>(`/projects/${projectId}/versions/`)
  return data
}

export async function createVersion(projectId: string, payload: CreateVersionInput): Promise<Version> {
  const { data } = await api.post<Version>(`/projects/${projectId}/versions/`, payload)
  return data
}

export async function listCardVersions(cardId: string): Promise<Version[]> {
  const { data } = await api.get<Version[]>(`/cards/${cardId}/versions/`)
  return data
}

export async function addCardVersion(cardId: string, versionId: string): Promise<void> {
  await api.post(`/cards/${cardId}/versions/`, { version_id: versionId })
}

export async function removeCardVersion(cardId: string, versionId: string): Promise<void> {
  await api.delete(`/cards/${cardId}/versions/`, { data: { version_id: versionId } })
}

// ---- Components ----
export async function listComponents(projectId: string): Promise<Component[]> {
  const { data } = await api.get<Component[]>(`/projects/${projectId}/components/`)
  return data
}

export async function createComponent(projectId: string, payload: CreateComponentInput): Promise<Component> {
  const { data } = await api.post<Component>(`/projects/${projectId}/components/`, payload)
  return data
}

export async function listCardComponents(cardId: string): Promise<Component[]> {
  const { data } = await api.get<Component[]>(`/cards/${cardId}/components/`)
  return data
}

export async function addCardComponent(cardId: string, componentId: string): Promise<void> {
  await api.post(`/cards/${cardId}/components/`, { component_id: componentId })
}

export async function removeCardComponent(cardId: string, componentId: string): Promise<void> {
  await api.delete(`/cards/${cardId}/components/`, { data: { component_id: componentId } })
}

// ---- Workflow Statuses ----
export async function listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
  const { data } = await api.get<WorkflowStatus[]>(`/projects/${projectId}/workflow-statuses/`)
  return data
}

export async function createWorkflowStatus(projectId: string, payload: CreateWorkflowStatusInput): Promise<WorkflowStatus> {
  const { data } = await api.post<WorkflowStatus>(`/projects/${projectId}/workflow-statuses/`, payload)
  return data
}

export async function updateWorkflowStatus(statusId: string, payload: UpdateWorkflowStatusInput): Promise<WorkflowStatus> {
  const { data } = await api.patch<WorkflowStatus>(`/workflow-statuses/${statusId}/`, payload)
  return data
}

export async function deleteWorkflowStatus(statusId: string): Promise<void> {
  await api.delete(`/workflow-statuses/${statusId}/`)
}

// Aplica a ordem inteira de uma vez: um PATCH por coluna deixaria o board em
// estado inconsistente entre as respostas durante o drag.
export async function reorderWorkflowStatuses(
  projectId: string,
  statusIds: string[],
): Promise<WorkflowStatus[]> {
  const { data } = await api.post<WorkflowStatus[]>(
    `/projects/${projectId}/workflow-statuses/reorder/`,
    { status_ids: statusIds },
  )
  return data
}

// ---- Configuração do quadro / projeto ----
export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${projectId}/`)
  return data
}

export async function updateProject(
  projectId: string,
  payload: UpdateProjectInput,
): Promise<ProjectDetail> {
  const { data } = await api.patch<ProjectDetail>(`/projects/${projectId}/`, payload)
  return data
}

// Avatar por upload precisa de multipart; passar `null` remove a imagem e o
// projeto volta a exibir o par emoji+cor.
export async function updateProjectAvatar(
  projectId: string,
  file: File | null,
): Promise<ProjectDetail> {
  // `null` limpa o avatar; senão manda o data URI já reduzido.
  const avatar_image = file ? await shrinkToDataUri(file) : ""
  const { data } = await api.patch<ProjectDetail>(`/projects/${projectId}/`, { avatar_image })
  return data
}

// Reduz a imagem a um quadrado de AVATAR_SIZE e devolve data URI.
//
// O avatar é guardado como data URI numa coluna do banco (o deploy é serverless
// e não tem disco persistente), então a imagem precisa chegar pequena: a foto
// crua de um celular passaria de 3 MB e não caberia. WebP com corte central
// deixa o resultado na casa dos KB.
const AVATAR_SIZE = 128

async function shrinkToDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível processar a imagem.")

    // Corte central: recorta o maior lado para o avatar não sair achatado.
    const side = Math.min(bitmap.width, bitmap.height)
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )

    const webp = canvas.toDataURL("image/webp", 0.85)
    // Safari antigo ignora o tipo pedido e devolve PNG — o backend aceita ambos.
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png")
  } finally {
    bitmap.close()
  }
}

export async function getBoardConfig(projectId: string): Promise<BoardConfig> {
  const { data } = await api.get<BoardConfig>(`/projects/${projectId}/board-config/`)
  return data
}

export async function updateBoardConfig(
  projectId: string,
  payload: UpdateBoardConfigInput,
): Promise<BoardConfig> {
  const { data } = await api.patch<BoardConfig>(
    `/projects/${projectId}/board-config/`,
    payload,
  )
  return data
}

// ---- Saved Filters (quick filters do board) ----
export async function listSavedFilters(projectId: string): Promise<SavedFilter[]> {
  const { data } = await api.get<SavedFilter[]>(`/projects/${projectId}/saved-filters/`)
  return data
}

export async function createSavedFilter(projectId: string, payload: CreateSavedFilterInput): Promise<SavedFilter> {
  const { data } = await api.post<SavedFilter>(`/projects/${projectId}/saved-filters/`, payload)
  return data
}

// ---- Documents (aba Documentos — colaborativo, persistido no servidor) ----
export async function listDocuments(projectId: string): Promise<DocumentSummary[]> {
  const { data } = await api.get<DocumentSummary[]>(`/projects/${projectId}/documents/`)
  return data
}

export async function getDocument(documentId: string): Promise<DocumentDetail> {
  const { data } = await api.get<DocumentDetail>(`/documents/${documentId}/`)
  return data
}

export async function createDocument(projectId: string, payload: CreateDocumentInput): Promise<DocumentDetail> {
  const { data } = await api.post<DocumentDetail>(`/projects/${projectId}/documents/`, payload)
  return data
}

export async function updateDocument(documentId: string, payload: UpdateDocumentInput): Promise<DocumentDetail> {
  const { data } = await api.patch<DocumentDetail>(`/documents/${documentId}/`, payload)
  return data
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}/`)
}

export async function deleteSavedFilter(filterId: string): Promise<void> {
  await api.delete(`/saved-filters/${filterId}/`)
}

// ---- Activity feed (aba Resumo) ----
export async function listActivity(projectId: string): Promise<ActivityEntry[]> {
  const { data } = await api.get<ActivityEntry[]>(`/projects/${projectId}/activity/`)
  return data
}

// ---- Custom Fields ----
export async function listCustomFields(projectId: string): Promise<CustomField[]> {
  const { data } = await api.get<CustomField[]>(`/projects/${projectId}/custom-fields/`)
  return data
}

export async function createCustomField(projectId: string, payload: CreateCustomFieldInput): Promise<CustomField> {
  const { data } = await api.post<CustomField>(`/projects/${projectId}/custom-fields/`, payload)
  return data
}

export async function listFieldValues(cardId: string): Promise<FieldValue[]> {
  const { data } = await api.get<FieldValue[]>(`/cards/${cardId}/field-values/`)
  return data
}

export async function upsertFieldValue(cardId: string, fieldId: string, valueJson: unknown): Promise<FieldValue> {
  const { data } = await api.put<FieldValue>(`/cards/${cardId}/field-values/`, {
    field_id: fieldId,
    value_json: valueJson,
  })
  return data
}

// ---- Attachments ----
export async function listAttachments(cardId: string): Promise<Attachment[]> {
  const { data } = await api.get<Attachment[]>(`/cards/${cardId}/attachments/`)
  return data
}

export async function uploadAttachment(cardId: string, file: File): Promise<Attachment> {
  const form = new FormData()
  form.append("file", file)
  const { data } = await api.post<Attachment>(`/cards/${cardId}/attachments/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/attachments/${attachmentId}/`)
}

// ---- Marketing: aprovação de peças e versões ----
export async function approveCard(
  cardId: string,
  decision: "approved" | "rejected",
  comment = "",
): Promise<ApprovalResult> {
  const { data } = await api.post<ApprovalResult>(`/cards/${cardId}/approval/`, {
    decision,
    comment,
  })
  return data
}

export async function listAttachmentVersions(attachmentId: string): Promise<Attachment[]> {
  const { data } = await api.get<Attachment[]>(`/attachments/${attachmentId}/versions/`)
  return data
}

export async function uploadAttachmentVersion(
  attachmentId: string,
  file: File,
): Promise<Attachment> {
  const form = new FormData()
  form.append("file", file)
  const { data } = await api.post<Attachment>(
    `/attachments/${attachmentId}/versions/`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  return data
}

// ---- Marketing Hub: métricas de desempenho por peça ----
export async function getCardMetrics(cardId: string): Promise<CardMetrics> {
  const { data } = await api.get<CardMetrics>(`/cards/${cardId}/metrics/`)
  return data
}

export async function saveCardMetrics(
  cardId: string,
  metrics: Partial<Omit<CardMetrics, "engagement" | "updated_at">>,
): Promise<CardMetrics> {
  const { data } = await api.put<CardMetrics>(`/cards/${cardId}/metrics/`, metrics)
  return data
}

// ---- Marketing Hub: relatório e biblioteca de peças ----
export async function getMarketingReport(projectId: string): Promise<MarketingReport> {
  const { data } = await api.get<MarketingReport>(
    `/projects/${projectId}/marketing-report/`,
  )
  return data
}

export async function listMarketingAssets(
  projectId: string,
  channel?: string,
): Promise<MarketingAsset[]> {
  const { data } = await api.get<MarketingAsset[]>(
    `/projects/${projectId}/marketing-assets/`,
    { params: channel ? { channel } : undefined },
  )
  return data
}

// ---- Worklogs ----
export async function listWorklogs(cardId: string): Promise<Worklog[]> {
  const { data } = await api.get<Worklog[]>(`/cards/${cardId}/worklogs/`)
  return data
}

export async function createWorklog(cardId: string, payload: CreateWorklogInput): Promise<Worklog> {
  const { data } = await api.post<Worklog>(`/cards/${cardId}/worklogs/`, payload)
  return data
}

export async function deleteWorklog(worklogId: string): Promise<void> {
  await api.delete(`/worklogs/${worklogId}/`)
}

// ---- Notifications ----
export async function listNotifications(): Promise<Notification[]> {
  const { data } = await api.get<Notification[]>("/notifications/")
  return data
}

export async function markAllNotificationsRead(): Promise<{ marked_read: number }> {
  const { data } = await api.post("/notifications/read-all/")
  return data
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const { data } = await api.patch<Notification>(`/notifications/${id}/`)
  return data
}

// ---- Automations ----
export async function listAutomationRules(projectId: string): Promise<AutomationRule[]> {
  const { data } = await api.get<AutomationRule[]>(`/projects/${projectId}/automation-rules/`)
  return data
}

export async function createAutomationRule(
  projectId: string,
  payload: CreateAutomationRuleInput,
): Promise<AutomationRule> {
  const { data } = await api.post<AutomationRule>(`/projects/${projectId}/automation-rules/`, payload)
  return data
}

export async function updateAutomationRule(
  ruleId: string,
  payload: Partial<CreateAutomationRuleInput>,
): Promise<AutomationRule> {
  const { data } = await api.patch<AutomationRule>(`/automation-rules/${ruleId}/`, payload)
  return data
}

export async function deleteAutomationRule(ruleId: string): Promise<void> {
  await api.delete(`/automation-rules/${ruleId}/`)
}

export async function runAutomationRule(ruleId: string): Promise<AutomationRunLog> {
  const { data } = await api.post<AutomationRunLog>(`/automation-rules/${ruleId}/run/`)
  return data
}

export async function listAutomationRunLogs(ruleId: string): Promise<AutomationRunLog[]> {
  const { data } = await api.get<AutomationRunLog[]>(`/automation-rules/${ruleId}/logs/`)
  return data
}

// ---- Reports ----
export interface ProjectReports {
  burndown: {
    sprint: { id: string; name: string; total_points: number } | null
    ideal: { date: string; points: number }[]
    actual: { date: string; points: number }[]
  }
  velocity: { sprint: string; committed: number; delivered: number }[]
  cfd: { status: string; count: number }[]
}

export async function getProjectReports(projectId: string): Promise<ProjectReports> {
  const { data } = await api.get<ProjectReports>(`/projects/${projectId}/reports/`)
  return data
}

// ---- Permissões de projeto ----
export async function getMyPermissions(projectId: string): Promise<ProjectPermissions> {
  const { data } = await api.get<ProjectPermissions>(`/projects/${projectId}/my-permissions/`)
  return data
}
