import { describe, expect, it } from "vitest"

import {
  closeDateState,
  columnTotals,
  dealAmount,
  formatMoney,
  nextProbability,
  sortStages,
  weightedAmount,
} from "./sales.shared"
import type { Deal, PipelineStage } from "./sales.types"

function makeDeal(over: Partial<Deal> = {}): Deal {
  return {
    id: "d1",
    workspace_id: "w1",
    title: "Negócio",
    customer_id: "c1",
    customer_name: "Cliente",
    contact_id: null,
    stage_id: "s1",
    amount: "1000",
    currency: "BRL",
    probability: 50,
    expected_close_date: null,
    source: "",
    owner_id: null,
    lost_reason: "",
    lost_notes: "",
    won_at: null,
    lost_at: null,
    delivery_project_id: null,
    rank: "a",
    created_at: "2026-07-01T12:00:00Z",
    updated_at: "2026-07-01T12:00:00Z",
    ...over,
  }
}

function makeStage(over: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: "s1",
    workspace_id: "w1",
    name: "Lead",
    slug: "lead",
    color: "#888888",
    order: 0,
    probability_default: 10,
    kind: "open",
    ...over,
  }
}

describe("dealAmount", () => {
  it("converte o Decimal-string do backend em número", () => {
    expect(dealAmount(makeDeal({ amount: "1500.50" }))).toBe(1500.5)
  })

  it("trata valor vazio ou inválido como zero", () => {
    expect(dealAmount(makeDeal({ amount: "" }))).toBe(0)
    expect(dealAmount(makeDeal({ amount: "abc" }))).toBe(0)
  })
})

describe("weightedAmount", () => {
  it("pondera o valor pela probabilidade", () => {
    expect(weightedAmount(makeDeal({ amount: "2000", probability: 25 }))).toBe(500)
  })

  it("zera quando a probabilidade é zero", () => {
    expect(weightedAmount(makeDeal({ probability: 0 }))).toBe(0)
  })
})

describe("columnTotals", () => {
  it("soma contagem, valor e valor ponderado da coluna", () => {
    const totals = columnTotals([
      makeDeal({ id: "a", amount: "1000", probability: 50 }),
      makeDeal({ id: "b", amount: "3000", probability: 10 }),
    ])
    expect(totals).toEqual({ count: 2, total: 4000, weighted: 800 })
  })

  it("devolve zeros para coluna vazia", () => {
    expect(columnTotals([])).toEqual({ count: 0, total: 0, weighted: 0 })
  })
})

describe("nextProbability", () => {
  const from = makeStage({ id: "s1", probability_default: 10 })
  const to = makeStage({ id: "s2", probability_default: 60 })

  it("adota o default do novo estágio quando o usuário não editou", () => {
    expect(nextProbability(10, from, to)).toBe(60)
  })

  it("preserva a probabilidade editada manualmente", () => {
    expect(nextProbability(35, from, to)).toBe(35)
  })

  it("usa o default do destino quando a origem é desconhecida", () => {
    expect(nextProbability(35, undefined, to)).toBe(60)
  })
})

describe("sortStages", () => {
  it("ordena por `order` sem mutar o array original", () => {
    const stages = [makeStage({ id: "b", order: 2 }), makeStage({ id: "a", order: 1 })]
    expect(sortStages(stages).map((s) => s.id)).toEqual(["a", "b"])
    expect(stages[0].id).toBe("b")
  })
})

describe("closeDateState", () => {
  const now = new Date("2026-07-22T10:00:00")

  it("classifica prazo vencido, hoje, próximo e distante", () => {
    expect(closeDateState("2026-07-20T00:00:00", now)).toBe("overdue")
    expect(closeDateState("2026-07-22T23:00:00", now)).toBe("today")
    expect(closeDateState("2026-07-26T00:00:00", now)).toBe("soon")
    expect(closeDateState("2026-09-01T00:00:00", now)).toBe("far")
  })

  it("devolve null sem data", () => {
    expect(closeDateState(null, now)).toBeNull()
  })
})

describe("formatMoney", () => {
  it("formata em reais e encurta acima de 1 milhão", () => {
    expect(formatMoney(1500)).toContain("1.500")
    expect(formatMoney(2_500_000)).toMatch(/2,5\s?mi/i)
  })
})
