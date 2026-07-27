// Barra de ações da conversa aberta — o cabeçalho do painel central no
// Chatwoot: responsável, prioridade, etiquetas, silenciar e resolver.
//
// Movimento: chips de etiqueta entram/saem com AnimatePresence (escala 0.9 +
// fade, nunca a 0), gaveta de etiquetas abre com height auto animado. Hover em
// 100ms — a barra fica na tela o tempo todo.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useState } from "react"
import { AlertTriangle, Bell, BellOff, Check, Tag, X } from "lucide-react"

import { cx } from "@/shared/ui/primitives"

import { chipIn, DUR, respectMotion } from "./inbox.motion"
import { contactDisplayName, PRIORITY_LABELS, STATUS_LABELS } from "./inbox.shared"
import type { Agent, Conversation, ConversationPriority, Label, Team } from "./inbox.types"

/** Cores de status no vocabulário do Chatwoot (verde aberto, âmbar pendente). */
const STATUS_CHIP: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  resolved: "bg-cw-surface text-cw-muted dark:bg-ink-800",
  snoozed: "bg-cw-bubble text-cw-700",
}

const CONTROL =
  "h-8 rounded-md border border-cw-border bg-white px-2 text-[12px] text-cw-ink transition-colors duration-100 focus-ring focus:border-cw-500 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"

interface Props {
  conversation: Conversation
  agents: Agent[]
  teams: Team[]
  labels: Label[]
  onAssign: (payload: { assignee_id?: number | null; team_id?: number | null }) => void
  onPriority: (priority: ConversationPriority | null) => void
  onLabels: (labels: string[]) => void
  onStatus: (status: string) => void
  onMute: (muted: boolean) => void
  busy: boolean
}

export function ConversationHeader({
  conversation,
  agents,
  teams,
  labels,
  onAssign,
  onPriority,
  onLabels,
  onStatus,
  onMute,
  busy,
}: Props) {
  const reduced = useReducedMotion()
  const [labelsOpen, setLabelsOpen] = useState(false)
  const resolved = conversation.status === "resolved"

  function toggleLabel(title: string) {
    const next = conversation.labels.includes(title)
      ? conversation.labels.filter((l) => l !== title)
      : [...conversation.labels, title]
    onLabels(next)
  }

  return (
    <header className="border-b border-cw-border bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-cw-ink dark:text-paper">
            {contactDisplayName(conversation)}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-cw-muted">
            <span className="tabular-nums">#{conversation.id}</span>
            <span
              className={cx(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                STATUS_CHIP[conversation.status] ?? STATUS_CHIP.resolved,
              )}
            >
              {STATUS_LABELS[conversation.status]}
            </span>
            <AnimatePresence>
              {conversation.priority && (
                <motion.span
                  key={conversation.priority}
                  variants={respectMotion(chipIn, reduced)}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className={cx(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    conversation.priority === "urgent"
                      ? "bg-red-100 text-red-700"
                      : "bg-orange-100 text-orange-700",
                  )}
                >
                  <AlertTriangle className="size-2.5" />
                  {PRIORITY_LABELS[conversation.priority]}
                </motion.span>
              )}
            </AnimatePresence>
          </p>
        </div>

        {/* Responsável: agentes e times na mesma lista, como no Chatwoot */}
        <select
          value={
            conversation.assignee?.id
              ? `agent:${conversation.assignee.id}`
              : conversation.team?.id
                ? `team:${conversation.team.id}`
                : ""
          }
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":")
            if (!kind) return onAssign({ assignee_id: null })
            if (kind === "agent") return onAssign({ assignee_id: Number(id) })
            return onAssign({ team_id: Number(id) })
          }}
          aria-label="Responsável"
          className={cx(CONTROL, "w-[170px]")}
        >
          <option value="">Sem responsável</option>
          <optgroup label="Agentes">
            {agents.map((agent) => (
              <option key={agent.id} value={`agent:${agent.id}`}>
                {agent.name}
              </option>
            ))}
          </optgroup>
          {teams.length > 0 && (
            <optgroup label="Times">
              {teams.map((team) => (
                <option key={team.id} value={`team:${team.id}`}>
                  {team.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          value={conversation.priority ?? ""}
          onChange={(e) => onPriority((e.target.value as ConversationPriority) || null)}
          aria-label="Prioridade"
          className={cx(CONTROL, "w-[120px]")}
        >
          <option value="">Prioridade</option>
          {(Object.keys(PRIORITY_LABELS) as ConversationPriority[]).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setLabelsOpen((open) => !open)}
          aria-expanded={labelsOpen}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors duration-100 focus-ring",
            labelsOpen
              ? "bg-cw-500/10 text-cw-600 dark:text-cw-500"
              : "text-cw-muted hover:bg-cw-surface dark:hover:bg-ink-800",
          )}
        >
          <Tag className="size-3.5" /> Etiquetas
        </button>

        <button
          type="button"
          onClick={() => onMute(!conversation.muted)}
          aria-label={conversation.muted ? "Reativar notificações" : "Silenciar conversa"}
          className="grid size-8 place-items-center rounded-md text-cw-muted transition-colors duration-100 hover:bg-cw-surface focus-ring dark:hover:bg-ink-800"
        >
          {conversation.muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
        </button>

        <motion.button
          type="button"
          onClick={() => onStatus(resolved ? "open" : "resolved")}
          disabled={busy}
          whileTap={reduced ? undefined : { scale: 0.96 }}
          transition={{ duration: 0.1 }}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors duration-100 disabled:opacity-50 focus-ring",
            resolved
              ? "border border-cw-border text-cw-ink hover:bg-cw-surface dark:border-ink-700 dark:text-paper dark:hover:bg-ink-800"
              : "bg-green-500 text-white hover:bg-green-600",
          )}
        >
          {resolved ? <X className="size-3.5" /> : <Check className="size-3.5" />}
          {resolved ? "Reabrir" : "Resolver"}
        </motion.button>
      </div>

      {/* Etiquetas aplicadas + gaveta de seleção */}
      <AnimatePresence initial={false}>
        {(conversation.labels.length > 0 || labelsOpen) && (
          <motion.div
            key="labels"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DUR.ui, ease: "easeOut" }}
            className="overflow-hidden border-t border-cw-border/70 dark:border-ink-800"
          >
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
              <AnimatePresence initial={false} mode="popLayout">
                {conversation.labels.map((title) => {
                  const known = labels.find((l) => l.title === title)
                  return (
                    <motion.button
                      key={title}
                      layout
                      variants={respectMotion(chipIn, reduced)}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      type="button"
                      onClick={() => toggleLabel(title)}
                      aria-label={`Remover etiqueta ${title}`}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity duration-100 hover:opacity-70 focus-ring"
                      style={
                        known
                          ? { backgroundColor: `${known.color}1f`, color: known.color }
                          : undefined
                      }
                    >
                      {title}
                      <X className="size-2.5" />
                    </motion.button>
                  )
                })}
              </AnimatePresence>

              {labelsOpen &&
                labels
                  .filter((label) => !conversation.labels.includes(label.title))
                  .map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.title)}
                      className="inline-flex items-center gap-1 rounded border border-dashed border-cw-border px-1.5 py-0.5 text-[11px] font-medium text-cw-muted transition-colors duration-100 hover:bg-cw-surface focus-ring dark:border-ink-700 dark:hover:bg-ink-800"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: label.color }}
                        aria-hidden
                      />
                      {label.title}
                    </button>
                  ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
