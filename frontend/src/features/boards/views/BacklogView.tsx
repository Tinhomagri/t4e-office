import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GripVertical,
  Play,
  Plus,
  Square,
  Zap,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  useCreateSprint,
  useUpdateCard,
  useUpdateSprint,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  Member,
  Sprint,
} from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"

const PRIORITY_DOT: Record<CardPriority, string> = {
  low: "bg-paper-300",
  medium: "bg-brand-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
}
const TYPE_ICON: Record<string, string> = {
  feature: "⚡", bug: "🐛", debt: "💳", spike: "🔬", chore: "🔧", epic: "🏔",
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700", "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700", "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700", "from-cyan-500 to-sky-700",
]
function avatarGradient(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

const BACKLOG_DROP = "backlog"

function loadCapacity(sprintId: string): number | null {
  const v = localStorage.getItem(`pulse_capacity_${sprintId}`)
  return v ? Number(v) : null
}

function sumPoints(cards: Card[]) {
  return cards.reduce((acc, c) => acc + (c.points ?? 0), 0)
}

export function BacklogView({
  projectId,
  cards,
  sprints,
  members,
  onOpen,
}: {
  projectId: string
  cards: Card[]
  sprints: Sprint[]
  members: Member[]
  onOpen: (c: Card) => void
}) {
  const updateCard = useUpdateCard(projectId)
  const updateSprint = useUpdateSprint(projectId)
  const createSprint = useCreateSprint(projectId)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newGoal, setNewGoal] = useState("")

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const openSprints = useMemo(
    () =>
      [...sprints]
        .filter((s) => s.status !== "closed")
        .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0)),
    [sprints],
  )

  const backlogCards = cards.filter((c) => !c.sprint_id)
  const activeCard = cards.find((c) => c.id === activeId) ?? null

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)) }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const target = e.over?.id ? String(e.over.id) : null
    const card = cards.find((c) => c.id === String(e.active.id))
    if (!card || !target) return
    const nextSprintId = target === BACKLOG_DROP ? null : target
    if ((card.sprint_id ?? null) === nextSprintId) return
    updateCard.mutate({ cardId: card.id, input: { sprint_id: nextSprintId } })
  }

  function submitSprint() {
    if (!newName.trim()) return
    createSprint.mutate({ name: newName.trim(), goal: newGoal.trim() }, {
      onSuccess: () => { setNewName(""); setNewGoal(""); setCreating(false) },
    })
  }

  const totalBacklogPts = sumPoints(backlogCards)
  const totalCards = cards.length

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-3 shadow-card">
          <div>
            <h3 className="text-sm font-bold text-ink dark:text-paper">Backlog &amp; Sprints</h3>
            <p className="text-xs text-paper-400">
              {totalCards} cards · {totalBacklogPts} pts no backlog · Arraste para mover entre sprints
            </p>
          </div>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-brand-glow transition-all hover:bg-brand-600 active:scale-95"
          >
            <Plus className="size-4" /> Nova sprint
          </button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 animate-fade-up">
            <p className="mb-3 text-sm font-semibold text-brand-700">Nova sprint</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome (ex.: Sprint 1)"
                onKeyDown={(e) => e.key === "Enter" && submitSprint()}
                className="flex-1 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper placeholder-paper-400 outline-none focus:border-brand-400"
              />
              <input
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Meta (opcional)"
                className="flex-1 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper placeholder-paper-400 outline-none focus:border-brand-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitSprint}
                  disabled={!newName.trim() || createSprint.isPending}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-2 text-sm font-medium text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sprints */}
        {openSprints.map((s) => (
          <SprintSection
            key={s.id}
            sprint={s}
            cards={cards.filter((c) => c.sprint_id === s.id)}
            members={members}
            onOpen={onOpen}
            onStart={() => updateSprint.mutate({ sprintId: s.id, input: { status: "active" } })}
            onClose={() => updateSprint.mutate({ sprintId: s.id, input: { status: "closed" } })}
          />
        ))}

        {/* Backlog */}
        <BacklogSection cards={backlogCards} members={members} onOpen={onOpen} />
      </div>

      <DragOverlay>
        {activeCard ? <CardRow card={activeCard} members={members} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Sprint section ────────────────────────────────────────────────────────────

function SprintSection({
  sprint,
  cards,
  members,
  onOpen,
  onStart,
  onClose,
}: {
  sprint: Sprint
  cards: Card[]
  members: Member[]
  onOpen: (c: Card) => void
  onStart: () => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(true)
  const { setNodeRef, isOver } = useDroppable({ id: sprint.id })
  const total = sumPoints(cards)
  const done = sumPoints(cards.filter((c) => c.status === "done"))
  const doneCount = cards.filter((c) => c.status === "done").length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const capacity = loadCapacity(sprint.id)
  const isActive = sprint.status === "active"

  return (
    <section
      ref={setNodeRef}
      className={cx(
        "overflow-hidden rounded-2xl border-2 bg-paper dark:bg-ink-900 shadow-card transition-all duration-200",
        isActive ? "border-success/30" : "border-paper-200 dark:border-ink-700",
        isOver && "border-brand-400 bg-brand-50/30 scale-[1.005]",
      )}
    >
      {/* Sprint header */}
      <div className={cx(
        "flex flex-wrap items-center gap-3 px-4 py-3",
        isActive ? "bg-success/5 border-b border-success/15" : "border-b border-paper-100 dark:border-ink-800",
      )}>
        <button onClick={() => setOpen((o) => !o)} className="text-paper-400 hover:text-ink dark:hover:text-paper transition-colors">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isActive && <Zap className="size-3.5 text-success shrink-0" />}
            <span className="font-bold text-ink dark:text-paper">{sprint.name}</span>
            <StatusBadge status={sprint.status} />
            <span className="text-xs text-paper-400">{cards.length} cards</span>
          </div>
          {sprint.goal && (
            <p className="mt-0.5 text-xs text-paper-500 italic">"{sprint.goal}"</p>
          )}
        </div>

        {/* Points & progress */}
        <div className="flex items-center gap-3">
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                <div
                  className={cx("h-full rounded-full transition-all", pct === 100 ? "bg-success" : "bg-brand-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-paper-600 tabular">
                {doneCount}/{cards.length}
                <span className="text-paper-400 font-normal"> · {done}/{total}pts</span>
              </span>
            </div>
          )}
          {capacity != null && (
            <span className={cx(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              total > capacity ? "bg-danger/10 text-danger" : "bg-paper-100 dark:bg-ink-800 text-paper-500",
            )}>
              cap {capacity}
            </span>
          )}
          {sprint.status === "planned" && (
            <button
              onClick={onStart}
              className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Play className="size-3.5" /> Iniciar
            </button>
          )}
          {isActive && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-paper-200 dark:border-ink-700 px-3 py-1.5 text-xs font-medium text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
            >
              <CheckCircle2 className="size-3.5" /> Encerrar
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-2">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-2 grid size-10 place-items-center rounded-full bg-paper-100 dark:bg-ink-800">
                <GripVertical className="size-4 text-paper-300" />
              </div>
              <p className="text-sm text-paper-400">Arraste cards do backlog para cá</p>
            </div>
          ) : (
            <div className="space-y-1">
              {cards.map((c) => (
                <CardRow key={c.id} card={c} members={members} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Backlog section ───────────────────────────────────────────────────────────

function BacklogSection({
  cards,
  members,
  onOpen,
}: {
  cards: Card[]
  members: Member[]
  onOpen: (c: Card) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_DROP })
  const [open, setOpen] = useState(true)
  const total = sumPoints(cards)

  return (
    <section
      ref={setNodeRef}
      className={cx(
        "overflow-hidden rounded-2xl border-2 bg-paper dark:bg-ink-900 shadow-card transition-all duration-200",
        isOver ? "border-brand-400 bg-brand-50/30 scale-[1.005]" : "border-dashed border-paper-200 dark:border-ink-700",
      )}
    >
      <div className="flex items-center gap-3 border-b border-paper-100 dark:border-ink-800 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="text-paper-400 hover:text-ink dark:hover:text-paper transition-colors">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <span className="font-bold text-ink dark:text-paper">Backlog</span>
        <span className="text-xs text-paper-400">{cards.length} cards</span>
        {total > 0 && (
          <span className="rounded-full bg-paper-100 dark:bg-ink-800 px-2.5 py-0.5 text-[11px] font-semibold text-paper-600">
            {total} pts
          </span>
        )}
      </div>
      {open && (
        <div className="p-2">
          {cards.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-paper-400">Backlog vazio 🎉</p>
          ) : (
            <div className="space-y-1">
              {cards.map((c) => (
                <CardRow key={c.id} card={c} members={members} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Card row (draggable) ──────────────────────────────────────────────────────

function CardRow({
  card,
  members,
  onOpen,
  overlay = false,
}: {
  card: Card
  members: Member[]
  onOpen?: (c: Card) => void
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  const assignee = members.find((m) => m.user_id === card.assignee_id)
  const isUrgent = card.priority === "urgent"

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={cx(
        "group flex items-center gap-2.5 rounded-xl border bg-paper dark:bg-ink-900 px-3 py-2.5 transition-all",
        overlay ? "shadow-panel rotate-1" : "border-paper-100 dark:border-ink-800 hover:border-paper-300 hover:shadow-card",
        isDragging && "opacity-30",
      )}
    >
      <button
        {...(overlay ? {} : { ...listeners, ...attributes })}
        className="shrink-0 cursor-grab text-paper-200 hover:text-paper-400 active:cursor-grabbing transition-colors"
      >
        <GripVertical className="size-4" />
      </button>

      {/* Type icon */}
      <span className="shrink-0 text-sm" title={card.type}>
        {TYPE_ICON[card.type] ?? "•"}
      </span>

      <span className="shrink-0 font-mono text-[11px] text-paper-400 tabular">{card.ref}</span>

      <button
        onClick={() => onOpen?.(card)}
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink dark:text-paper hover:text-brand-600 transition-colors"
      >
        {card.title}
      </button>

      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600 hidden sm:inline">
          {card.labels[0]}
          {card.labels.length > 1 && ` +${card.labels.length - 1}`}
        </span>
      )}

      {/* Priority */}
      {isUrgent ? (
        <span className="shrink-0 flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
          <span className="size-1.5 rounded-full bg-danger animate-pulse" />
          Urgente
        </span>
      ) : (
        <span
          className={cx("size-2 shrink-0 rounded-full", PRIORITY_DOT[card.priority])}
          title={card.priority}
        />
      )}

      {/* Points */}
      {card.points != null && (
        <span className="shrink-0 grid min-w-[20px] place-items-center rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold text-paper-600 ring-1 ring-paper-200 tabular">
          {card.points}
        </span>
      )}

      {/* Assignee avatar */}
      {assignee ? (
        <span
          title={assignee.name}
          className={cx(
            "shrink-0 grid size-6 place-items-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-white ring-1 ring-inset ring-white/20",
            avatarGradient(assignee.name),
          )}
        >
          {assignee.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
        </span>
      ) : (
        <span className="shrink-0 grid size-6 place-items-center rounded-full border border-dashed border-paper-200 dark:border-ink-700 text-[9px] text-paper-300">?</span>
      )}
    </div>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Sprint["status"] }) {
  const map: Record<Sprint["status"], { label: string; cls: string; icon: React.ReactNode }> = {
    active: { label: "Ativa", cls: "bg-success/10 text-success", icon: <CircleDot className="size-3" /> },
    planned: { label: "Planejada", cls: "bg-paper-100 dark:bg-ink-800 text-paper-500", icon: <Square className="size-3" /> },
    closed: { label: "Encerrada", cls: "bg-paper-100 dark:bg-ink-800 text-paper-400", icon: <CheckCircle2 className="size-3" /> },
  }
  const { label, cls, icon } = map[status]
  return (
    <span className={cx("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {icon} {label}
    </span>
  )
}
