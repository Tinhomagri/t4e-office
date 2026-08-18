import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import { cx } from "@/shared/ui/primitives"
import { SelectMenu, type SelectOption } from "@/shared/ui/SelectMenu"
import { ColoredAvatar } from "../board.shared"
import { useUpdateCard } from "@/features/workspace/workspace.hooks"
import type { Card, CardPriority, CardStatus, CardType, Member, Sprint } from "@/features/workspace/workspace.types"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
  briefing: "Briefing", criacao: "Criação", aprovacao: "Aprovação", agendado: "Agendado", publicado: "Publicado",
}
// Cada tom tem par claro/escuro: as variantes originais só existiam para o
// tema claro, e no escuro caíam para 1.8:1 de contraste (texto escuro sobre
// fundo escuro). Alvo: >= 4.5:1 nos dois temas.
const STATUS_COLOR: Record<CardStatus, string> = {
  backlog: "bg-paper-200 text-paper-600 dark:bg-ink-700 dark:text-ink-300",
  todo: "bg-paper-200 text-paper-600 dark:bg-ink-700 dark:text-ink-300",
  doing: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200",
  review: "bg-warning/15 text-orange-700 dark:bg-warning/20 dark:text-orange-200",
  done: "bg-success/15 text-green-700 dark:bg-success/20 dark:text-green-200",
  briefing: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  criacao: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200",
  aprovacao: "bg-warning/15 text-orange-700 dark:bg-warning/20 dark:text-orange-200",
  agendado: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200",
  publicado: "bg-success/15 text-green-700 dark:bg-success/20 dark:text-green-200",
}

const STATUS_DOT_COLOR: Record<CardStatus, string> = {
  backlog: "bg-paper-400", todo: "bg-paper-400", doing: "bg-brand-500",
  review: "bg-warning", done: "bg-success", briefing: "bg-violet-500",
  criacao: "bg-brand-500", aprovacao: "bg-warning", agendado: "bg-cyan-500",
  publicado: "bg-success",
}

const TYPE_LABEL: Record<CardType, string> = {
  feature: "História", bug: "Bug", debt: "Débito", spike: "Spike", chore: "Tarefa", epic: "Epic",
  post: "Post", peca: "Peça", campanha: "Campanha", artigo: "Artigo", email: "E-mail",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
}
const PRIORITY_DOT: Record<CardPriority, string> = {
  low: "bg-paper-300", medium: "bg-brand-400", high: "bg-warning", urgent: "bg-danger",
}

type GroupKey = "status" | "assignee" | "priority" | "none"

const GROUP_LABEL: Record<GroupKey, string> = {
  status: "Status",
  assignee: "Responsável",
  priority: "Prioridade",
  none: "Nenhum",
}

type SortKey = "ref" | "title" | "status" | "type" | "priority" | "assignee" | "points" | "due_date"
type SortDir = "asc" | "desc"

