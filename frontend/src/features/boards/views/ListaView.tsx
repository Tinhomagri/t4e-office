import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import { cx } from "@/shared/ui/primitives"
import type { Card, CardPriority, CardStatus, CardType, Member, Sprint } from "@/features/workspace/workspace.types"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
  briefing: "Briefing", criacao: "Criação", aprovacao: "Aprovação", agendado: "Agendado", publicado: "Publicado",
}
const STATUS_COLOR: Record<CardStatus, string> = {
  backlog: "bg-paper-300 text-paper-600",
  todo: "bg-paper-200 dark:bg-ink-700 text-paper-600",
  doing: "bg-brand-100 text-brand-700",
  review: "bg-warning/15 text-orange-700",
  done: "bg-success/15 text-green-700",
  briefing: "bg-violet-100 text-violet-700",
  criacao: "bg-brand-100 text-brand-700",
  aprovacao: "bg-warning/15 text-orange-700",
  agendado: "bg-cyan-100 text-cyan-700",
  publicado: "bg-success/15 text-green-700",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature", bug: "Bug", debt: "Débito", spike: "Spike", chore: "Tarefa", epic: "Epic",
  post: "Post", peca: "Peça", campanha: "Campanha", artigo: "Artigo", email: "E-mail",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
}
const PRIORITY_DOT: Record<CardPriority, string> = {
  low: "bg-paper-300", medium: "bg-brand-400", high: "bg-warning", urgent: "bg-danger",
}

type SortKey = "ref" | "title" | "status" | "type" | "priority" | "assignee" | "points" | "due_date"
type SortDir = "asc" | "desc"

export function ListaView({
  cards,
  members,
  sprints,
  onOpen,
}: {
  cards: Card[]
  members: Member[]
  sprints: Sprint[]
  onOpen: (c: Card) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "ref", dir: "asc" })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CardStatus | "">("")

  const priorityOrder: Record<CardPriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 }
  const statusOrder: Record<CardStatus, number> = { backlog: 0, todo: 1, doing: 2, review: 3, done: 4, briefing: 5, criacao: 6, aprovacao: 7, agendado: 8, publicado: 9 }

  const sorted = useMemo(() => {
    const filtered = cards.filter((c) => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.ref.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter && c.status !== statusFilter) return false
      return true
    })

    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sort.key) {
        case "ref": cmp = a.number - b.number; break
        case "title": cmp = a.title.localeCompare(b.title); break
        case "status": cmp = statusOrder[a.status] - statusOrder[b.status]; break
        case "type": cmp = a.type.localeCompare(b.type); break
        case "priority": cmp = priorityOrder[a.priority] - priorityOrder[b.priority]; break
        case "assignee": {
          const an = members.find((m) => m.user_id === a.assignee_id)?.name ?? ""
          const bn = members.find((m) => m.user_id === b.assignee_id)?.name ?? ""
          cmp = an.localeCompare(bn)
          break
        }
        case "points": cmp = (a.points ?? -1) - (b.points ?? -1); break
        case "due_date": cmp = (a.due_date ?? "").localeCompare(b.due_date ?? ""); break
      }
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [cards, sort, search, statusFilter, members])

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sort.key !== k) return <ArrowUpDown className="size-3 opacity-30" />
    return sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
  }

  const sprintMap = Object.fromEntries(sprints.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cards..."
          className="h-8 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 text-sm text-ink dark:text-paper placeholder-paper-400 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CardStatus | "")}
          className="h-8 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as CardStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-paper-400">{sorted.length} cards</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-paper-200 dark:border-ink-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900">
              {([
                ["ref", "Ref", "w-24"],
                ["title", "Título", "min-w-[240px]"],
                ["status", "Status", "w-36"],
                ["type", "Tipo", "w-28"],
                ["priority", "Prioridade", "w-28"],
                ["assignee", "Responsável", "w-36"],
                ["points", "Pts", "w-16"],
                ["due_date", "Prazo", "w-28"],
              ] as [SortKey, string, string][]).map(([key, label, cls]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={cx("cursor-pointer select-none px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-paper-500 hover:text-ink dark:hover:text-paper transition-colors", cls)}
                >
                  <span className="flex items-center gap-1">
                    {label} <SortIcon k={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-100 dark:divide-ink-800">
            {sorted.map((card) => {
              const assignee = members.find((m) => m.user_id === card.assignee_id)
              const isOverdue = card.due_date && new Date(card.due_date) < new Date() && card.status !== "done"
              return (
                <tr
                  key={card.id}
                  onClick={() => onOpen(card)}
                  className="cursor-pointer bg-paper dark:bg-ink-900 transition-colors hover:bg-paper-50 dark:hover:bg-ink-900 group"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[11px] text-paper-400">{card.ref}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-ink dark:text-paper group-hover:text-brand-700 transition-colors">{card.title}</span>
                    {card.sprint_id && sprintMap[card.sprint_id] && (
                      <span className="ml-2 text-[10px] text-paper-400">{sprintMap[card.sprint_id]}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLOR[card.status])}>
                      {STATUS_LABEL[card.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-paper-500">{TYPE_LABEL[card.type]}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs text-paper-500">
                      <span className={cx("size-2 rounded-full", PRIORITY_DOT[card.priority])} />
                      {PRIORITY_LABEL[card.priority]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {assignee ? (
                      <span className="flex items-center gap-2 text-xs text-ink dark:text-paper">
                        <InitialsDot name={assignee.name} />
                        {assignee.name.split(" ")[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-paper-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-medium text-center text-ink dark:text-paper">
                    {card.points ?? <span className="text-paper-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {card.due_date ? (
                      <span className={cx("text-xs", isOverdue ? "font-semibold text-danger" : "text-paper-500")}>
                        {fmt(card.due_date)}
                      </span>
                    ) : (
                      <span className="text-xs text-paper-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-sm text-paper-400">
                  Nenhum card encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InitialsDot({ name }: { name: string }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 text-[8px] font-semibold text-paper">
      {init}
    </span>
  )
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
}
