// API do contexto integrations — posts sociais agendados, analytics e
// Publicação simulada no backend.
import { api } from "@/shared/api/client"

export interface PostMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}

export interface ScheduledPost {
  id: string
  card_id: string | null
  project_id: string | null
  channel: string
  account_name: string
  content: string
  media_url: string
  media_urls: string[]
  mentions: string[]
  scheduled_at: string
  status: "draft" | "scheduled" | "published" | "failed"
  external_id: string
  error: string
  attempts: number
  next_attempt_at: string | null
  published_at: string | null
  metrics: PostMetrics | null
}

export interface SchedulePostInput {
  workspaceId: string
  accountId: string
  content: string
  scheduledAt: string
  projectId?: string | null
  cardId?: string | null
  mediaUrl?: string
  mediaUrls?: string[]
  mentions?: string[]
}

export async function listPosts(
  workspaceId: string,
  opts: { projectId?: string; month?: string } = {},
): Promise<ScheduledPost[]> {
  const { data } = await api.get<{ posts: ScheduledPost[] }>("/integrations/posts/", {
    params: {
      workspace_id: workspaceId,
      ...(opts.projectId ? { project_id: opts.projectId } : {}),
      ...(opts.month ? { month: opts.month } : {}),
    },
  })
  return data.posts
}

export async function schedulePost(input: SchedulePostInput): Promise<ScheduledPost> {
  const { data } = await api.post<ScheduledPost>("/integrations/posts/", {
    workspace_id: input.workspaceId,
    account_id: input.accountId,
    content: input.content,
    scheduled_at: input.scheduledAt,
    project_id: input.projectId ?? null,
    card_id: input.cardId ?? null,
    media_url: input.mediaUrl ?? "",
    media_urls: input.mediaUrls ?? [],
    mentions: input.mentions ?? [],
  })
  return data
}

export async function updatePost(
  postId: string,
  patch: {
    content?: string
    scheduled_at?: string
    media_url?: string
    media_urls?: string[]
    mentions?: string[]
  },
): Promise<ScheduledPost> {
  const { data } = await api.patch<ScheduledPost>(`/integrations/posts/${postId}/`, patch)
  return data
}

export async function deletePost(postId: string): Promise<void> {
  await api.delete(`/integrations/posts/${postId}/`)
}

export async function publishPost(postId: string): Promise<ScheduledPost> {
  const { data } = await api.post<ScheduledPost>(`/integrations/posts/${postId}/publish/`)
  return data
}

// ── OAuth das redes (fluxo oficial de cada provider) ────────────────────────
export async function getOauthProviders(
  workspaceId?: string,
): Promise<Record<string, boolean>> {
  const { data } = await api.get<{ providers: Record<string, boolean> }>(
    "/integrations/oauth/providers/",
    { params: workspaceId ? { workspace_id: workspaceId } : {} },
  )
  return data.providers
}

// ── Credenciais dos apps OAuth (admin configura pelo frontend) ──────────────
export interface OauthCredential {
  client_id: string
  has_secret: boolean
  configured: boolean
  source: "workspace" | "env" | "none"
  redirect_uri: string
}

export async function getOauthCredentials(
  workspaceId: string,
): Promise<Record<string, OauthCredential>> {
  const { data } = await api.get<{ providers: Record<string, OauthCredential> }>(
    "/integrations/oauth/credentials/",
    { params: { workspace_id: workspaceId } },
  )
  return data.providers
}

export async function saveOauthCredential(
  workspaceId: string,
  provider: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await api.put(`/integrations/oauth/credentials/${provider}/`, {
    workspace_id: workspaceId,
    client_id: clientId,
    client_secret: clientSecret,
  })
}

export async function deleteOauthCredential(
  workspaceId: string,
  provider: string,
): Promise<void> {
  await api.delete(`/integrations/oauth/credentials/${provider}/`, {
    params: { workspace_id: workspaceId },
  })
}

export async function getOauthUrl(
  provider: string,
  workspaceId: string,
  returnTo: string,
): Promise<string> {
  const { data } = await api.get<{ url: string }>(
    `/integrations/oauth/${provider}/url/`,
    { params: { workspace_id: workspaceId, return_to: returnTo } },
  )
  return data.url
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface ChannelAnalytics extends PostMetrics {
  posts: number
}

export interface SocialAnalytics {
  totals: ChannelAnalytics
  by_channel: Record<string, ChannelAnalytics>
  posts: ScheduledPost[]
}

export async function getAnalytics(
  workspaceId: string,
  projectId?: string,
): Promise<SocialAnalytics> {
  const { data } = await api.get<SocialAnalytics>("/integrations/analytics/", {
    params: {
      workspace_id: workspaceId,
      ...(projectId ? { project_id: projectId } : {}),
    },
  })
  return data
}