export function ListaView({
  cards,
  members,
  sprints,
  projectId,
  onOpen,
}: {
  cards: Card[]
  members: Member[]
  sprints: Sprint[]
  projectId: string
  onOpen: (c: Card) => void
}) {
  const updateCard = useUpdateCard(projectId)
  // Sem movimento quando o sistema pede: as linhas aparecem direto.
  const reduceMotion = useReducedMotion()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "ref", dir: "asc" })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CardStatus | "">("")
  // Agrupamento no padrão ClickUp: seções colapsáveis em vez de uma tabela
  // corrida. "Nenhum" mantém a lista plana de antes.
  const [groupBy, setGroupBy] = useState<GroupKey>("status")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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

  // Grupos preservam a ordem de `sorted` dentro de cada seção. A ordem das
  // seções segue o fluxo do board (backlog → done), não a alfabética, para a
  // lista ler como o quadro deitado.
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", cards: sorted }]

    const buckets = new Map<string, { label: string; cards: Card[] }>()
    const keyOf = (c: Card): { key: string; label: string } => {
      if (groupBy === "status") return { key: c.status, label: STATUS_LABEL[c.status] }
      if (groupBy === "priority") return { key: c.priority, label: PRIORITY_LABEL[c.priority] }
      const person = members.find((m) => m.user_id === c.assignee_id)
      return { key: c.assignee_id ?? "none", label: person?.name ?? "Sem responsável" }
    }
    for (const card of sorted) {
      const { key, label } = keyOf(card)
      const bucket = buckets.get(key)
      if (bucket) bucket.cards.push(card)
      else buckets.set(key, { label, cards: [card] })
    }

    const order =
      groupBy === "status"
        ? (Object.keys(STATUS_LABEL) as string[])
        : groupBy === "priority"
          ? ["urgent", "high", "medium", "low"]
          : []
    const entries = [...buckets.entries()]
    if (order.length) {
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    }
    return entries.map(([key, v]) => ({ key, label: v.label, cards: v.cards }))
  }, [sorted, groupBy, members])

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
        <label className="flex items-center gap-1.5 text-xs text-paper-500">
          Agrupar por
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupKey)}
            className="h-8 rounded-lg border border-paper-200 bg-paper px-2 text-sm text-ink outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-900 dark:text-paper"
          >
            {(Object.keys(GROUP_LABEL) as GroupKey[]).map((g) => (
              <option key={g} value={g}>{GROUP_LABEL[g]}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-paper-400">{sorted.length} cards</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-paper-200 dark:border-ink-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-paper-200 bg-paper-50 dark:border-ink-700 dark:bg-ink-900">
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
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key)
            return (
              <tbody
                key={group.key}
                className="divide-y divide-paper-100 dark:divide-ink-800"
              >
                {groupBy !== "none" && (
                  <tr className="bg-paper-50/80 backdrop-blur-sm dark:bg-ink-800/40">
                    <td colSpan={8} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((cur) => {
                            const next = new Set(cur)
                            if (next.has(group.key)) next.delete(group.key)
                            else next.add(group.key)
                            return next
                          })
                        }
                        className="group/head flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-paper-100 dark:hover:bg-ink-700/60"
                      >
                        <ChevronDown
                          className={cx(
                            "size-3.5 text-paper-400 transition-transform duration-200",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                        {/* Faixa de cor herda o status do grupo — é o que faz a
                            seção ser reconhecida antes de ler o rótulo. */}
                        {groupBy === "status" && (
                          <span
                            className={cx(
                              "h-3.5 w-1 shrink-0 rounded-full",
                              STATUS_DOT_COLOR[group.key as CardStatus] ?? "bg-paper-300",
                            )}
                          />
                        )}
                        <span className="text-[13px] font-semibold tracking-tight text-ink dark:text-ink-200">
                          {group.label}
                        </span>
                        <span className="rounded-full bg-paper-200 px-1.5 py-px text-[10px] font-semibold tabular text-paper-600 dark:bg-ink-700 dark:text-ink-300">
                          {group.cards.length}
                        </span>
                      </button>
                    </td>
                  </tr>
                )}
                <AnimatePresence initial={false}>
                {!isCollapsed &&
                  group.cards.map((card, rowIndex) => {
                    const assignee = members.find((m) => m.user_id === card.assignee_id)
                    const isOverdue =
                      card.due_date &&
                      new Date(card.due_date) < new Date() &&
                      card.status !== "done"
                    return (
                      <motion.tr
                        key={card.id}
                        // opacity/translateY são compositor-only: animar height
                        // forçaria reflow da tabela inteira a cada frame.
                        initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                        transition={{
                          duration: 0.18,
                          ease: [0.16, 1, 0.3, 1],
                          // Cascata curta e teto baixo: em grupo de 50 linhas um
                          // stagger sem limite deixaria a última entrar 1s depois.
                          delay: reduceMotion ? 0 : Math.min(rowIndex, 8) * 0.02,
                        }}
                        onClick={() => onOpen(card)}
                        className="group relative cursor-pointer bg-paper transition-colors hover:bg-paper-50 dark:bg-ink-900 dark:hover:bg-ink-800/60"
                      >
                        <td className="py-3 pl-4 pr-3">
                          <span className="font-mono text-[11px] tabular text-paper-400">{card.ref}</span>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="text-[13px] font-medium text-ink transition-colors group-hover:text-brand-600 dark:text-ink-200 dark:group-hover:text-brand-300">
                            {card.title}
                          </span>
                          {card.sprint_id && sprintMap[card.sprint_id] && (
                            <span className="ml-2 text-[10px] text-paper-400">
                              {sprintMap[card.sprint_id]}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <InlineCell
                            value={card.status}
                            label="Alterar status"
                            options={(Object.keys(STATUS_LABEL) as CardStatus[]).map((v) => ({
                              value: v,
                              label: STATUS_LABEL[v],
                              adornment: (
                                <span className={cx("size-2 shrink-0 rounded-full", STATUS_DOT_COLOR[v])} />
                              ),
                            }))}
                            onChange={(v) => updateCard.mutate({ cardId: card.id, input: { status: v as CardStatus } })}
                          >
                            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLOR[card.status])}>
                              {STATUS_LABEL[card.status]}
                            </span>
                          </InlineCell>
                        </td>
                        <td className="px-3 py-3 text-xs text-paper-600 dark:text-ink-300">{TYPE_LABEL[card.type]}</td>
                        <td className="px-3 py-3">
                          <InlineCell
                            value={card.priority}
                            label="Alterar prioridade"
                            options={(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((v) => ({
                              value: v,
                              label: PRIORITY_LABEL[v],
                              adornment: <span className={cx("size-2 shrink-0 rounded-full", PRIORITY_DOT[v])} />,
                            }))}
                            onChange={(v) => updateCard.mutate({ cardId: card.id, input: { priority: v as CardPriority } })}
                          >
                            <span className="flex items-center gap-1.5 text-xs text-paper-600 dark:text-ink-300">
                              <span className={cx("size-2 rounded-full", PRIORITY_DOT[card.priority])} />
                              {PRIORITY_LABEL[card.priority]}
                            </span>
                          </InlineCell>
                        </td>
                        <td className="px-3 py-3">
                          <InlineCell
                            value={card.assignee_id ?? ""}
                            label="Atribuir responsável"
                            searchable
                            options={[
                              { value: "", label: "Sem responsável" },
                              ...members.map((m) => ({
                                value: m.user_id,
                                label: m.name,
                                adornment: <ColoredAvatar name={m.name} size="xs" />,
                              })),
                            ]}
                            onChange={(v) =>
                              updateCard.mutate({ cardId: card.id, input: { assignee_id: v || null } })
                            }
                          >
                            {assignee ? (
                              <span className="flex items-center gap-2 text-xs text-ink dark:text-ink-200">
                                <ColoredAvatar name={assignee.name} size="xs" />
                                {assignee.name.split(" ")[0]}
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 text-xs text-paper-400">
                                <span className="grid size-5 place-items-center rounded-full border border-dashed border-paper-300 text-[8px] dark:border-ink-600">
                                  +
                                </span>
                                Atribuir
                              </span>
                            )}
                          </InlineCell>
                        </td>
                        <td className="px-3 py-3 text-center text-xs font-medium tabular text-ink dark:text-ink-200">
                          {card.points ?? <span className="text-paper-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {card.due_date ? (
                            <span className={cx("text-xs", isOverdue ? "font-semibold text-danger" : "text-paper-500")}>
                              {fmt(card.due_date)}
                            </span>
                          ) : (
                            <span className="text-xs text-paper-300">—</span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            )
          })}
          {sorted.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-sm text-paper-400">
                  Nenhum card encontrado.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}

/**
 * Célula editável no padrão ClickUp: o valor continua sendo um badge até você
 * clicar. Usa `SelectMenu` em vez de `<select>` nativo — o menu do sistema
 * ignora tokens, tema escuro e não aceita avatar ao lado do item.
 */
function InlineCell({
  value,
  options,
  onChange,
  label,
  searchable,
  children,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  label: string
  searchable?: boolean
  children: React.ReactNode
}) {
  return (
    <SelectMenu
      value={value}
      options={options}
      onChange={onChange}
      label={label}
      searchable={searchable}
    >
      {children}
    </SelectMenu>
  )
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
}
