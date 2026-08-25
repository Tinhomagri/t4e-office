// Tipos do painel de Tráfego — porte de types/trafego.ts do T4E OS.
export interface DateRange {
  since: string
  until: string
}

export interface TrafficOverview {
  range: DateRange
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  cpl: number
}

export interface TrafficSeriesPoint {
  date: string
  spend: number
  leads: number
}

export interface TrafficAd {
  id: string
  name: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  status?: string
  temMiniatura: boolean
  objectType?: string
  clientes: number
  cac: number
  valorPorCliente: number | null
  fechamentoDias: number | null
}

export interface TrafficCampaign {
  id: string
  name: string
  spend: number
  leads: number
  cpl: number
}

export interface AudienceSegment {
  key: string
  spend: number
  leads: number
  cpl: number
}

export interface AudienceProfile {
  range: DateRange
  genero: AudienceSegment[]
  idade: AudienceSegment[]
  dispositivo: AudienceSegment[]
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface StateCount {
  uf: string
  count: number
  lon: number
  lat: number
}

export interface Funnel {
  range: DateRange
  total: number
  orcando: number
  clientes: number
  cacReal: number | null
  comContato: { email: number; telefone: number }
  stages: FunnelStage[]
  byUF: StateCount[]
  semLocal: number
  byAd: { name: string; count: number }[]
}

export interface AdWithSales {
  name: string
  vendas: number
  faturamento: number
  ticket: number
  dias: number | null
  spend: number
  roas: number | null
  cac: number | null
  viaNome: number
}

export interface SalesReconciliation {
  total: number
  vendas: number
  ticket: number
  tempoMedio: number | null
  origens: { origem: string; vendas: number; faturamento: number }[]
  anuncios: AdWithSales[]
  naoAchado: { vendas: number; faturamento: number }
  resumoAds: {
    faturamento: number
    spend: number
    roas: number | null
    spendConta: number
    roasConta: number | null
  }
}
