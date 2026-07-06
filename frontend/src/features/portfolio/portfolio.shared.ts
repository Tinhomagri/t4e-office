import type { BoardCard } from "@/features/workspace/workspace.hooks"
import type { CardStatus, Project } from "@/features/workspace/workspace.types"

export type Health = "on-track" | "at-risk" | "off-track"

export interface ProjectHealth {
  project: Project
  cards: BoardCard[]
  total: number
  done: number
  pointsTotal: number
  pointsDone: number
  reviewAging: number // cards parados em revisão
  progress: number // 0..1 por pontos (cai p/ contagem se não houver pontos)
  health: Health
  statusCounts: Record<CardStatus, number>
}

export const STATUS_ORDER: CardStatus[] = ["backlog", "todo", "doing", "review", "done"]

export const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Revisão",
  done: "Concluído",
}

export const STATUS_BAR: Record<CardStatus, string> = {
  backlog: "bg-paper-300 dark:bg-ink-600",
  todo: "bg-ink-400",
  doing: "bg-brand-500",
  review: "bg-warning",
  done: "bg-success",
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
  const done = cards.filter((c) => c.status === "done").length
  const pointsTotal = cards.reduce((s, c) => s + (c.points ?? 0), 0)
  const pointsDone = cards
    .filter((c) => c.status === "done")
    .reduce((s, c) => s + (c.points ?? 0), 0)
  const reviewAging = cards.filter((c) => c.status === "review").length
  const progress = pointsTotal > 0 ? pointsDone / pointsTotal : total > 0 ? done / total : 0

  // Heurística de saúde a partir de dados reais (sem velocity histórica ainda).
  let health: Health = "on-track"
  if (total === 0) health = "on-track"
  else if (reviewAging >= 3 || progress < 0.3) health = "off-track"
  else if (reviewAging >= 1 || progress < 0.6) health = "at-risk"

  const statusCounts = STATUS_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: cards.filter((c) => c.status === s).length }),
    {} as Record<CardStatus, number>,
  )

  return {
    project,
    cards,
    total,
    done,
    pointsTotal,
    pointsDone,
    reviewAging,
    progress,
    health,
    statusCounts,
  }
}
