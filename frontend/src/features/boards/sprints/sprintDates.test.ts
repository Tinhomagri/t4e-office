import { afterEach, describe, expect, it, vi } from "vitest"

import {
  addDays,
  daysRemaining,
  durationWeeks,
  endForDuration,
  formatSprintRange,
  todayISO,
} from "./sprintDates"

afterEach(() => vi.useRealTimers())

describe("datas de sprint", () => {
  it("soma dias sem escorregar de fuso", () => {
    expect(addDays("2026-10-12", 11)).toBe("2026-10-23")
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04")
  })

  it("duração conta o dia de início: 2 semanas a partir de segunda acabam no domingo", () => {
    expect(endForDuration("2026-10-12", 1)).toBe("2026-10-18")
    expect(endForDuration("2026-10-12", 2)).toBe("2026-10-25")
  })

  it("reconhece duração padrão ou personalizada", () => {
    expect(durationWeeks("2026-10-12", "2026-10-25")).toBe(2)
    expect(durationWeeks("2026-10-12", "2026-11-08")).toBe(4)
    expect(durationWeeks("2026-10-12", "2026-10-23")).toBe("custom")
    expect(durationWeeks("2026-10-12", "2026-12-06")).toBe("custom") // 8 semanas: fora dos atalhos
  })

  it("formata o intervalo curto em pt-BR", () => {
    expect(formatSprintRange("2026-10-12", "2026-10-23")).toBe("12 out – 23 out")
    expect(formatSprintRange(null, null)).toBe("")
    expect(formatSprintRange("2026-12-28", "2027-01-08")).toBe("28 dez – 8 jan")
  })

  it("dias restantes contam o dia do fim e nunca ficam negativos", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 19, 15, 0))
    expect(todayISO()).toBe("2026-10-19")
    expect(daysRemaining("2026-10-23")).toBe(4)
    expect(daysRemaining("2026-10-19")).toBe(0)
    expect(daysRemaining("2026-10-01")).toBe(0)
  })
})
