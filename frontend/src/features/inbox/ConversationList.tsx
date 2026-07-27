// Painel esquerdo: pastas + busca + lista de conversas.
//
// Replica a coluna do Chatwoot: cada linha tem avatar, nome, prévia de uma
// linha, hora relativa e o badge de não lidas. O que a gente acrescenta é a
// pílula do negócio vinculado — no Chatwoot puro esse dado não existe.
import { Inbox as InboxIcon, Search, Users, UserCheck, UserX } from "lucide-react"

import { Badge, cx } from "@/shared/ui/primitives"

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
  InboxCounts,
  Inbox,
} from "./inbox.types"

const FOLDERS: { id: AssigneeFilter; label: string; icon: typeof InboxIcon }[] = [
  { id: "me", label: "Minhas", icon: UserCheck },
  { id: "unassigned", label: "Não atribuídas", icon: UserX },
  { id: "all", label: "Todas", icon: Users },
]

const STATUS_TABS: ConversationStatus[] = ["open", "pending", "resolved"]

interface Props {
  conversations: Conversation[]
  counts?: InboxCounts
  inboxes: Inbox[]
  activeId: number | null
  assignee: AssigneeFilter
  status: ConversationStatus
  inboxId?: number
  search: string
  loading: boolean
  onSelect: (id: number) => void
  onAssigneeChange: (value: AssigneeFilter) => void
  onStatusChange: (value: ConversationStatus) => void
  onInboxChange: (value: number | undefined) => void
  onSearchChange: (value: string) => void
}

export function ConversationList({
  conversations,
  counts,
  inboxes,
  activeId,
  assignee,
  status,
  inboxId,
  search,
  loading,
  onSelect,
  onAssigneeChange,
  onStatusChange,
  onInboxChange,
  onSearchChange,
}: Props) {
  const ordered = sortConversations(conversations)

  const folderCount = (id: AssigneeFilter): number | null => {
    if (!counts) return null
    if (id === "me") return counts.mine_count
    if (id === "unassigned") return counts.unassigned_count
    return counts.all_count
  }

  return (
    <aside className="flex w-full flex-col border-r border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900 md:w-[340px] md:shrink-0">
      {/* Pastas — o "assignee_type" do Chatwoot */}
      <div className="flex gap-1 border-b border-paper-300 p-2 dark:border-ink-800">
        {FOLDERS.map((folder) => {
          const count = folderCount(folder.id)
          const active = assignee === folder.id
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onAssigneeChange(folder.id)}
              aria-pressed={active}
              className={cx(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors duration-150 focus-ring",
                active
                  ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
              )}
            >
              <folder.icon className="size-3.5 shrink-0" />
              <span className="truncate">{folder.label}</span>
              {count !== null && count > 0 && (
                <span className="rounded-full bg-paper-200 px-1.5 text-[10px] tabular-nums dark:bg-ink-700">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Busca + filtro por caixa */}
      <div className="space-y-2 border-b border-paper-300 p-2 dark:border-ink-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-paper-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar nas conversas…"
            aria-label="Buscar nas conversas"
            className="h-8 w-full rounded-lg border border-paper-300 bg-paper pl-8 pr-2 text-[13px] outline-none transition-colors focus-ring dark:border-ink-700 dark:bg-ink-800"
          />
        </div>
        {inboxes.length > 1 && (
          <select
            value={inboxId ?? ""}
            onChange={(e) => onInboxChange(e.target.value ? Number(e.target.value) : undefined)}
            aria-label="Filtrar por caixa de entrada"
            className="h-8 w-full rounded-lg border border-paper-300 bg-paper px-2 text-[13px] focus-ring dark:border-ink-700 dark:bg-ink-800"
          >
            <option value="">Todas as caixas</option>
            {inboxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.name} · {box.channel_label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Abas de status */}
      <div className="flex gap-1 border-b border-paper-300 px-2 py-1.5 dark:border-ink-800">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onStatusChange(tab)}
            aria-pressed={status === tab}
            className={cx(
              "rounded-md px-2 py-1 text-[12px] font-medium transition-colors duration-150 focus-ring",
              status === tab
                ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                : "text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800",
            )}
          >
            {STATUS_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && ordered.length === 0 ? (
          <ul className="space-y-px p-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="h-[74px] animate-pulse rounded-lg bg-paper-100 dark:bg-ink-800" />
            ))}
          </ul>
        ) : ordered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-paper-600">
            Nenhuma conversa nesta pasta.
          </p>
        ) : (
          <ul>
            {ordered.map((conversation) => {
              const name = contactDisplayName(conversation)
              const active = conversation.id === activeId
              const unread = conversation.unread_count > 0
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={active ? "true" : undefined}
                    className={cx(
                      "flex w-full gap-2.5 border-b border-paper-200 px-3 py-2.5 text-left transition-colors duration-150 focus-ring dark:border-ink-800",
                      active
                        ? "bg-brand-500/10"
                        : "hover:bg-paper-100 dark:hover:bg-ink-800",
                    )}
                  >
                    {conversation.contact?.avatar_url ? (
                      <img
                        src={conversation.contact.avatar_url}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-200 text-[12px] font-semibold text-paper-700 dark:bg-ink-700 dark:text-paper-300">
                        {initials(name)}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cx(
                            "truncate text-[13px]",
                            unread
                              ? "font-semibold text-ink dark:text-paper"
                              : "font-medium text-ink dark:text-paper",
                          )}
                        >
                          {name}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-paper-500">
                          {relativeTime(conversation.last_activity_at)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cx(
                            "truncate text-[12px]",
                            unread ? "text-ink dark:text-paper" : "text-paper-600",
                          )}
                        >
                          {conversation.last_message?.private && "🔒 "}
                          {conversationPreview(conversation)}
                        </span>
                        {unread && (
                          <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-brand-500 text-[10px] font-semibold tabular-nums text-white">
                            {conversation.unread_count}
                          </span>
                        )}
                      </span>

                      {(conversation.labels.length > 0 || conversation.link.deal_id) && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1">
                          {/* O vínculo com o funil vem primeiro: é o dado que o
                              Chatwoot não tem e que o comercial olha antes. */}
                          {conversation.link.deal_id && (
                            <Badge tone="brand">
                              {conversation.link.deal_title || "Negócio"}
                            </Badge>
                          )}
                          {conversation.labels.slice(0, 2).map((label) => (
                            <Badge key={label} tone="neutral">
                              {label}
                            </Badge>
                          ))}
                          {conversation.labels.length > 2 && (
                            <span className="text-[10px] text-paper-500">
                              +{conversation.labels.length - 2}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
