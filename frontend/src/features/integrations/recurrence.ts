// Monta a linha RRULE (RFC 5545) que o Google Calendar espera — o backend só
// repassa essa string crua, quem decide a regra é o front.
import type { RecurrenceFreq } from "./integrations.types"

const FREQ_MAP: Record<Exclude<RecurrenceFreq, "none">, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
}

export const RECURRENCE_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
  { value: "none", label: "Não repete" },
  { value: "daily", label: "Diariamente" },
  { value: "weekly", label: "Semanalmente" },
  { value: "monthly", label: "Mensalmente" },
]

export function buildRecurrence(freq: RecurrenceFreq, count: number): string[] | null {
  if (freq === "none") return null
  return [`RRULE:FREQ=${FREQ_MAP[freq]};COUNT=${Math.max(1, count)}`]
}
