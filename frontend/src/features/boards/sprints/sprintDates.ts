/**
 * Datas de sprint como o Jira: duração de 1–4 semanas ou personalizada. O dia
 * de início conta (mesma regra do backend, `Sprint.window_from`): 2 semanas a
 * partir de uma segunda terminam no domingo seguinte. Tudo em "AAAA-MM-DD" (o que a API manda e
 * recebe) e calculado em UTC — `new Date("2026-10-12")` local escorregaria um
 * dia no fuso de São Paulo.
 */

export const DURATION_WEEKS = [1, 2, 3, 4] as const
export type SprintDuration = (typeof DURATION_WEEKS)[number] | "custom"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const DAY_MS = 86_400_000

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS)
}

export function endForDuration(start: string, weeks: number): string {
  return addDays(start, weeks * 7 - 1)
}

/** Semanas ↔ `duration_days` da API (`null` = personalizada). */
export function durationToDays(d: SprintDuration): number | null {
  return d === "custom" ? null : d * 7
}

export function daysToDuration(days: number | null | undefined): SprintDuration | null {
  if (!days) return null
  const weeks = days / 7
  return (DURATION_WEEKS as readonly number[]).includes(weeks) ? (weeks as SprintDuration) : "custom"
}

export function durationWeeks(start: string, end: string): SprintDuration {
  const days = (toUTC(end) - toUTC(start)) / DAY_MS + 1
  const weeks = days / 7
  return (DURATION_WEEKS as readonly number[]).includes(weeks)
    ? (weeks as SprintDuration)
    : "custom"
}

/** Hoje no relógio local de quem está usando (não UTC). */
export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function formatSprintRange(start: string | null, end: string | null): string {
  if (!start || !end) return ""
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

/** Dias até o fim (0 no próprio dia do fim e depois dele). */
export function daysRemaining(end: string): number {
  return Math.max(0, Math.round((toUTC(end) - toUTC(todayISO())) / DAY_MS))
}
