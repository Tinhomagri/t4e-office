import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatWorkedTime, workedMinutes } from "./businessTime"

describe("tempo trabalhado no card", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Segunda-feira, 14h (horário local do teste).
    vi.setSystemTime(new Date(2026, 9, 12, 14, 0))
  })
  afterEach(() => vi.useRealTimers())

  it("soma o acumulado com o trecho que está rodando", () => {
    const since = new Date(2026, 9, 12, 13, 0).toISOString()
    expect(workedMinutes({ worked_seconds: 2 * 3600, doing_since: since })).toBe(180)
    expect(formatWorkedTime({ worked_seconds: 2 * 3600, doing_since: since })).toBe("3h")
  })

  it("pausado mostra só o acumulado congelado", () => {
    expect(formatWorkedTime({ worked_seconds: 5400, doing_since: null })).toBe("1h 30min")
  })

  it("sem nada acumulado mostra zero minutos", () => {
    expect(formatWorkedTime({ worked_seconds: 0, doing_since: null })).toBe("0min")
  })
})
