import { Calendar, Loader2, MessageSquare, Send, X } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
import {
  useComments,
  useCreateComment,
  useUpdateCard,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  CardStatus,
  CardType,
  Member,
  Sprint,
} from "@/features/workspace/workspace.types"
import { Avatar, Badge, Button, cx } from "@/shared/ui/primitives"
import { RichEditor } from "@/shared/ui/RichEditor"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature",
  bug: "Bug",
  debt: "Débito",
  spike: "Spike",
  chore: "Tarefa",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}
const STATUS_TONE: Record<CardStatus, "neutral" | "brand" | "warning" | "success"> = {
  backlog: "neutral",
  todo: "neutral",
  doing: "brand",
  review: "warning",
  done: "success",
}

// Drawer de detalhe de card estilo Jira: 2 colunas (conteúdo + painel lateral).
export function CardDrawer({
  card,
  projectId,
  sprints,
  members,
  onClose,
}: {
  card: Card | null
  projectId: string
  sprints: Sprint[]
  members: Member[]
  onClose: () => void
}) {
  const updateCard = useUpdateCard(projectId)
  const [draft, setDraft] = useState<Card | null>(card)
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => setDraft(card), [card])

  if (!card || !draft) return null

  const set = <K extends keyof Card>(k: K, v: Card[K]) => setDraft({ ...draft, [k]: v })

  // Salva um campo imediatamente (autosave por campo, como o Jira).
  const persist = async (patch: Partial<Card>) => {
    await updateCard.mutateAsync({ cardId: card.id, input: patch })
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 1500)
  }

  const assignee = members.find((m) => m.user_id === draft.assignee_id)
  const reporter = members.find((m) => m.user_id === draft.reporter_id)

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-0 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-5xl animate-scale-in flex-col overflow-hidden rounded-none border-paper-200 bg-paper shadow-pop sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-paper-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Badge tone="brand">{card.ref}</Badge>
            <Badge tone="outline">{TYPE_LABEL[draft.type]}</Badge>
            {savedHint && <span className="text-xs text-success">salvo ✓</span>}
            {updateCard.isPending && <Loader2 className="size-3.5 animate-spin text-paper-400" />}
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo: 2 colunas */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto scrollbar-slim lg:grid-cols-[1fr_320px]">
          {/* Coluna principal */}
          <div className="min-w-0 space-y-6 p-5">
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              onBlur={() => draft.title !== card.title && persist({ title: draft.title })}
              className="w-full rounded-lg border border-transparent bg-transparent text-xl font-semibold text-ink outline-none transition-colors hover:bg-paper-50 focus:border-brand-300 focus:bg-paper"
            />

            <Section title="Descrição">
              <RichEditor
                value={draft.description}
                onChange={(html) => set("description", html)}
                placeholder="Adicione uma descrição detalhada…"
              />
              {draft.description !== card.description && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => persist({ description: draft.description })} loading={updateCard.isPending}>
                    Salvar descrição
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => set("description", card.description)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </Section>

            <Activity cardId={card.id} />
          </div>

          {/* Painel lateral de detalhes */}
          <aside className="space-y-4 border-t border-paper-200 bg-paper-50 p-5 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-400">
              Detalhes
            </p>

            <DetailSelect
              label="Status"
              value={draft.status}
              onChange={(v) => {
                set("status", v as CardStatus)
                persist({ status: v as CardStatus })
              }}
              options={(["backlog", "todo", "doing", "review", "done"] as CardStatus[]).map((s) => ({
                value: s,
                label: STATUS_LABEL[s],
              }))}
              renderValue={<Badge tone={STATUS_TONE[draft.status]}>{STATUS_LABEL[draft.status]}</Badge>}
            />

            <DetailRow label="Responsável">
              <PersonSelect
                value={draft.assignee_id}
                members={members}
                person={assignee}
                onChange={(v) => {
                  set("assignee_id", v)
                  persist({ assignee_id: v })
                }}
              />
            </DetailRow>

            <DetailRow label="Relator">
              <PersonSelect
                value={draft.reporter_id}
                members={members}
                person={reporter}
                onChange={(v) => {
                  set("reporter_id", v)
                  persist({ reporter_id: v })
                }}
              />
            </DetailRow>

            <DetailSelect
              label="Tipo"
              value={draft.type}
              onChange={(v) => {
                set("type", v as CardType)
                persist({ type: v as CardType })
              }}
              options={(Object.keys(TYPE_LABEL) as CardType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />

            <DetailSelect
              label="Prioridade"
              value={draft.priority}
              onChange={(v) => {
                set("priority", v as CardPriority)
                persist({ priority: v as CardPriority })
              }}
              options={(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            />

            <DetailRow label="Pontos">
              <input
                type="number"
                min={0}
                value={draft.points ?? ""}
                onChange={(e) => set("points", e.target.value === "" ? null : Number(e.target.value))}
                onBlur={() => draft.points !== card.points && persist({ points: draft.points })}
                placeholder="—"
                className="w-full rounded-lg border border-paper-300 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand-400"
              />
            </DetailRow>

            <DetailSelect
              label="Sprint"
              value={draft.sprint_id ?? ""}
              onChange={(v) => {
                set("sprint_id", v || null)
                persist({ sprint_id: v || null })
              }}
              options={[{ value: "", label: "Backlog" }, ...sprints.map((s) => ({ value: s.id, label: s.name }))]}
            />

            <DetailRow label="Início">
              <DateInput
                value={draft.start_date}
                onChange={(v) => {
                  set("start_date", v)
                  persist({ start_date: v })
                }}
              />
            </DetailRow>

            <DetailRow label="Prazo">
              <DateInput
                value={draft.due_date}
                onChange={(v) => {
                  set("due_date", v)
                  persist({ due_date: v })
                }}
              />
            </DetailRow>
          </aside>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atividade / comentários (hit no backend)
// ---------------------------------------------------------------------------
function Activity({ cardId }: { cardId: string }) {
  const user = useAuthStore((s) => s.user)
  const { data: comments, isLoading } = useComments(cardId)
  const createComment = useCreateComment(cardId)
  const [body, setBody] = useState("")

  const submit = async () => {
    const t = body.trim()
    if (!t) return
    setBody("")
    await createComment.mutateAsync(t)
  }

  return (
    <Section title="Atividade">
      <div className="space-y-3">
        {/* Caixa de novo comentário */}
        <div className="flex gap-2.5">
          <Avatar initials={initials(user?.full_name)} size="sm" />
          <div className="min-w-0 flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Adicionar comentário…"
              rows={2}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit()
              }}
              className="w-full resize-y rounded-xl border border-paper-300 bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand-400"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="sm" icon={<Send className="size-3.5" />} onClick={submit} loading={createComment.isPending} disabled={!body.trim()}>
                Comentar
              </Button>
              <span className="text-[11px] text-paper-400">⌘/Ctrl + Enter</span>
            </div>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-paper-400">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : (comments ?? []).length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-sm text-paper-400">
            <MessageSquare className="size-4" /> Nenhum comentário ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {(comments ?? []).map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <Avatar initials={initials(c.author_name)} size="sm" />
                <div className="min-w-0 flex-1 rounded-xl border border-paper-200 bg-paper px-3 py-2">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{c.author_name}</span>
                    <span className="text-[11px] text-paper-400">{fmtDateTime(c.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Auxiliares de UI
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-paper-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function DetailSelect({
  label,
  value,
  onChange,
  options,
  renderValue,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  renderValue?: React.ReactNode
}) {
  return (
    <DetailRow label={label}>
      <div className="relative">
        {renderValue && (
          <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">{renderValue}</div>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cx(
            "w-full cursor-pointer rounded-lg border border-paper-300 bg-paper py-1.5 pr-7 text-sm text-ink outline-none focus:border-brand-400",
            renderValue ? "pl-2.5 text-transparent" : "pl-2.5",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-ink">
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </DetailRow>
  )
}

function PersonSelect({
  value,
  members,
  person,
  onChange,
}: {
  value: string | null
  members: Member[]
  person?: Member
  onChange: (v: string | null) => void
}) {
  return (
    <div className="relative flex items-center gap-2">
      {person ? (
        <Avatar initials={initials(person.name)} size="xs" />
      ) : (
        <span className="grid size-6 place-items-center rounded-full border border-dashed border-paper-300 text-[9px] text-paper-400">
          ?
        </span>
      )}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full cursor-pointer rounded-lg border border-paper-300 bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-400"
      >
        <option value="">Ninguém</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="relative flex items-center">
      <Calendar className="pointer-events-none absolute left-2.5 size-3.5 text-paper-400" />
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-paper-300 bg-paper py-1.5 pl-8 pr-2 text-sm text-ink outline-none focus:border-brand-400"
      />
    </div>
  )
}

function initials(name?: string) {
  if (!name) return "?"
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
