// Painel esquerdo: pastas + busca + lista de conversas.
//
// Replica a coluna do Chatwoot: linha compacta com avatar, nome, prévia de uma
// linha, hora relativa e badge de não lidas. O que acrescentamos é a pílula do
// negócio vinculado — esse dado não existe no Chatwoot puro.
//
// Movimento (variante "Chatwoot+"): pill de pasta desliza com layoutId, a lista
// escalona ao trocar de filtro (cortado em STAGGER_CAP itens) e o badge de não
// lidas entra com spring — é o único overshoot da tela, porque é o que precisa
// puxar o olho quando chega mensagem.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Hash, Search, Tag, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cx } from "@/shared/ui/primitives"

import {
  badgePop,
  listContainer,
  listItem,
  respectMotion,
  STAGGER_CAP,
} from "./inbox.motion"
import {
  contactDisplayName,
  conversationPreview,
  initials,
  relativeTime,
  sortConversations,
  STATUS_LABELS,
} from "./inbox.shared"
import type {
  AssigneeFilter,
  Conversation,
  ConversationStatus,
  Inbox,
  InboxCounts,
  Label,
  Team,
} from "./inbox.types"

// Pastas viram <select>: como abas numa coluna de 340px os rótulos truncavam
// ("Não atribuíd…") e a contagem estourava a largura. Aqui cabe o nome inteiro.
const FOLDERS: { id: AssigneeFilter; label: string }[] = [
  { id: "me", label: "Minhas" },
  { id: "assigned", label: "Atribuídas" },
  { id: "unassigned", label: "Não atribuídas" },
  { id: "all", label: "Todas" },
]

const STATUS_TABS: ConversationStatus[] = ["open", "pending", "resolved", "snoozed"]

const CONTROL =
  "h-8 rounded-md border border-cw-border bg-white px-2 text-[12px] text-cw-ink transition-colors duration-100 focus-ring focus:border-cw-500 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"

interface Props {
  conversations: Conversation[]
  counts?: InboxCounts
  inboxes: Inbox[]
  teams: Team[]
  labels: Label[]
  activeId: number | null
  assignee: AssigneeFilter
  status: ConversationStatus
  inboxId?: number
  teamId?: number
  selectedLabels: string[]
  search: string
  loading: boolean
  onSelect: (id: number) => void
  onAssigneeChange: (value: AssigneeFilter) => void
  onStatusChange: (value: ConversationStatus) => void
  onInboxChange: (value: number | undefined) => void
  onTeamChange: (value: number | undefined) => void
  onLabelsChange: (value: string[]) => void
  onSearchChange: (value: string) => void
  /** Foco programático vindo do atalho de busca (⌘F / Ctrl+F). */
  searchRef?: React.RefObject<HTMLInputElement>
}

