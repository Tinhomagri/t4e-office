import { api } from "@/shared/api/client"

import type { CardPriority, CardType } from "@/features/workspace/workspace.types"

export interface SuggestedTask {
  title: string
  description: string
  priority: CardPriority
  type: CardType
}

export interface Analysis {
  summary: string
  tasks: SuggestedTask[]
  decisions: string[]
  risks: string[]
}

export interface CopilotDocument {
  id: string
  title: string
  kind: string
  status: string
  text_preview: string
  analysis: Analysis | null
}

export type DocKind = "text" | "pdf" | "docx" | "audio"

// Importa texto colado.
export async function ingestText(
  workspaceId: string,
  title: string,
  text: string,
): Promise<CopilotDocument> {
  const { data } = await api.post<CopilotDocument>("/copilot/documents/", {
    workspace_id: workspaceId,
    title,
    kind: "text",
    text,
  })
  return data
}

// Importa um arquivo (PDF/DOCX/áudio) via multipart.
export async function ingestFile(
  workspaceId: string,
  title: string,
  kind: DocKind,
  file: File,
): Promise<CopilotDocument> {
  const form = new FormData()
  form.append("workspace_id", workspaceId)
  form.append("title", title)
  form.append("kind", kind)
  form.append("file", file)
  const { data } = await api.post<CopilotDocument>("/copilot/documents/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function analyzeDocument(documentId: string): Promise<Analysis> {
  const { data } = await api.post<Analysis>(`/copilot/documents/${documentId}/analyze/`)
  return data
}

// ── Integração de IA por workspace ──────────────────────────────────────────
export type AiProvider = "anthropic" | "openai"

export interface AiConfig {
  provider: AiProvider
  model: string
  is_active: boolean
  configured: boolean
  key_hint: string
  updated_at: string | null
  can_edit: boolean
}

export interface AiConfigInput {
  provider: AiProvider
  model: string
  api_key?: string
  is_active: boolean
}

export async function getAiConfig(workspaceId: string): Promise<AiConfig> {
  const { data } = await api.get<AiConfig>("/copilot/ai-config/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function saveAiConfig(workspaceId: string, input: AiConfigInput): Promise<AiConfig> {
  const { data } = await api.put<AiConfig>("/copilot/ai-config/", input, {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function testAiConfig(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await api.post<{ ok: boolean; error?: string }>(
    "/copilot/ai-config/test/",
    {},
    { params: { workspace_id: workspaceId } },
  )
  return data
}

// ── Chat conversacional (balão de IA) ───────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// Ação de escrita proposta pela IA (preview antes de confirmar).
export interface PendingAction {
  action: "create_card" | "update_card" | "create_sprint" | "update_sprint"
  reason: string
  project_id?: string
  card_id?: string
  title?: string
  description?: string
  priority?: CardPriority
  type?: CardType
  status?: string
  points?: number
  sprint_id?: string
  sprint_name?: string
  goal?: string
  start_date?: string
  end_date?: string
}

export interface ChatResult {
  reply: string
  pending_actions: PendingAction[]
}

export async function sendChat(
  workspaceId: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const { data } = await api.post<ChatResult>("/copilot/chat/", {
    workspace_id: workspaceId,
    messages,
  })
  return { reply: data.reply, pending_actions: data.pending_actions ?? [] }
}

export interface AgentActionResult {
  ok: boolean
  action?: string
  id?: string
  ref?: string
  title?: string
  name?: string
  error?: string
}

// Executa as ações propostas após o usuário confirmar.
export async function executeAgentActions(
  workspaceId: string,
  actions: PendingAction[],
): Promise<AgentActionResult[]> {
  const { data } = await api.post<{ results: AgentActionResult[] }>(
    "/copilot/agent/execute/",
    { workspace_id: workspaceId, actions },
  )
  return data.results
}

// ── Uso e avaliação do Copiloto ─────────────────────────────────────────────
export interface SeriesPoint {
  day: string
  chats: number
  analyses: number
  cards: number
  interactions: number
}

export interface KindSlice {
  key: string
  label: string
  value: number
}

export interface CopilotTopUser {
  id: string
  name: string
  count: number
}

export interface CopilotRecentEvent {
  kind: string
  count: number
  actor: string
  at: string
}

export interface CopilotMetrics {
  period_days: number
  chats: number
  documents_analyzed: number
  cards_created: number
  interactions: number
  active_users: number
  thumbs_up: number
  thumbs_down: number
  satisfaction: number | null
  total_ratings: number
  trend: {
    interactions: number | null
    cards_created: number | null
    active_users: number | null
    satisfaction_prev: number | null
  }
  series: SeriesPoint[]
  by_kind: KindSlice[]
  top_users: CopilotTopUser[]
  recent: CopilotRecentEvent[]
}

export async function getCopilotMetrics(workspaceId: string): Promise<CopilotMetrics> {
  const { data } = await api.get<CopilotMetrics>("/copilot/metrics/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function sendFeedback(
  workspaceId: string,
  rating: "up" | "down",
): Promise<void> {
  await api.post("/copilot/feedback/", { workspace_id: workspaceId, rating })
}

export async function createTasksFromDocument(
  documentId: string,
  projectId: string,
  tasks: SuggestedTask[],
): Promise<{ created: { id: string; ref: string; title: string }[] }> {
  const { data } = await api.post(`/copilot/documents/${documentId}/create-tasks/`, {
    project_id: projectId,
    tasks,
  })
  return data
}
