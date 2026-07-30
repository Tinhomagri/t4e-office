import { describe, expect, it } from "vitest"

import {
  byAssignee,
  completionTrend,
  creationTrend,
  isDelivered,
  leadTimeByWeek,
  shortDay,
  shortMonth,
  topNSlices,
} from "./resumo.metrics"
import type { Card, Member } from "@/features/workspace/workspace.types"

function card(over: Partial<Card> = {}): Card {
  return {
    id: crypto.randomUUID(),
    ref: "T-1",
    project_id: "p",
    number: 1,
    title: "C",
    description: "",
    status: "todo",
    type: "feature",
    priority: "medium",
    points: null,
    assignee_id: null,
    reporter_id: null,
    sprint_id: null,
    start_date: null,
    due_date: null,
    order: 0,
    rank: "",
    parent_id: null,
    epic_id: null,
    epic_color: "",
    labels: [],
    created_at: null,
    updated_at: null,
    ...over,
  }
}

describe("topNSlices", () => {
  it("agrupa a cauda em Outros", () => {
    const slices = topNSlices(
      [1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: `k${n}`, label: `L${n}`, value: n })),
      3,
    )
    expect(slices.map((s) => s.label)).toEqual(["L7", "L6", "L5", "Outros"])
    // 4+3+2+1 = 10
    expect(slices[slices.length - 1].value).toBe(10)
  })

  it("não cria Outros quando tudo cabe", () => {
    const slices = topNSlices([{ key: "a", label: "A", value: 2 }], 5)
    expect(slices.map((s) => s.key)).toEqual(["a"])
  })

  it("descarta categorias zeradas", () => {
    const slices = topNSlices([
      { key: "a", label: "A", value: 3 },
      { key: "b", label: "B", value: 0 },
    ])
    expect(slices).toHaveLength(1)
  })
})

describe("byAssignee", () => {
  const members: Member[] = [
    { user_id: "u1", name: "Ana Souza", email: "a@x.com", role: "member" },
  ]

  it("nomeia responsáveis e agrupa os sem dono", () => {
    const slices = byAssignee(
      [card({ assignee_id: "u1" }), card({ assignee_id: null }), card({ assignee_id: null })],
      members,
    )
    const semDono = slices.find((s) => s.label === "Sem responsável")
    expect(semDono?.value).toBe(2)
    expect(slices.find((s) => s.label === "Ana Souza")?.value).toBe(1)
  })

  it("responsável fora da lista de membros não vira fatia anônima silenciosa", () => {
    const slices = byAssignee([card({ assignee_id: "fantasma" })], members)
    expect(slices[0].label).toBe("Desconhecido")
  })
})

describe("isDelivered", () => {
  it("cancelado na coluna done não é entrega", () => {
    expect(isDelivered(card({ status: "done", resolution: "wont_do" }))).toBe(false)
  })

  it("resolvido como done é entrega", () => {
    expect(isDelivered(card({ status: "done", resolution: "done" }))).toBe(true)
  })

  it("card antigo sem desfecho cai no status", () => {
    expect(isDelivered(card({ status: "done" }))).toBe(true)
    expect(isDelivered(card({ status: "doing" }))).toBe(false)
  })
})

describe("creationTrend", () => {
  const today = new Date(2026, 6, 10) // 10/jul/2026

  it("devolve todos os dias da janela, inclusive vazios", () => {
    const rows = creationTrend([], ["todo"], () => "todo", 7, today)
    expect(rows).toHaveLength(7)
    expect(rows[0].date).toBe("2026-07-04")
    expect(rows[rows.length - 1].date).toBe("2026-07-10")
  })

  it("soma no dia certo e ignora o que está fora da janela", () => {
    const rows = creationTrend(
      [
        card({ created_at: new Date(2026, 6, 9, 12).toISOString(), status: "todo" }),
        card({ created_at: new Date(2026, 6, 9, 18).toISOString(), status: "todo" }),
        card({ created_at: new Date(2026, 5, 1).toISOString(), status: "todo" }), // fora
      ],
      ["todo"],
      () => "todo",
      7,
      today,
    )
    expect(rows.find((r) => r.date === "2026-07-09")!.todo).toBe(2)
    expect(rows.reduce((s, r) => s + (r.todo as number), 0)).toBe(2)
  })
})

describe("completionTrend", () => {
  const today = new Date(2026, 6, 15)

  it("conta por resolved_at, não por updated_at", () => {
    const rows = completionTrend(
      [
        card({
          status: "done",
          resolution: "done",
          resolved_at: new Date(2026, 5, 20).toISOString(),
          updated_at: new Date(2026, 6, 14).toISOString(),
          type: "bug",
        }),
      ],
      ["bug"],
      () => "bug",
      3,
      today,
    )
    expect(rows.find((r) => r.month === "2026-06")!.bug).toBe(1)
    expect(rows.find((r) => r.month === "2026-07")!.bug).toBe(0)
  })

  it("ignora card não entregue", () => {
    const rows = completionTrend(
      [
        card({
          status: "done",
          resolution: "duplicate",
          resolved_at: new Date(2026, 6, 1).toISOString(),
          type: "bug",
        }),
      ],
      ["bug"],
      () => "bug",
      2,
      today,
    )
    expect(rows.reduce((s, r) => s + (r.bug as number), 0)).toBe(0)
  })
})

describe("leadTimeByWeek", () => {
  const today = new Date(2026, 6, 15) // quarta

  it("média em dias entre criação e resolução", () => {
    const rows = leadTimeByWeek(
      [
        card({
          created_at: new Date(2026, 6, 10).toISOString(),
          resolved_at: new Date(2026, 6, 14).toISOString(),
          resolution: "done",
        }),
        card({
          created_at: new Date(2026, 6, 12).toISOString(),
          resolved_at: new Date(2026, 6, 14).toISOString(),
          resolution: "done",
        }),
      ],
      4,
      today,
    )
    // (4 + 2) / 2 = 3
    const semana = rows[rows.length - 1]
    expect(semana.days).toBe(3)
    expect(semana.count).toBe(2)
  })

  it("semana sem entrega é null, não zero", () => {
    const rows = leadTimeByWeek([], 3, today)
    expect(rows.every((r) => r.days === null && r.count === 0)).toBe(true)
  })

  it("resolvido antes de criado não gera lead time negativo", () => {
    const rows = leadTimeByWeek(
      [
        card({
          created_at: new Date(2026, 6, 14).toISOString(),
          resolved_at: new Date(2026, 6, 13).toISOString(),
          resolution: "done",
        }),
      ],
      2,
      today,
    )
    expect(rows[rows.length - 1].days).toBe(0)
  })
})

describe("rótulos de eixo", () => {
  it("dia e mês em pt-BR curtos", () => {
    expect(shortDay("2026-07-04")).toBe("04/07")
    expect(shortMonth("2026-07")).toBe("jul/26")
  })
})
