import { describe, expect, it } from "vitest"

import type { ProjectReports } from "@/features/workspace/workspace.api"
import type { BoardCard } from "@/features/workspace/workspace.hooks"

import { filterBoardsCards, isDelivered, sliceMyDay, toBurndownSeries } from "./MyDayPage"

const EU = "user-1"
const HOJE = "2026-07-31"

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    id: crypto.randomUUID(),
    ref: "T4E-1",
    title: "Card",
    status: "todo",
    priority: "medium",
    type: "task",
    assignee_id: EU,
    project_id: "p1",
    projectName: "Projeto",
    sprint_id: null,
    due_date: null,
    points: 0,
    rank: "0|hzzzzz:",
    created_at: null,
    updated_at: null,
    ...over,
  } as BoardCard
}

describe("sliceMyDay", () => {
  it("só olha os cards atribuídos a mim", () => {
    const my = sliceMyDay([card(), card({ assignee_id: "outro" })], EU, HOJE)
    expect(my.mine).toHaveLength(1)
  })

  it("card concluído hoje NÃO conta como 'vence hoje'", () => {
    // Era o erro: o filtro só olhava due_date. Quem fechava um card no próprio
    // dia do prazo continuava vendo a pendência no KPI — e o número subia todo
    // fim de sprint, justo quando mais cards são entregues.
    const my = sliceMyDay(
      [
        card({ due_date: HOJE, status: "doing" }),
        card({ due_date: HOJE, status: "done", resolution: "done" }),
      ],
      EU,
      HOJE,
    )
    expect(my.dueToday).toHaveLength(1)
    expect(my.dueToday[0].status).toBe("doing")
  })

  it("atrasado é prazo no passado e card ainda aberto", () => {
    const my = sliceMyDay(
      [
        card({ due_date: "2026-07-20", status: "doing" }),
        card({ due_date: "2026-07-20", status: "done" }),
        card({ due_date: "2026-08-20", status: "doing" }),
        card({ due_date: null, status: "doing" }),
      ],
      EU,
      HOJE,
    )
    expect(my.overdue).toHaveLength(1)
    expect(my.overdue[0].due_date).toBe("2026-07-20")
  })

  it("entregue conta pelo desfecho, não pela coluna", () => {
    // Um card "não será feito" mora na coluna Concluído mas não é entrega.
    // Contá-lo inflava "concluídos" com trabalho que ninguém fez.
    const my = sliceMyDay(
      [
        card({ status: "done", resolution: "done" }),
        card({ status: "done", resolution: "wont_do" }),
        card({ status: "done", resolution: "duplicate" }),
      ],
      EU,
      HOJE,
    )
    expect(my.delivered).toHaveLength(1)
  })

  it("card antigo sem desfecho cai no status", () => {
    // Migration 0023 preencheu o histórico, mas card criado fora do fluxo pode
    // chegar sem `resolution` — sem esse fallback ele sumia dos entregues.
    expect(isDelivered(card({ status: "done", resolution: null }))).toBe(true)
    expect(isDelivered(card({ status: "doing", resolution: null }))).toBe(false)
  })
})

describe("filterBoardsCards", () => {
  it("exclui cards de projeto marketing, mantém o resto", () => {
    const software = card({ project_template: "software" })
    const marketing = card({ project_template: "marketing" })
    const semTemplate = card({ project_template: undefined })

    const filtered = filterBoardsCards([software, marketing, semTemplate])

    expect(filtered).toContain(software)
    expect(filtered).toContain(semTemplate)
    expect(filtered).not.toContain(marketing)
  })
})

describe("toBurndownSeries", () => {
  const reports = (over: Partial<ProjectReports["burndown"]>): ProjectReports => ({
    burndown: {
      sprint: { id: "s1", name: "Sprint 1", total_points: 20 },
      ideal: [],
      actual: [],
      ...over,
    },
    velocity: [],
    cfd: [],
  })

  it("sem sprint, série vazia — não desenha gráfico de nada", () => {
    expect(toBurndownSeries(undefined, HOJE)).toEqual([])
    expect(toBurndownSeries(reports({ sprint: null }), HOJE)).toEqual([])
  })

  it("casa real e ideal por DATA e deixa o futuro nulo", () => {
    // `actual` do backend para no dia de hoje. Casar por índice quebraria se o
    // backend mudasse a granularidade; casar por data não.
    const serie = toBurndownSeries(
      reports({
        ideal: [
          { date: "2026-07-30", points: 20 },
          { date: HOJE, points: 10 },
          { date: "2026-08-01", points: 0 },
        ],
        actual: [
          { date: "2026-07-30", points: 20 },
          { date: HOJE, points: 14 },
        ],
      }),
      HOJE,
    )
    expect(serie.map((p) => p.real)).toEqual([20, 14, null])
    expect(serie.map((p) => p.ideal)).toEqual([20, 10, 0])
    expect(serie.filter((p) => p.isToday)).toHaveLength(1)
    expect(serie.find((p) => p.isToday)?.date).toBe(HOJE)
  })
})
