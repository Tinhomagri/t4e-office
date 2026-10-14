const BUSINESS_DAY_START_HOUR = 9
const BUSINESS_DAY_END_HOUR = 18

/**
 * Minutos "de expediente" entre duas datas: só conta 09h-18h de segunda a
 * sexta — card parado no fim de semana ou de madrugada não deve parecer que
 * o dev trabalhou nesse tempo todo. Anda dia a dia somando só a sobreposição
 * de cada dia útil com a janela [start, end].
 */
export function businessMinutesBetween(start: Date, end: Date): number {
  if (end <= start) return 0
  let total = 0
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  while (cursor < end) {
    const isWeekday = cursor.getDay() >= 1 && cursor.getDay() <= 5
    if (isWeekday) {
      const dayStart = new Date(cursor)
      dayStart.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0)
      const dayEnd = new Date(cursor)
      dayEnd.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0)
      const from = start > dayStart ? start : dayStart
      const to = end < dayEnd ? end : dayEnd
      if (to > from) total += (to.getTime() - from.getTime()) / 60000
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return Math.round(total)
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}min`
  return `${hours}h${mins > 0 ? ` ${mins}min` : ""}`
}

export function formatDoingSince(iso: string): string {
  return formatMinutes(businessMinutesBetween(new Date(iso), new Date()))
}

interface WorkedTime {
  // Trechos já fechados (vem do backend, já em horário comercial).
  worked_seconds?: number | null
  // Início do trecho rodando agora — null quando pausado.
  doing_since?: string | null
}

/** Tempo real trabalhado no card: o acumulado das pausas anteriores + o
 * trecho aberto contado ao vivo. Pausado = só o acumulado, congelado. */
export function workedMinutes({ worked_seconds, doing_since }: WorkedTime): number {
  const closed = Math.round((worked_seconds ?? 0) / 60)
  const open = doing_since ? businessMinutesBetween(new Date(doing_since), new Date()) : 0
  return closed + open
}

export function formatWorkedTime(time: WorkedTime): string {
  return formatMinutes(workedMinutes(time))
}
