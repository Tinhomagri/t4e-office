/** Agregações do dashboard do Resumo.
 *
 * Funções puras, fora do JSX: a matemática de um relatório é o que erra em
 * silêncio — um gráfico bonito com soma errada parece certo. Aqui elas têm teste.
 */
import type { Card, CardStatus, CardType, Member } from "@/features/workspace/workspace.types"

const DAY_MS = 24 * 60 * 60 * 1000

/** Fatias de um donut/barra: no máximo `top`, o resto somado em "Outros".
 *
 * A regra dos 6 não é estética: acima disso as fatias viram slivers de 1-2% que
 * ninguém distingue nem no gráfico nem na legenda.
 */
export interface Slice {
  key: string
  label: string
  value: number
}

export function topNSlices(
  counts: { key: string; label: string; value: number }[],
  top = 5,
  otherLabel = "Outros",
): Slice[] {
  const sorted = [...counts].filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= top) return sorted
  const head = sorted.slice(0, top)
  const rest = sorted.slice(top).reduce((sum, c) => sum + c.value, 0)
  // "Outros" só aparece se houver algo nele — um segmento de valor 0 é ruído.
  return rest > 0 ? [...head, { key: "__other__", label: otherLabel, value: rest }] : head
}

export function countBy<K extends string>(
  cards: Card[],
  pick: (c: Card) => K | null,
  label: (k: K) => string,
): { key: string; label: string; value: number }[] {
  const map = new Map<K, number>()
  for (const c of cards) {
    const k = pick(c)
    if (k === null) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([k, value]) => ({ key: k, label: label(k), value }))
}

/** Contagem por responsável, com os sem-dono agrupados explicitamente.
 *
 * "Sem responsável" é informação de gestão, não lacuna de dado — esconder isso
 * escondia justamente a fila que ninguém puxou.
 */
export function byAssignee(cards: Card[], members: Member[], top = 6): Slice[] {
  const name = new Map(members.map((m) => [m.user_id, m.name]))
  const counts = countBy(
    cards,
    (c) => c.assignee_id ?? "__none__",
    (k) => (k === "__none__" ? "Sem responsável" : name.get(k) ?? "Desconhecido"),
  )
  return topNSlices(counts, top)
}

/** O card conta como trabalho entregue?
 *
 * Espelha `_is_delivered` no backend: preferimos o desfecho e caímos no status
 * apenas para cards antigos, que o backfill não alcançou.
 */
export function isDelivered(card: Card): boolean {
  if (card.resolution != null) return card.resolution === "done"
  return card.status === "done" || card.status === "publicado"
}

/** Dia (YYYY-MM-DD) em horário local — chave de agrupamento das séries. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Série empilhada de criação por dia, nos últimos `days` dias.
 *
 * Devolve TODOS os dias do intervalo, inclusive os vazios: pular dia sem card
 * comprime o eixo e faz duas semanas parecerem contíguas.
 */
export function creationTrend(
  cards: Card[],
  seriesKeys: string[],
  seriesOf: (c: Card) => string,
  days = 30,
  today = new Date(),
): Record<string, number | string>[] {
  const start = new Date(today.getTime() - (days - 1) * DAY_MS)
  const buckets = new Map<string, Record<string, number>>()
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    buckets.set(dayKey(d.toISOString()), Object.fromEntries(seriesKeys.map((k) => [k, 0])))
  }
  for (const c of cards) {
    if (!c.created_at) continue
    const bucket = buckets.get(dayKey(c.created_at))
    if (!bucket) continue // fora da janela
    const s = seriesOf(c)
    if (s in bucket) bucket[s] += 1
  }
  return [...buckets.entries()].map(([date, values]) => ({ date, ...values }))
}

/** Série empilhada de conclusão por mês, baseada em `resolved_at`. */
export function completionTrend(
  cards: Card[],
  seriesKeys: string[],
  seriesOf: (c: Card) => string,
  months = 12,
  today = new Date(),
): Record<string, number | string>[] {
  const buckets = new Map<string, Record<string, number>>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    buckets.set(monthKey(d.toISOString()), Object.fromEntries(seriesKeys.map((k) => [k, 0])))
  }
  for (const c of cards) {
    if (!isDelivered(c)) continue
    const when = c.resolved_at ?? c.updated_at
    if (!when) continue
    const bucket = buckets.get(monthKey(when))
    if (!bucket) continue
    const s = seriesOf(c)
    if (s in bucket) bucket[s] += 1
  }
  return [...buckets.entries()].map(([month, values]) => ({ month, ...values }))
}

/** Lead time médio por semana: dias entre criação e resolução.
 *
 * Só cards entregues entram — um card cancelado não tem "tempo de entrega". A
 * média vem acompanhada de `count` para a leitura não confiar num ponto que
 * representa um único card.
 */
export function leadTimeByWeek(
  cards: Card[],
  weeks = 12,
  today = new Date(),
): { week: string; days: number | null; count: number }[] {
  const WEEK_MS = 7 * DAY_MS
  // Semana começa na segunda, como o resto do app.
  const monday = (d: Date) => {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const shift = (copy.getDay() + 6) % 7
    return new Date(copy.getTime() - shift * DAY_MS)
  }
  const thisMonday = monday(today)
  const buckets = new Map<string, number[]>()
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(dayKey(new Date(thisMonday.getTime() - i * WEEK_MS).toISOString()), [])
  }
  for (const c of cards) {
    if (!isDelivered(c) || !c.created_at) continue
    const resolved = c.resolved_at ?? c.updated_at
    if (!resolved) continue
    const key = dayKey(monday(new Date(resolved)).toISOString())
    const bucket = buckets.get(key)
    if (!bucket) continue
    const dias = (new Date(resolved).getTime() - new Date(c.created_at).getTime()) / DAY_MS
    // Guarda contra dado inconsistente (resolvido antes de criado).
    bucket.push(Math.max(0, dias))
  }
  return [...buckets.entries()].map(([week, values]) => ({
    week,
    // `null` (não 0) quando não houve entrega: 0 dia de lead time é uma
    // afirmação — "entregamos no mesmo dia" — e a semana vazia não afirma nada.
    days: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : null,
    count: values.length,
  }))
}

/** Rótulos curtos do eixo: "05/08" para dia, "ago/25" para mês. */
export function shortDay(key: string): string {
  const [, m, d] = key.split("-")
  return `${d}/${m}`
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

export function shortMonth(key: string): string {
  const [y, m] = key.split("-")
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`
}

export type { Card, CardStatus, CardType, Member }
