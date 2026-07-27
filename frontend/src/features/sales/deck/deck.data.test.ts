import { describe, expect, it } from "vitest"

import type { StageMetrics } from "../sales.metrics"
import { activityHeatmap, buildFunnel, heatLevel, trendDelta, weekStart, weeklyBuckets } from "./deck.data"

const NOW = new Date(2026, 6, 23) // quinta, 23/07/2026

function stage(over: Partial<StageMetrics>): StageMetrics {
  return {
    stage_id: "s",
    name: "Etapa",
    kind: "open",
    color: "#000",
    order: 0,
    count: 0,
    total_amount: "0",
    weighted_amount: "0",
    stale_count: 0,
    avg_age_days: 0,
    ...over,
  }
}

describe("weekStart", () => {
  it("volta para a segunda-feira da semana", () => {
    expect(weekStart(new Date(2026, 6, 23)).getDate()).toBe(20) // segunda
    expect(weekStart(new Date(2026, 6, 20)).getDate()).toBe(20) // já é segunda
    expect(weekStart(new Date(2026, 6, 19)).getDate()).toBe(13) // domingo → semana anterior
  })
})

describe("weeklyBuckets", () => {
  it("gera a janela completa, com zeros nas semanas sem evento", () => {
    const out = weeklyBuckets([{ date: "2026-07-21", amount: 100 }], 4, NOW)
    expect(out).toHaveLength(4)
    expect(out[out.length - 1].count).toBe(1)
    expect(out[out.length - 1].amount).toBe(100)
    expect(out.slice(0, 3).every((b) => b.count === 0)).toBe(true)
  })

  it("ignora data nula ou inválida em vez de quebrar", () => {
    const out = weeklyBuckets([{ date: null }, { date: "não é data" }], 3, NOW)
    expect(out.reduce((a, b) => a + b.count, 0)).toBe(0)
  })

  it("descarta o que cai fora da janela", () => {
    const out = weeklyBuckets([{ date: "2020-01-01", amount: 9 }], 3, NOW)
    expect(out.reduce((a, b) => a + b.amount, 0)).toBe(0)
  })
})

describe("trendDelta", () => {
  it("compara a segunda metade com a primeira", () => {
    expect(trendDelta([1, 1, 2, 2])).toBe(100)
    expect(trendDelta([2, 2, 1, 1])).toBe(-50)
  })

  it("retorna null quando a base é zero ou a série é curta", () => {
    expect(trendDelta([0, 0, 5, 5])).toBeNull()
    expect(trendDelta([1, 2])).toBeNull()
  })
})

describe("buildFunnel", () => {
  const stages = [
    stage({ stage_id: "a", order: 1, count: 10, total_amount: "1000" }),
    stage({ stage_id: "b", order: 2, count: 4, total_amount: "800" }),
    stage({ stage_id: "won", order: 3, kind: "won", count: 99 }),
  ]

  it("usa só estágios abertos, na ordem do pipeline", () => {
    const out = buildFunnel(stages)
    expect(out.map((s) => s.stage_id)).toEqual(["a", "b"])
  })

  it("calcula share sobre o topo e conversão para a próxima etapa", () => {
    const out = buildFunnel(stages)
    expect(out[0].share).toBe(1)
    expect(out[1].share).toBe(0.4)
    expect(out[0].conversion).toBe(40)
    expect(out[1].conversion).toBeNull() // última etapa
  })

  it("não divide por zero quando o funil está vazio", () => {
    const out = buildFunnel([stage({ stage_id: "a", count: 0 })])
    expect(out[0].share).toBe(0)
    expect(out[0].conversion).toBeNull()
  })
})

describe("activityHeatmap", () => {
  it("cobre semanas × 7 dias e acha o pico", () => {
    const { cells, max } = activityHeatmap(
      [
        { created_at: "2026-07-21T10:00:00Z" },
        { created_at: "2026-07-21T14:00:00Z" },
        { created_at: "2026-07-22T09:00:00Z" },
      ],
      4,
      NOW,
    )
    expect(cells).toHaveLength(28)
    expect(max).toBe(2)
  })

  it("ignora atividade anterior à janela", () => {
    const { max } = activityHeatmap([{ created_at: "2019-01-01T10:00:00Z" }], 4, NOW)
    expect(max).toBe(0)
  })
})

describe("heatLevel", () => {
  it("mapeia contagem para 0–4", () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 10)).toBe(1)
    expect(heatLevel(10, 10)).toBe(4)
    expect(heatLevel(5, 0)).toBe(0) // sem máximo, sem cor
  })
})
