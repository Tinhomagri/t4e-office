import { api } from "@/shared/api/client"

import type { SpaceId } from "@/features/shell/spaces"
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

// ── Marketing: geração de copy por canal ────────────────────────────────────
export interface GeneratedCopy {
  channel: string
  variations: string[]
}

export type CopyTone = "" | "institucional" | "descontraido" | "urgente" | "educativo" | "inspirador"

export interface GenerateCopyOptions {
  tone?: CopyTone
  includeHashtags?: boolean | null
  count?: number
  // Copy existente a ser adaptada para o canal alvo (modo adaptação)
  sourceCopy?: string
}

export async function generateCopy(
  workspaceId: string,
  title: string,
  description: string,
  channel: string,
  options: GenerateCopyOptions = {},
): Promise<GeneratedCopy> {
  const { data } = await api.post<GeneratedCopy>("/copilot/generate-copy/", {
    workspace_id: workspaceId,
    title,
    description,
    channel,
    tone: options.tone ?? "",
    include_hashtags: options.includeHashtags ?? null,
    count: options.count ?? 3,
    source_copy: options.sourceCopy ?? "",
  })
  return data
}

// ── Marketing: geração de campanha multicanal a partir de um briefing ───────
export interface CampaignPiece {
  channel: string
  title: string
  copy: string
  publish_date: string | null
  format_hint: string
}

export interface GenerateCampaignInput {
  workspaceId: string
  brief: string
  channels: string[]
  startDate: string
  endDate: string
  perChannel?: number
  tone?: CopyTone
}

export async function generateCampaign(
  input: GenerateCampaignInput,
): Promise<{ pieces: CampaignPiece[] }> {
  const { data } = await api.post<{ pieces: CampaignPiece[] }>(
    "/copilot/generate-campaign/",
    {
      workspace_id: input.workspaceId,
      brief: input.brief,
      channels: input.channels,
      start_date: input.startDate,
      end_date: input.endDate,
      per_channel: input.perChannel ?? 1,
      tone: input.tone ?? "",
    },
  )
  return data
}

// ── Marketing: repurpose (1 peça → N canais) ────────────────────────────────
export async function repurpose(
  workspaceId: string,
  title: string,
  sourceCopy: string,
  channels: string[],
  tone: CopyTone = "",
): Promise<{ pieces: CampaignPiece[] }> {
  const { data } = await api.post<{ pieces: CampaignPiece[] }>("/copilot/repurpose/", {
    workspace_id: workspaceId,
    title,
    source_copy: sourceCopy,
    channels,
    tone,
  })
  return data
}

// ── Marketing: Brand Kit (identidade + tom de voz que guia a IA) ────────────
export interface BrandKit {
  tone_of_voice: string
  colors: string[]
  fonts: string
  logo_url: string
  guidelines: string
  can_edit: boolean
}

export async function getBrandKit(workspaceId: string): Promise<BrandKit> {
  const { data } = await api.get<BrandKit>("/copilot/brand-kit/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function saveBrandKit(
  workspaceId: string,
  kit: Omit<BrandKit, "can_edit">,
): Promise<BrandKit> {
  const { data } = await api.put<BrandKit>(
    "/copilot/brand-kit/",
    { ...kit, workspace_id: workspaceId },
    { params: { workspace_id: workspaceId } },
  )
  return data
}

// ── Marketing: contas de rede social conectadas ─────────────────────────────
export interface SocialAccount {
  id: string
  channel: string
  account_name: string
  connected_at: string | null
}

export async function listSocialAccounts(
  workspaceId: string,
): Promise<{ accounts: SocialAccount[]; can_edit: boolean }> {
  const { data } = await api.get<{ accounts: SocialAccount[]; can_edit: boolean }>(
    "/copilot/social-accounts/",
    { params: { workspace_id: workspaceId } },
  )
  return data
}

export async function connectSocialAccount(
  workspaceId: string,
  channel: string,
  accountName: string,
): Promise<SocialAccount> {
  const { data } = await api.post<SocialAccount>(
    "/copilot/social-accounts/",
    { channel, account_name: accountName, workspace_id: workspaceId },
    { params: { workspace_id: workspaceId } },
  )
  return data
}

export async function disconnectSocialAccount(
  workspaceId: string,
  channel: string,
): Promise<void> {
  await api.delete("/copilot/social-accounts/", {
    params: { workspace_id: workspaceId, channel },
  })
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
// Os nomes vêm do registry do backend — um por domínio de ferramentas.
export type PendingActionKind =
  // entrega
  | "create_card"
  | "update_card"
  | "create_sprint"
  | "update_sprint"
  // comercial
  | "create_deal"
  | "update_deal"
  | "move_deal_stage"
  | "win_deal"
  | "lose_deal"
  | "schedule_activity"
  | "create_customer"

export interface PendingAction {
  action: PendingActionKind
  reason: string
  // entrega
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
  // comercial
  deal_id?: string
  customer_id?: string
  contact_id?: string
  stage_id?: string
  deal_title?: string
  amount?: number
  currency?: string
  probability?: number
  expected_close_date?: string
  owner_id?: string
  deal_source?: string
  create_delivery_project?: boolean
  lost_reason?: string
  lost_notes?: string
  activity_kind?: "note" | "task" | "meeting"
  activity_content?: string
  due_date?: string
  end_date_time?: string
  attendees?: string[]
  customer_name?: string
  customer_kind?: "company" | "person"
  customer_email?: string
  customer_phone?: string
}

export interface ChatResult {
  reply: string
  pending_actions: PendingAction[]
}

export async function sendChat(
  workspaceId: string,
  messages: ChatMessage[],
  // Space ativo: o backend usa como dica de por onde começar a olhar. Não
  // restringe ferramentas — perguntas que cruzam domínios continuam válidas.
  space?: SpaceId,
): Promise<ChatResult> {
  const { data } = await api.post<ChatResult>("/copilot/chat/", {
    workspace_id: workspaceId,
    messages,
    ...(space ? { space } : {}),
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
