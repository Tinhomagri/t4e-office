// Camada HTTP das leituras analíticas de marketing (série temporal, saúde da
// fila e das contas). Separada de social.api.ts porque aqui é tudo somente
// leitura e agregado — nada dispara publicação.
import { useQuery } from "@tanstack/react-query"

import { api } from "@/shared/api/client"

export interface MetricBundle {
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}

export interface SeriesPoint extends MetricBundle {
  date: string
  posts: number
}

export interface ChannelStats extends MetricBundle {
  posts: number
  engagement_rate: number
}

export interface TopPost {
  id: string
  channel: string
  account_name: string
  content: string
  published_at: string
  metrics: MetricBundle
  engagement_rate: number
}

export interface AnalyticsTimeseries {
  range: { start: string; end: string; days: number }
  series: SeriesPoint[]
  totals: MetricBundle & { posts: number; engagement_rate: number }
  previous: MetricBundle & { posts: number; engagement_rate: number }
  by_channel: Record<string, ChannelStats>
  /** weekday (0=seg) → hora → impressões acumuladas. */
  heatmap: Record<string, Record<string, number>>
  top_posts: TopPost[]
}

export async function getAnalyticsTimeseries(
  workspaceId: string,
  opts: { days?: number; channel?: string; projectId?: string } = {},
): Promise<AnalyticsTimeseries> {
  const { data } = await api.get<AnalyticsTimeseries>("/integrations/analytics/timeseries/", {
    params: {
      workspace_id: workspaceId,
      ...(opts.days ? { days: opts.days } : {}),
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.projectId ? { project_id: opts.projectId } : {}),
    },
  })
  return data
}

export interface QueueStats {
  by_status: Record<"draft" | "scheduled" | "published" | "failed", number>
  by_channel: Record<string, Record<"draft" | "scheduled" | "published" | "failed", number>>
  /** ISO date → nº de posts agendados naquele dia (próximos 14 dias). */
  upcoming: Record<string, number>
  overdue: number
  next_post: { id: string; channel: string; content: string; scheduled_at: string } | null
  last_7d: { published: number; failed: number; success_rate: number }
}

export async function getQueueStats(workspaceId: string): Promise<QueueStats> {
  const { data } = await api.get<QueueStats>("/integrations/queue/stats/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export type AccountHealthStatus = "healthy" | "expiring" | "expired" | "disconnected"

export interface AccountHealth {
  id: string
  channel: string
  account_name: string
  connected_at: string
  has_token: boolean
  can_refresh: boolean
  token_expires_at: string | null
  token_expires_in_days: number | null
  status: AccountHealthStatus
  posts: { scheduled: number; published: number; failed: number }
  impressions: number
  last_published_at: string | null
  sparkline: number[]
}

export async function getAccountsHealth(
  workspaceId: string,
  days = 30,
): Promise<{ days: number; accounts: AccountHealth[] }> {
  const { data } = await api.get<{ days: number; accounts: AccountHealth[] }>(
    "/integrations/accounts/health/",
    { params: { workspace_id: workspaceId, days } },
  )
  return data
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export const insightKeys = {
  timeseries: (workspaceId: string | null, days: number, channel?: string) =>
    ["social-timeseries", workspaceId, days, channel ?? ""] as const,
  queue: (workspaceId: string | null) => ["social-queue-stats", workspaceId] as const,
  health: (workspaceId: string | null, days: number) =>
    ["social-accounts-health", workspaceId, days] as const,
}

export function useAnalyticsTimeseries(
  workspaceId: string | null,
  days: number,
  channel?: string,
) {
  return useQuery({
    queryKey: insightKeys.timeseries(workspaceId, days, channel),
    queryFn: () => getAnalyticsTimeseries(workspaceId as string, { days, channel }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useQueueStats(workspaceId: string | null, refetchMs?: number) {
  return useQuery({
    queryKey: insightKeys.queue(workspaceId),
    queryFn: () => getQueueStats(workspaceId as string),
    enabled: !!workspaceId,
    // A fila muda sozinha (worker publica no horário): vale revalidar de tempos
    // em tempos quando a tela está aberta.
    refetchInterval: refetchMs,
    staleTime: 15_000,
  })
}

export function useAccountsHealth(workspaceId: string | null, days = 30) {
  return useQuery({
    queryKey: insightKeys.health(workspaceId, days),
    queryFn: () => getAccountsHealth(workspaceId as string, days),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}
