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
}

function params(filter: TrafficFilter) {
  return { since: filter.since, until: filter.until }
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

export async function getSales(): Promise<SalesReconciliation> {
  const { data } = await api.get<SalesReconciliation>("/traffic/report/vendas/")
  return data
}

export function thumbnailUrl(adId: string): string {
  return `/api/traffic/thumbnail/?ad_id=${encodeURIComponent(adId)}`
}

export function previewUrl(adId: string, formato?: string): string {
  const query = new URLSearchParams({ ad_id: adId, ...(formato ? { formato } : {}) })
  return `/api/traffic/preview/?${query.toString()}`
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export const trafficKeys = {
  overview: (filter: TrafficFilter) => ["traffic-overview", filter.since, filter.until] as const,
  series: (filter: TrafficFilter) => ["traffic-series", filter.since, filter.until] as const,
  ads: (filter: TrafficFilter) => ["traffic-ads", filter.since, filter.until] as const,
  campaigns: (filter: TrafficFilter) => ["traffic-campaigns", filter.since, filter.until] as const,
  audience: (filter: TrafficFilter) => ["traffic-audience", filter.since, filter.until] as const,
  funnel: (filter: TrafficFilter) => ["traffic-funnel", filter.since, filter.until] as const,
  sales: () => ["traffic-sales"] as const,
}

export function useTrafficOverview(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.overview(filter),
    queryFn: () => getOverview(filter),
    staleTime: 60_000,
  })
}

export function useTrafficSeries(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.series(filter),
    queryFn: () => getSeries(filter),
    staleTime: 60_000,
  })
}

export function useTrafficAds(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.ads(filter),
    queryFn: () => getAds(filter),
    staleTime: 60_000,
  })
}

export function useTrafficCampaigns(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.campaigns(filter),
    queryFn: () => getCampaigns(filter),
    staleTime: 60_000,
  })
}

export function useTrafficAudience(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.audience(filter),
    queryFn: () => getAudience(filter),
    staleTime: 60_000,
  })
}

export function useTrafficFunnel(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.funnel(filter),
    queryFn: () => getFunnel(filter),
    staleTime: 60_000,
  })
}

export function useTrafficSales() {
  return useQuery({ queryKey: trafficKeys.sales(), queryFn: getSales, staleTime: 60_000 })
}
