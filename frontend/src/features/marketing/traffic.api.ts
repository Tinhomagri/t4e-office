// Camada HTTP do painel de Tráfego (Meta Ads) — porte de services/api/trafego.ts
// do T4E OS. Config por variável de ambiente do backend: sem token/planilha
// configurados, os endpoints devolvem 400 — a tela mostra aviso em vez de quebrar.
import { useQuery } from "@tanstack/react-query"

import { api } from "@/shared/api/client"
import type {
  AudienceProfile,
  Funnel,
  SalesReconciliation,
  TrafficAd,
  TrafficCampaign,
  TrafficOverview,
  TrafficSeriesPoint,
} from "@/features/marketing/traffic.types"

export interface TrafficFilter {
  since?: string
  until?: string
  // Tráfego é um módulo global (sem workspace no seu domínio) — o
  // workspace_id aqui só existe para o backend checar o space "marketing"
  // do membro (SpaceAccessPermission), não para filtrar dados.
  workspaceId?: string | null
}

function params(filter: TrafficFilter) {
  return { since: filter.since, until: filter.until, workspace_id: filter.workspaceId ?? undefined }
}

export async function getOverview(filter: TrafficFilter): Promise<TrafficOverview> {
  const { data } = await api.get<TrafficOverview>("/traffic/report/geral/", { params: params(filter) })
  return data
}

export async function getSeries(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficSeriesPoint[] }> {
  const { data } = await api.get("/traffic/report/serie/", { params: params(filter) })
  return data
}

export async function getAds(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficAd[] }> {
  const { data } = await api.get("/traffic/report/anuncios/", { params: params(filter) })
  return data
}

export async function getCampaigns(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficCampaign[] }> {
  const { data } = await api.get("/traffic/report/campanhas/", { params: params(filter) })
  return data
}

export async function getAudience(filter: TrafficFilter): Promise<AudienceProfile> {
  const { data } = await api.get<AudienceProfile>("/traffic/report/publico/", { params: params(filter) })
  return data
}

export async function getFunnel(filter: TrafficFilter): Promise<Funnel> {
  const { data } = await api.get<Funnel>("/traffic/report/funil/", { params: params(filter) })
  return data
}

export async function getSales(workspaceId?: string | null): Promise<SalesReconciliation> {
  const { data } = await api.get<SalesReconciliation>("/traffic/report/vendas/", {
    params: { workspace_id: workspaceId ?? undefined },
  })
  return data
}

// A auth do app é via header Authorization (interceptor do axios) — não há
// cookie de sessão. Um <img src> ou <a href> direto para essas rotas nunca
// leva o token e cai em 401 no backend (IsAuthenticated). Por isso ambas
// passam pelo client autenticado em vez de uma URL crua.
export async function getThumbnailBlob(adId: string, workspaceId?: string | null): Promise<Blob> {
  const { data } = await api.get("/traffic/thumbnail/", {
    params: { ad_id: adId, workspace_id: workspaceId ?? undefined },
    responseType: "blob",
  })
  return data
}

export async function getAdPreviewHtml(
  adId: string,
  formato?: string,
  workspaceId?: string | null,
): Promise<string> {
  const { data } = await api.get<{ html: string }>("/traffic/preview/", {
    params: { ad_id: adId, formato, workspace_id: workspaceId ?? undefined },
  })
  return data.html
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export const trafficKeys = {
  overview: (filter: TrafficFilter) => ["traffic-overview", filter.since, filter.until, filter.workspaceId] as const,
  series: (filter: TrafficFilter) => ["traffic-series", filter.since, filter.until, filter.workspaceId] as const,
  ads: (filter: TrafficFilter) => ["traffic-ads", filter.since, filter.until, filter.workspaceId] as const,
  campaigns: (filter: TrafficFilter) => ["traffic-campaigns", filter.since, filter.until, filter.workspaceId] as const,
  audience: (filter: TrafficFilter) => ["traffic-audience", filter.since, filter.until, filter.workspaceId] as const,
  funnel: (filter: TrafficFilter) => ["traffic-funnel", filter.since, filter.until, filter.workspaceId] as const,
  sales: (workspaceId?: string | null) => ["traffic-sales", workspaceId] as const,
}

export function useTrafficOverview(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.overview(filter),
    queryFn: () => getOverview(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficSeries(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.series(filter),
    queryFn: () => getSeries(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficAds(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.ads(filter),
    queryFn: () => getAds(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficCampaigns(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.campaigns(filter),
    queryFn: () => getCampaigns(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficAudience(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.audience(filter),
    queryFn: () => getAudience(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficFunnel(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.funnel(filter),
    queryFn: () => getFunnel(filter),
    enabled: !!filter.workspaceId,
    staleTime: 60_000,
  })
}

export function useTrafficSales(workspaceId?: string | null) {
  return useQuery({
    queryKey: trafficKeys.sales(workspaceId),
    queryFn: () => getSales(workspaceId),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}
