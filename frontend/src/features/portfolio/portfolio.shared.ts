import type { BoardCard } from "@/features/workspace/workspace.hooks"
import type { Project } from "@/features/workspace/workspace.types"

export type Health = "on-track" | "at-risk" | "off-track"

export interface ProjectHealth {
  project: Project
  cards: BoardCard[]
  total: number
  done: number
  pointsTotal: number
  pointsDone: number
  reviewAging: number // cards parados em revisão
  progress: number // 0..1 por peso (cai p/ contagem se não houver peso)
  health: Health
}

export const HEALTH_LABEL: Record<Health, string> = {
  "on-track": "No prazo",
  "at-risk": "Em risco",
  "off-track": "Atrasado",
}
export const HEALTH_TONE: Record<Health, "success" | "warning" | "danger"> = {
  "on-track": "success",
  "at-risk": "warning",
  "off-track": "danger",
}
export const HEALTH_BAR: Record<Health, string> = {
  "on-track": "bg-success",
  "at-risk": "bg-warning",
  "off-track": "bg-danger",
}
export const HEALTH_RING: Record<Health, string> = {
  "on-track": "ring-success/30",
  "at-risk": "ring-warning/30",
  "off-track": "ring-danger/30",
}
export const HEALTH_RANK: Record<Health, number> = {
  "off-track": 0,
  "at-risk": 1,
  "on-track": 2,
}

export function computeHealth(project: Project, cards: BoardCard[]): ProjectHealth {
  const total = cards.length
  // "done" é o desfecho (`resolution`), não a coluna — projetos com workflow
  // customizado (ex.: importados do Jira) nunca têm coluna com slug "done", e
  // comparar pelo status literal zerava a saúde inteira do portfólio.
  const done = cards.filter((c) => c.resolution === "done").length
  const pointsTotal = cards.reduce((s, c) => s + (c.points ?? 0), 0)
  const pointsDone = cards
    .filter((c) => c.resolution === "done")
    .reduce((s, c) => s + (c.points ?? 0), 0)
  // Best-effort: só detecta gargalo de revisão em projetos com a coluna
  // padrão "review". Workflows customizados não têm essa granularidade.
  const reviewAging = cards.filter((c) => c.status === "review").length
  const progress = pointsTotal > 0 ? pointsDone / pointsTotal : total > 0 ? done / total : 0

  // Heurística de saúde a partir de dados reais (sem velocity histórica ainda).
  let health: Health = "on-track"
  if (total === 0) health = "on-track"
  else if (reviewAging >= 3 || progress < 0.3) health = "off-track"
  else if (reviewAging >= 1 || progress < 0.6) health = "at-risk"

  return { project, cards, total, done, pointsTotal, pointsDone, reviewAging, progress, health }
}