// Filtro de etiquetas em popover. Inline, a nuvem de chips ocupava metade da
// coluna e não tinha como fechar — aqui o painel some ao clicar fora ou no Esc.
function LabelFilter({
  labels,
  selected,
  onChange,
}: {
  labels: Label[]
  selected: string[]
  onChange: (value: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const toggle = (title: string) =>
    onChange(
      selected.includes(title)
        ? selected.filter((current) => current !== title)
        : [...selected, title],
    )

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Filtrar por etiqueta"
        className={cx(
          "flex h-7 items-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors duration-100 focus-ring",
          selected.length > 0
            ? "bg-cw-500/10 text-cw-600 dark:text-cw-500"
            : "text-cw-muted hover:bg-cw-surface dark:hover:bg-ink-800",
        )}
      >
        <Tag className="size-3.5" />
        {selected.length > 0 && <span className="tabular-nums">{selected.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-cw-border bg-white p-2 shadow-lg dark:border-ink-700 dark:bg-ink-800">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cw-muted">
              Etiquetas
            </span>
            <div className="flex items-center gap-2">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-medium text-cw-muted transition-colors duration-100 hover:text-cw-600"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar etiquetas"
                className="text-cw-muted transition-colors duration-100 hover:text-cw-600"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
            {labels.map((label) => {
              const active = selected.includes(label.title)
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggle(label.title)}
                  aria-pressed={active}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors duration-100 focus-ring",
                    !active && "border-cw-border text-cw-muted hover:bg-cw-surface dark:border-ink-700 dark:hover:bg-ink-700",
                  )}
                  style={
                    active
                      ? {
                          borderColor: label.color,
                          backgroundColor: `${label.color}1f`,
                          color: label.color,
                        }
                      : undefined
                  }
                >
                  <Hash className="size-2.5 shrink-0" />
                  <span className="max-w-[150px] truncate">{label.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function ConversationList({
  conversations,
  counts,
  inboxes,
  teams,
  labels: availableLabels,
  activeId,
  assignee,
  status,
  inboxId,
  teamId,
  selectedLabels,
  search,
  loading,
  onSelect,
  onAssigneeChange,
  onStatusChange,
  onInboxChange,
  onTeamChange,
  onLabelsChange,
  onSearchChange,
  searchRef,
}: Props) {
  const reduced = useReducedMotion()
  // Não lidas primeiro, depois por atividade — a conversa nova não pode sumir
  // no meio da lista.
  const ordered = sortConversations(conversations)

  const folderCount = (id: AssigneeFilter): number | null => {
    if (!counts) return null
    if (id === "me") return counts.mine_count
    if (id === "assigned") return counts.assigned_count
    if (id === "unassigned") return counts.unassigned_count
    return counts.all_count
  }

  return (
    <aside className="flex min-h-0 w-full flex-col border-r border-cw-border bg-white md:w-[340px] md:shrink-0 dark:border-ink-800 dark:bg-ink-900">
      {/* Cabeçalho de filtros: busca primeiro, depois escopo, depois status.
          Tudo num bloco só — antes eram quatro faixas com borda empilhadas, e
          a lista de conversas começava abaixo da dobra. */}
      <div className="space-y-1.5 border-b border-cw-border p-2 dark:border-ink-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-cw-muted" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar nas conversas…"
            aria-label="Buscar nas conversas"
            className="h-8 w-full rounded-md border border-cw-border bg-white pl-8 pr-2 text-[13px] text-cw-ink outline-none transition-colors duration-100 placeholder:text-cw-muted focus-ring focus:border-cw-500 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"
          />
        </div>

        <div className="flex gap-1.5">
          <select
            value={assignee}
            onChange={(e) => onAssigneeChange(e.target.value as AssigneeFilter)}
            aria-label="Filtrar por atribuição"
            className={cx(CONTROL, "min-w-0 flex-1")}
          >
            {FOLDERS.map((folder) => {
              const count = folderCount(folder.id)
              return (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                  {count !== null ? ` (${count})` : ""}
                </option>
              )
            })}
          </select>

          {inboxes.length > 1 && (
            <select
              value={inboxId ?? ""}
              onChange={(e) => onInboxChange(e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Filtrar por caixa de entrada"
              className={cx(CONTROL, "min-w-0 flex-1")}
            >
              <option value="">Todas as caixas</option>
              {inboxes.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.name} · {box.channel_label}
                </option>
              ))}
            </select>
          )}

          {teams.length > 1 && (
            <select
              value={teamId ?? ""}
              onChange={(e) => onTeamChange(e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Filtrar por time"
              className={cx(CONTROL, "min-w-0 flex-1")}
            >
              <option value="">Todos os times</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 gap-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onStatusChange(tab)}
                aria-pressed={status === tab}
                className={cx(
                  "relative min-w-0 rounded px-1.5 py-1 text-[11px] font-medium transition-colors duration-100 focus-ring",
                  status === tab
                    ? "text-white"
                    : "text-cw-muted hover:bg-cw-surface dark:hover:bg-ink-800",
                )}
              >
                {status === tab && (
                  <motion.span
                    layoutId="inbox-status-pill"
                    className="absolute inset-0 rounded bg-cw-500"
                    transition={
                      reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }
                    }
                  />
                )}
                <span className="relative">{STATUS_LABELS[tab]}</span>
              </button>
            ))}
          </div>

          {availableLabels.length > 0 && (
            <LabelFilter
              labels={availableLabels}
              selected={selectedLabels}
              onChange={onLabelsChange}
            />
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && ordered.length === 0 ? (
          <ul className="space-y-px p-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-md bg-cw-surface dark:bg-ink-800" />
            ))}
          </ul>
        ) : ordered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-cw-muted">
            Nenhuma conversa nesta pasta.
          </p>
        ) : (
          <motion.ul
            // A chave remonta a lista quando o filtro muda — é o que dispara a
            // cascata. Sem isso o stagger só rodaria na primeira renderização.
            key={`${assignee}:${status}:${inboxId ?? "all"}:${teamId ?? "all"}:${selectedLabels.join(",") || "all"}`}
            variants={reduced ? undefined : listContainer}
            initial="hidden"
            animate="show"
            // Respiro no fim da lista: sem isso a última conversa encosta na
            // borda inferior e não fica claro que a rolagem acabou.
            className="pb-6"
          >
            {ordered.map((conversation, index) => {
              const name = contactDisplayName(conversation)
              const active = conversation.id === activeId
              const unread = conversation.unread_count > 0
              return (
                <motion.li
                  key={conversation.id}
                  // Só os primeiros itens escalonam: cascatear a lista inteira
                  // faria a última conversa entrar meio segundo depois.
                  variants={
                    reduced || index >= STAGGER_CAP
                      ? undefined
                      : respectMotion(listItem, reduced)
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={active ? "true" : undefined}
                    className={cx(
                      "relative flex w-full gap-2.5 border-b border-cw-border/70 px-3 py-2.5 text-left transition-colors duration-100 focus-ring dark:border-ink-800",
                      active
                        ? "bg-cw-500/[0.08]"
                        : "hover:bg-cw-surface dark:hover:bg-ink-800",
                    )}
                  >
                    {/* Barra de seleção: desliza entre as linhas em vez de
                        aparecer e sumir. */}
                    {active && (
                      <motion.span
                        layoutId="inbox-active-bar"
                        className="absolute inset-y-0 left-0 w-[3px] bg-cw-500"
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 500, damping: 40 }
                        }
                      />
                    )}

                    {conversation.contact?.avatar_url ? (
                      <img
                        src={conversation.contact.avatar_url}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cw-surface text-[12px] font-semibold text-cw-muted dark:bg-ink-700 dark:text-paper-300">
                        {initials(name)}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cx(
                            "truncate text-[13px] text-cw-ink dark:text-paper",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {name}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-cw-muted">
                          {relativeTime(conversation.last_activity_at)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cx(
                            "truncate text-[12px]",
                            unread ? "text-cw-ink dark:text-paper" : "text-cw-muted",
                          )}
                        >
                          {conversation.last_message?.private && "🔒 "}
                          {conversationPreview(conversation)}
                        </span>
                        <AnimatePresence>
                          {unread && (
                            <motion.span
                              key="unread"
                              initial={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={reduced ? { duration: 0.01 } : badgePop}
                              className="grid size-[18px] shrink-0 place-items-center rounded-full bg-cw-500 text-[10px] font-semibold tabular-nums text-white"
                            >
                              {conversation.unread_count}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>

                      {(conversation.labels.length > 0 || conversation.link.deal_id) && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1">
                          {/* O vínculo com o funil vem primeiro: é o dado que o
                              Chatwoot não tem e que o comercial olha antes. */}
                          {conversation.link.deal_id && (
                            <span className="inline-flex max-w-full items-center truncate rounded bg-cw-bubble px-1.5 py-0.5 text-[10px] font-medium text-cw-700">
                              {conversation.link.deal_title || "Negócio"}
                            </span>
                          )}
                          {conversation.labels.slice(0, 2).map((label) => (
                            <span
                              key={label}
                              className="inline-flex items-center rounded bg-cw-surface px-1.5 py-0.5 text-[10px] font-medium text-cw-muted dark:bg-ink-800"
                            >
                              {label}
                            </span>
                          ))}
                          {conversation.labels.length > 2 && (
                            <span className="text-[10px] text-cw-muted">
                              +{conversation.labels.length - 2}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </div>
    </aside>
  )
}
