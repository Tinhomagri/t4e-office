// Barra de ações da conversa aberta — o cabeçalho do painel central no
// Chatwoot: responsável, prioridade, etiquetas, silenciar e resolver.
import { useState } from "react"
import { AlertTriangle, Bell, BellOff, Check, Tag, X } from "lucide-react"

import { Badge, Button, Select, cx } from "@/shared/ui/primitives"

import {
  contactDisplayName,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
} from "./inbox.shared"
import type { Agent, Conversation, ConversationPriority, Label, Team } from "./inbox.types"

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
  const [labelsOpen, setLabelsOpen] = useState(false)
  const resolved = conversation.status === "resolved"

  function toggleLabel(title: string) {
    const next = conversation.labels.includes(title)
      ? conversation.labels.filter((l) => l !== title)
      : [...conversation.labels, title]
    onLabels(next)
  }

  return (
    <header className="border-b border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink dark:text-paper">
            {contactDisplayName(conversation)}
          </h2>
          <p className="flex items-center gap-1.5 text-[11px] text-paper-500">
            <span>#{conversation.id}</span>
            <Badge tone={STATUS_TONE[conversation.status]}>
              {STATUS_LABELS[conversation.status]}
            </Badge>
            {conversation.priority && (
              <Badge tone={conversation.priority === "urgent" ? "danger" : "warning"}>
                <AlertTriangle className="size-2.5" />
                {PRIORITY_LABELS[conversation.priority]}
              </Badge>
            )}
          </p>
        </div>

        {/* Responsável: agentes e times na mesma lista, como no Chatwoot */}
        <Select
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
          className="h-8 w-[170px] text-[12px]"
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
        </Select>

        <Select
          value={conversation.priority ?? ""}
          onChange={(e) =>
            onPriority((e.target.value as ConversationPriority) || null)
          }
          aria-label="Prioridade"
          className="h-8 w-[120px] text-[12px]"
        >
          <option value="">Prioridade</option>
          {(Object.keys(PRIORITY_LABELS) as ConversationPriority[]).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </Select>

        <Button
          variant="ghost"
          size="sm"
          icon={<Tag className="size-3.5" />}
          onClick={() => setLabelsOpen((open) => !open)}
          aria-expanded={labelsOpen}
        >
          Etiquetas
        </Button>

        <Button
          variant="ghost"
          size="sm"
          aria-label={conversation.muted ? "Reativar notificações" : "Silenciar conversa"}
          icon={
            conversation.muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />
          }
          onClick={() => onMute(!conversation.muted)}
        />

        <Button
          variant={resolved ? "outline" : "primary"}
          size="sm"
          loading={busy}
          icon={resolved ? <X className="size-3.5" /> : <Check className="size-3.5" />}
          onClick={() => onStatus(resolved ? "open" : "resolved")}
        >
          {resolved ? "Reabrir" : "Resolver"}
        </Button>
      </div>

      {/* Etiquetas aplicadas + seletor */}
      {(conversation.labels.length > 0 || labelsOpen) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-paper-200 px-4 py-2 dark:border-ink-800">
          {conversation.labels.map((title) => {
            const known = labels.find((l) => l.title === title)
            return (
              <button
                key={title}
                type="button"
                onClick={() => toggleLabel(title)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 focus-ring"
                style={
                  known
                    ? { backgroundColor: `${known.color}1a`, color: known.color }
                    : undefined
                }
                aria-label={`Remover etiqueta ${title}`}
              >
                {title}
                <X className="size-2.5" />
              </button>
            )
          })}

          {labelsOpen &&
            labels
              .filter((label) => !conversation.labels.includes(label.title))
              .map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.title)}
                  className={cx(
                    "rounded-md border border-dashed px-2 py-0.5 text-[11px] font-medium transition-colors duration-150 focus-ring",
                    "border-paper-300 text-paper-600 hover:bg-paper-100 dark:border-ink-700 dark:hover:bg-ink-800",
                  )}
                >
                  + {label.title}
                </button>
              ))}
        </div>
      )}
    </header>
  )
}
