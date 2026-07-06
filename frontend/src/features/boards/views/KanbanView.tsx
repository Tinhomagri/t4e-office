// Quadro Kanban (estilo Jira): colunas por workflow status, swimlanes,
// quick filters salvos, gestão de colunas inline e painel de Insights.
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
  useDndContext,
} from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  ListTree,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Rows3,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button, EmptyState, Field, Input, Modal, cx } from "@/shared/ui/primitives"
import { IssueTypeIcon, PriorityIcon } from "@/shared/ui/issue"
import { JqlSearchBar } from "../JqlSearchBar"
import { useBoardPrefs, colKey, type SwimlaneMode } from "../board.prefs.store"
import {
  ColoredAvatar,
  InitialsDot,
  PRIORITY_BAR,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
  dueState,
  errMsg,
  labelColor,
} from "../board.shared"
import {
  useCards,
  useCreateCard,
  useCreateSavedFilter,
  useCreateSprint,
  useCreateWorkflowStatus,
  useDeleteSavedFilter,
  useDeleteWorkflowStatus,
  useEpics,
  useMembers,
  useProjectPermissions,
  useSprints,
  useUpdateCard,
  useUpdateWorkflowStatus,
  useWorkflowStatuses,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  CardStatus,
  CardType,
  Member,
  Project,
  SavedFilter,
  WorkflowStatus,
} from "@/features/workspace/workspace.types"
import { useSavedFilters } from "@/features/workspace/workspace.hooks"

type Scope = { kind: "backlog" } | { kind: "sprint"; id: string }

interface FilterState {
  types: CardType[]
  priorities: CardPriority[]
  assigneeIds: string[]
}

const EMPTY_FILTER: FilterState = { types: [], priorities: [], assigneeIds: [] }

const SWIMLANE_LABEL: Record<SwimlaneMode, string> = {
  none: "Nenhum",
  epic: "Épico",
  assignee: "Responsável",
  priority: "Prioridade",
}

export function KanbanView({
  project,
  workspaceId,
  onOpen,
  onNewCard,
}: {
  project: Project
  workspaceId: string
  onOpen: (c: Card) => void
  onNewCard: (status: CardStatus, sprintId?: string | null) => void
}) {
  const projectId = project.id
  const qc = useQueryClient()
  const { data: cards } = useCards(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: members } = useMembers(workspaceId)
  const updateCard = useUpdateCard(projectId)

  const [scope, setScope] = useState<Scope>({ kind: "backlog" })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newSprintOpen, setNewSprintOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const { data: workflowStatuses } = useWorkflowStatuses(projectId)
  const createWorkflowStatus = useCreateWorkflowStatus(projectId)
  const deleteWorkflowStatus = useDeleteWorkflowStatus(projectId)
  const updateWorkflowStatus = useUpdateWorkflowStatus(projectId)
  const [manageWorkflowOpen, setManageWorkflowOpen] = useState(false)
  const [jqlResults, setJqlResults] = useState<Card[] | null>(null)
  const [chipJql, setChipJql] = useState<string | null>(null)
  const [currentJql, setCurrentJql] = useState("")
  const [saveFilterOpen, setSaveFilterOpen] = useState(false)

  const swimlane = useBoardPrefs((s) => s.swimlanes[projectId] ?? "none")
  const setSwimlane = useBoardPrefs((s) => s.setSwimlane)

  const columns: WorkflowStatus[] = useMemo(
    () => [...(workflowStatuses ?? [])].sort((a, b) => a.order - b.order),
    [workflowStatuses],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const active = sprints?.find((s) => s.status === "active")
    if (active) setScope({ kind: "sprint", id: active.id })
  }, [sprints])

  const allCards = cards ?? []

  const scopeCards = useMemo(() => {
    if (jqlResults !== null) return jqlResults
    const base = scope.kind === "backlog"
      ? allCards.filter((c) => !c.sprint_id)
      : allCards.filter((c) => c.sprint_id === scope.id)

    return base.filter((c) => {
      if (filters.types.length && !filters.types.includes(c.type)) return false
      if (filters.priorities.length && !filters.priorities.includes(c.priority)) return false
      if (filters.assigneeIds.length && !filters.assigneeIds.includes(c.assignee_id ?? "")) return false
      return true
    })
  }, [allCards, scope, filters, jqlResults])

  const activeCard = scopeCards.find((c) => c.id === activeId) ?? null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? (String(e.over.id) as CardStatus) : null
    const card = scopeCards.find((c) => c.id === String(e.active.id))
    if (!card || !overId || card.status === overId) return
    qc.setQueryData<Card[]>(["cards", projectId], (old) =>
      (old ?? []).map((c) => (c.id === card.id ? { ...c, status: overId } : c)),
    )
    updateCard.mutate({ cardId: card.id, input: { status: overId } })
  }

  const currentSprintId = scope.kind === "sprint" ? scope.id : null
  const activeFiltersCount =
    filters.types.length + filters.priorities.length + filters.assigneeIds.length
  const epicCards = allCards.filter((c) => c.type === "epic")

  const moveColumn = (ws: WorkflowStatus, dir: -1 | 1) => {
    const idx = columns.findIndex((c) => c.id === ws.id)
    const other = columns[idx + dir]
    if (!other) return
    updateWorkflowStatus.mutate({ statusId: ws.id, input: { order: other.order } })
    updateWorkflowStatus.mutate({ statusId: other.id, input: { order: ws.order } })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sprint/backlog bar + filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-3 shadow-card dark:shadow-none">
        {/* Left: scope chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-paper-400 mr-1">Scope</span>
          <ScopeChip
            active={scope.kind === "backlog"}
            onClick={() => setScope({ kind: "backlog" })}
            label="Backlog"
            count={allCards.filter((c) => !c.sprint_id).length}
          />
          {(sprints ?? []).map((s) => (
            <ScopeChip
              key={s.id}
              active={scope.kind === "sprint" && scope.id === s.id}
              onClick={() => setScope({ kind: "sprint", id: s.id })}
              label={s.name}
              dot={s.status === "active"}
              count={allCards.filter((c) => c.sprint_id === s.id).length}
              points={allCards.filter((c) => c.sprint_id === s.id && c.points).reduce((acc, c) => acc + (c.points ?? 0), 0)}
            />
          ))}
          <button
            onClick={() => setNewSprintOpen(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-paper-300 px-3 py-1.5 text-xs font-medium text-paper-500 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            <Plus className="size-3.5" /> Sprint
          </button>
        </div>

        {/* Right: member avatars + filter controls */}
        <div className="flex items-center gap-2">
          {(members ?? []).length > 0 && (
            <div className="flex items-center gap-1 border-r border-paper-200 dark:border-ink-700 pr-2 mr-0.5">
              {(members ?? []).slice(0, 6).map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => {
                    const id = m.user_id
                    setFilters((f) => ({
                      ...f,
                      assigneeIds: f.assigneeIds.includes(id)
                        ? f.assigneeIds.filter((x) => x !== id)
                        : [...f.assigneeIds, id],
                    }))
                  }}
                  title={m.name}
                  className={cx(
                    "rounded-full transition-all",
                    filters.assigneeIds.includes(m.user_id)
                      ? "ring-2 ring-brand-400 ring-offset-1"
                      : "opacity-60 hover:opacity-100",
                  )}
                >
                  <ColoredAvatar name={m.name} size="sm" />
                </button>
              ))}
            </div>
          )}

          {/* Swimlane / agrupar por */}
          <SwimlaneDropdown mode={swimlane} onChange={(m) => setSwimlane(projectId, m)} />

          {/* Filter button */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
              activeFiltersCount > 0
                ? "bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-500/15 dark:border-brand-500/40 dark:text-brand-300"
                : "chip-neutral",
            )}
          >
            <Filter className="size-3.5" />
            Filtrar
            {activeFiltersCount > 0 && (
              <span className="grid size-4 place-items-center rounded-full bg-brand-500 text-[10px] text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Insights */}
          <button
            onClick={() => setInsightsOpen((v) => !v)}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
              insightsOpen
                ? "bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-500/15 dark:border-brand-500/40 dark:text-brand-300"
                : "chip-neutral",
            )}
          >
            <BarChart3 className="size-3.5" /> Insights
          </button>

          {/* Workflow manager */}
          <button
            onClick={() => setManageWorkflowOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-paper-300 px-3 py-1.5 text-xs font-medium text-paper-500 transition-colors hover:border-paper-400 hover:text-ink dark:hover:text-paper"
          >
            <Zap className="size-3.5" /> Workflow
          </button>

          {/* Global create */}
          <button
            onClick={() => onNewCard("todo", currentSprintId)}
            className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            <Plus className="size-3.5" /> Criar
          </button>
        </div>
      </div>

      {/* JQL search + quick filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <JqlSearchBar
          projectId={projectId}
          onResults={setJqlResults}
          externalJql={chipJql}
          onCommittedChange={setCurrentJql}
        />
        <QuickFilterChips
          projectId={projectId}
          activeJql={currentJql}
          onApply={(jql) => setChipJql(jql)}
          onClear={() => setChipJql(null)}
          onSaveCurrent={currentJql ? () => setSaveFilterOpen(true) : undefined}
        />
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <FilterPanel
          filters={filters}
          members={members ?? []}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTER)}
        />
      )}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {/* Board vazio (sem cards no scope atual) */}
          {scopeCards.length === 0 && (
            <EmptyState
              icon={<Layers className="size-6" />}
              title={scope.kind === "sprint" ? "Sprint sem cards" : "Backlog sem cards"}
              description="Crie um card ou arraste cards existentes para cá. Ele aparece em todas as abas do projeto."
              action={
                <Button icon={<Plus className="size-4" />} onClick={() => onNewCard("todo", currentSprintId)}>
                  Criar primeiro card
                </Button>
              }
            />
          )}

          {/* Kanban — full width breakout */}
          <div className="-mx-6 px-6 overflow-x-auto pb-4 scrollbar-slim">
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              {swimlane !== "none" ? (
                <SwimlaneBoard
                  mode={swimlane}
                  epics={epicCards}
                  columns={columns}
                  scopeCards={scopeCards}
                  members={members ?? []}
                  projectId={projectId}
                  sprintId={currentSprintId}
                  onAddDetailed={onNewCard}
                  onOpen={onOpen}
                  onDone={(cardId) => updateCard.mutate({ cardId, input: { status: "done" } })}
                />
              ) : (
                <div className="flex gap-3" style={{ minWidth: `${columns.length * 288}px` }}>
                  {columns.map((ws, i) => (
                    <Column
                      key={ws.slug}
                      status={ws.slug}
                      label={ws.name}
                      color={ws.color}
                      cards={scopeCards.filter((c) => c.status === ws.slug)}
                      members={members ?? []}
                      projectId={projectId}
                      sprintId={currentSprintId}
                      onAddDetailed={() => onNewCard(ws.slug as CardStatus, currentSprintId)}
                      onOpen={onOpen}
                      onDone={(cardId) => updateCard.mutate({ cardId, input: { status: "done" } })}
                      onRename={(name) => updateWorkflowStatus.mutate({ statusId: ws.id, input: { name } })}
                      onMoveLeft={i > 0 ? () => moveColumn(ws, -1) : undefined}
                      onMoveRight={i < columns.length - 1 ? () => moveColumn(ws, 1) : undefined}
                      onRemove={
                        !ws.is_default
                          ? () => deleteWorkflowStatus.mutate(ws.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
              <DragOverlay dropAnimation={null}>
                {activeCard ? <CardCell card={activeCard} members={members ?? []} dragging /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {insightsOpen && (
          <InsightsPanel
            cards={scopeCards}
            columns={columns}
            members={members ?? []}
            onClose={() => setInsightsOpen(false)}
          />
        )}
      </div>

      {/* Modals */}
      <NewSprintModal projectId={projectId} open={newSprintOpen} onClose={() => setNewSprintOpen(false)} />
      <ManageWorkflowModal
        open={manageWorkflowOpen}
        statuses={columns}
        onClose={() => setManageWorkflowOpen(false)}
        onCreate={(input) => createWorkflowStatus.mutateAsync(input)}
        onDelete={(id) => deleteWorkflowStatus.mutate(id)}
      />
      {saveFilterOpen && (
        <SaveFilterModal
          projectId={projectId}
          jql={currentJql}
          onClose={() => setSaveFilterOpen(false)}
        />
      )}
    </div>
  )
}

// ─── swimlane dropdown ────────────────────────────────────────────────────────

function SwimlaneDropdown({ mode, onChange }: { mode: SwimlaneMode; onChange: (m: SwimlaneMode) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
          mode !== "none"
            ? "bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-300"
            : "chip-neutral",
        )}
      >
        <Rows3 className="size-3.5" />
        Agrupar{mode !== "none" ? `: ${SWIMLANE_LABEL[mode]}` : ""}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
            {(Object.keys(SWIMLANE_LABEL) as SwimlaneMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { onChange(m); setOpen(false) }}
                className={cx(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-paper-100 dark:hover:bg-ink-700",
                  m === mode ? "font-semibold text-brand-600" : "text-ink dark:text-paper",
                )}
              >
                {SWIMLANE_LABEL[m]}
                {m === mode && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── quick filter chips ───────────────────────────────────────────────────────

function QuickFilterChips({
  projectId,
  activeJql,
  onApply,
  onClear,
  onSaveCurrent,
}: {
  projectId: string
  activeJql: string
  onApply: (jql: string) => void
  onClear: () => void
  onSaveCurrent?: () => void
}) {
  const { data: saved } = useSavedFilters(projectId)
  const deleteFilter = useDeleteSavedFilter(projectId)

  const builtin: Pick<SavedFilter, "id" | "name" | "jql">[] = [
    { id: "_mine", name: "Só meus", jql: "assignee = me" },
    { id: "_bugs", name: "Bugs", jql: "type = bug" },
  ]

  const chips = [...builtin, ...(saved ?? [])]

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((f) => {
        const active = activeJql === f.jql
        const custom = !f.id.startsWith("_")
        return (
          <span key={f.id} className="group/chip relative">
            <button
              onClick={() => (active ? onClear() : onApply(f.jql))}
              title={f.jql}
              className={cx(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-brand-500 border-brand-500 text-white"
                  : "chip-neutral hover:border-brand-300",
                custom && "pr-6",
              )}
            >
              {f.name}
            </button>
            {custom && (
              <button
                onClick={() => deleteFilter.mutate(f.id)}
                title="Excluir filtro"
                className={cx(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover/chip:block",
                  activeJql === f.jql ? "text-white/70 hover:text-white" : "text-paper-400 hover:text-danger",
                )}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        )
      })}
      {onSaveCurrent && (
        <button
          onClick={onSaveCurrent}
          className="flex items-center gap-1 rounded-full border border-dashed border-paper-300 px-2.5 py-1 text-[11px] font-medium text-paper-500 hover:border-brand-300 hover:text-brand-600"
          title="Salvar a busca atual como quick filter"
        >
          <Bookmark className="size-3" /> Salvar filtro
        </button>
      )}
    </div>
  )
}

function SaveFilterModal({ projectId, jql, onClose }: { projectId: string; jql: string; onClose: () => void }) {
  const createFilter = useCreateSavedFilter(projectId)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await createFilter.mutateAsync({ name: name.trim(), jql })
      onClose()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Salvar quick filter"
      description="O filtro vira um chip visível para todos do projeto."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={createFilter.isPending} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bugs urgentes" autoFocus />
        </Field>
        <p className="rounded-lg bg-paper-100 dark:bg-ink-800 px-3 py-2 font-mono text-xs text-paper-500">{jql}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── filter panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  members,
  onChange,
  onClear,
}: {
  filters: FilterState
  members: Member[]
  onChange: (f: FilterState) => void
  onClear: () => void
}) {
  function toggleType(t: CardType) {
    onChange({
      ...filters,
      types: filters.types.includes(t)
        ? filters.types.filter((x) => x !== t)
        : [...filters.types, t],
    })
  }
  function togglePriority(p: CardPriority) {
    onChange({
      ...filters,
      priorities: filters.priorities.includes(p)
        ? filters.priorities.filter((x) => x !== p)
        : [...filters.priorities, p],
    })
  }
  function toggleAssignee(id: string) {
    onChange({
      ...filters,
      assigneeIds: filters.assigneeIds.includes(id)
        ? filters.assigneeIds.filter((x) => x !== id)
        : [...filters.assigneeIds, id],
    })
  }

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-paper-500">Filtros</span>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-paper-400 hover:text-danger transition-colors">
          <X className="size-3" /> Limpar
        </button>
      </div>
      <div className="flex flex-wrap gap-6">
        {/* Type */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-paper-500">Tipo</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_LABEL) as CardType[]).map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={cx(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filters.types.includes(t)
                    ? TYPE_COLOR[t] + " ring-1 ring-current/30"
                    : "bg-paper-100 text-paper-500 hover:bg-paper-200 dark:bg-ink-800 dark:text-paper-400 dark:hover:bg-ink-700",
                )}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-paper-500">Prioridade</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={cx(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filters.priorities.includes(p)
                    ? "bg-paper-200 text-ink ring-1 ring-paper-400 dark:bg-ink-700 dark:text-paper dark:ring-ink-500"
                    : "bg-paper-100 text-paper-500 hover:bg-paper-200 dark:bg-ink-800 dark:text-paper-400 dark:hover:bg-ink-700",
                )}
              >
                <PriorityIcon priority={p} />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee */}
        {members.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-paper-500">Responsável</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => toggleAssignee(m.user_id)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filters.assigneeIds.includes(m.user_id)
                      ? "bg-ink text-paper"
                      : "bg-paper-100 text-paper-500 hover:bg-paper-200 dark:bg-ink-800 dark:text-paper-400 dark:hover:bg-ink-700",
                  )}
                >
                  <InitialsDot name={m.name} size="xs" />
                  {m.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── swimlane board ───────────────────────────────────────────────────────────

type SwimlaneGroup = { key: string; label: string; color?: string; cards: Card[] }

function SwimlaneBoard({
  mode,
  epics,
  columns,
  scopeCards,
  members,
  projectId,
  sprintId,
  onAddDetailed,
  onOpen,
  onDone,
}: {
  mode: SwimlaneMode
  epics: Card[]
  columns: WorkflowStatus[]
  scopeCards: Card[]
  members: Member[]
  projectId: string
  sprintId: string | null
  onAddDetailed: (s: CardStatus) => void
  onOpen: (c: Card) => void
  onDone?: (cardId: string) => void
}) {
  const nonEpic = scopeCards.filter((c) => c.type !== "epic")

  const groups: SwimlaneGroup[] = useMemo(() => {
    if (mode === "epic") {
      return [
        ...epics.map((e) => ({
          key: e.id,
          label: e.title,
          color: e.epic_color || "#8270DB",
          cards: nonEpic.filter((c) => c.epic_id === e.id),
        })),
        { key: "_none", label: "Sem Epic", cards: nonEpic.filter((c) => !c.epic_id) },
      ]
    }
    if (mode === "assignee") {
      return [
        ...members.map((m) => ({
          key: m.user_id,
          label: m.name,
          cards: nonEpic.filter((c) => c.assignee_id === m.user_id),
        })),
        { key: "_none", label: "Sem responsável", cards: nonEpic.filter((c) => !c.assignee_id) },
      ]
    }
    // priority — da mais urgente para a mais baixa (estilo Jira).
    const order: CardPriority[] = ["urgent", "high", "medium", "low"]
    return order.map((p) => ({
      key: p,
      label: PRIORITY_LABEL[p],
      cards: nonEpic.filter((c) => c.priority === p),
    }))
  }, [mode, epics, members, nonEpic])

  return (
    <div className="flex flex-col gap-6" style={{ minWidth: `${columns.length * 288}px` }}>
      {groups.map((group) => {
        if (group.cards.length === 0) return null
        return (
          <div key={group.key}>
            <div className="mb-3 flex items-center gap-2">
              {group.color ? (
                <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />
              ) : mode === "assignee" && group.key !== "_none" ? (
                <ColoredAvatar name={group.label} size="xs" />
              ) : mode === "priority" ? (
                <PriorityIcon priority={group.key as CardPriority} />
              ) : (
                <Zap className="size-3.5 text-paper-400" />
              )}
              <span className="text-sm font-semibold text-ink dark:text-paper">{group.label}</span>
              <span className="text-xs text-paper-400">({group.cards.length})</span>
            </div>
            <div className="flex gap-3">
              {columns.map((ws) => (
                <Column
                  key={ws.slug}
                  status={ws.slug}
                  label={ws.name}
                  color={ws.color}
                  cards={group.cards.filter((c) => c.status === ws.slug)}
                  members={members}
                  projectId={projectId}
                  sprintId={sprintId}
                  onAddDetailed={() => onAddDetailed(ws.slug as CardStatus)}
                  onOpen={onOpen}
                  onDone={onDone}
                  compact
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── column ──────────────────────────────────────────────────────────────────

function Column({
  status,
  label,
  color,
  cards,
  members,
  projectId,
  sprintId,
  onAddDetailed,
  onOpen,
  onDone,
  onRemove,
  onRename,
  onMoveLeft,
  onMoveRight,
  compact = false,
}: {
  status: string
  label?: string
  color?: string
  cards: Card[]
  members: Member[]
  projectId: string
  sprintId: string | null
  onAddDetailed: () => void
  onOpen: (c: Card) => void
  onDone?: (cardId: string) => void
  onRemove?: () => void
  onRename?: (name: string) => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
  compact?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const totalPoints = cards.reduce((acc, c) => acc + (c.points ?? 0), 0)
  const displayLabel = label ?? (STATUS_LABEL[status as CardStatus] ?? status)
  const displayColor = color ?? "#6b7280"

  const key = colKey(projectId, status)
  const wipLimit = useBoardPrefs((s) => s.wipLimits[key])
  const collapsed = useBoardPrefs((s) => s.collapsed[key] ?? false)
  const toggleCollapse = useBoardPrefs((s) => s.toggleCollapse)
  const setWip = useBoardPrefs((s) => s.setWip)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(displayLabel)
  const overWip = wipLimit != null && cards.length > wipLimit

  // Coluna colapsada: faixa estreita com contador (estilo Jira).
  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 rounded-2xl border-2 border-transparent bg-paper-100/70 dark:bg-ink-900/60 py-3">
        <button
          onClick={() => toggleCollapse(key)}
          className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink"
          title="Expandir coluna"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold bg-paper-200 dark:bg-ink-800 text-paper-600 dark:text-paper-400">
          {cards.length}
        </span>
        <span
          className="mt-1 text-[11px] font-bold uppercase tracking-wider text-paper-500 [writing-mode:vertical-rl]"
          style={{ color: displayColor }}
        >
          {displayLabel}
        </span>
      </div>
    )
  }

  const submitRename = () => {
    const v = renameValue.trim()
    if (v && v !== displayLabel) onRename?.(v)
    setRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={cx(
        "flex w-[272px] shrink-0 flex-col rounded-2xl border-2 transition-all duration-200",
        compact ? "max-h-[300px]" : "max-h-[calc(100vh-22rem)]",
        isOver
          ? "border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 shadow-brand-glow scale-[1.01]"
          : overWip
            ? "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10"
            : "border-transparent bg-paper-100/70 dark:bg-ink-900/60",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => toggleCollapse(key)}
            className="grid size-5 shrink-0 place-items-center rounded text-paper-400 hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink"
            title="Recolher coluna"
          >
            <ChevronDown className="size-4" />
          </button>
          <span className="size-2.5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: displayColor }} />
          {renaming ? (
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename()
                if (e.key === "Escape") setRenaming(false)
              }}
              autoFocus
              className="w-28 rounded border border-brand-300 bg-paper dark:bg-ink-900 px-1 py-0.5 text-[12px] font-bold uppercase tracking-wider text-ink dark:text-paper outline-none"
            />
          ) : (
            <span className="truncate text-[12px] font-bold uppercase tracking-wider text-paper-600 dark:text-paper-400">
              {displayLabel}
            </span>
          )}
          <span
            className={cx(
              "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-semibold",
              overWip
                ? "bg-red-100 text-red-700"
                : "bg-paper-200 dark:bg-ink-800 text-paper-600 dark:text-paper-400",
            )}
            title={wipLimit != null ? `${cards.length} de ${wipLimit} (limite WIP)` : undefined}
          >
            {wipLimit != null ? `${cards.length}/${wipLimit}` : cards.length}
          </span>
          {totalPoints > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-paper-400 tabular">{totalPoints}pts</span>
          )}
        </div>
        <div className="relative flex items-center gap-0.5">
          <button
            onClick={onAddDetailed}
            className="grid size-6 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
            title="Novo card"
          >
            <Plus className="size-4" />
          </button>
          <button
            onClick={() => setMenu((o) => !o)}
            className="grid size-6 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
            title="Opções da coluna"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
                {onRename && (
                  <ColMenuItem
                    icon={<Pencil className="size-3.5" />}
                    label="Renomear"
                    onClick={() => { setRenameValue(displayLabel); setRenaming(true); setMenu(false) }}
                  />
                )}
                {onMoveLeft && (
                  <ColMenuItem icon={<ArrowLeft className="size-3.5" />} label="Mover para a esquerda" onClick={() => { onMoveLeft(); setMenu(false) }} />
                )}
                {onMoveRight && (
                  <ColMenuItem icon={<ArrowRight className="size-3.5" />} label="Mover para a direita" onClick={() => { onMoveRight(); setMenu(false) }} />
                )}
                <div className="my-1 border-t border-paper-100 dark:border-ink-700" />
                <div className="px-3 py-1.5">
                  <label className="mb-1 block text-[11px] font-medium text-paper-500">Limite WIP</label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={wipLimit ?? ""}
                    placeholder="Sem limite"
                    onChange={(e) =>
                      setWip(key, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-full rounded border border-paper-300 dark:border-ink-600 bg-paper dark:bg-ink-900 px-2 py-1 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
                  />
                </div>
                {onRemove && (
                  <>
                    <div className="my-1 border-t border-paper-100 dark:border-ink-700" />
                    <ColMenuItem
                      icon={<Trash2 className="size-3.5" />}
                      label="Excluir coluna"
                      danger
                      onClick={() => { onRemove(); setMenu(false) }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Drop zone hint */}
      {isOver && (
        <div className="mx-2 mb-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-2 text-center text-xs font-medium text-brand-500">
          Soltar aqui
        </div>
      )}

      {/* Card list */}
      <div className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-slim">
        <AnimatePresence mode="popLayout" initial={false}>
          {cards.map((card) => (
            <DraggableCard key={card.id} card={card} members={members} onOpen={onOpen} onDone={onDone} />
          ))}
        </AnimatePresence>
        {cards.length === 0 && !isOver && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 grid size-10 place-items-center rounded-full bg-paper-200 dark:bg-ink-800">
              <Plus className="size-4 text-paper-400" />
            </div>
            <p className="text-xs text-paper-400">Nenhum card</p>
          </div>
        )}
      </div>

      {/* Quick-add */}
      <div className="p-2 pt-0">
        <QuickAdd projectId={projectId} status={status} sprintId={sprintId} />
      </div>
    </div>
  )
}

function ColMenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-700",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── insights panel ───────────────────────────────────────────────────────────

function InsightsPanel({
  cards,
  columns,
  members,
  onClose,
}: {
  cards: Card[]
  columns: WorkflowStatus[]
  members: Member[]
  onClose: () => void
}) {
  const nonEpic = cards.filter((c) => c.type !== "epic")
  const catOf = (status: string) => columns.find((ws) => ws.slug === status)?.category ?? "todo"

  const pts = (list: Card[]) => list.reduce((acc, c) => acc + (c.points ?? 0), 0)
  const done = nonEpic.filter((c) => catOf(c.status) === "done")
  const doing = nonEpic.filter((c) => catOf(c.status) === "in_progress")
  const todo = nonEpic.filter((c) => catOf(c.status) === "todo")
  const totalPts = pts(nonEpic)
  const pct = (v: number) => (totalPts > 0 ? Math.round((v / totalPts) * 100) : 0)

  const overdue = nonEpic.filter((c) => catOf(c.status) !== "done" && dueState(c.due_date)?.overdue)

  const byAssignee = members
    .map((m) => ({
      name: m.name,
      count: nonEpic.filter((c) => c.assignee_id === m.user_id && catOf(c.status) !== "done").length,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
  const unassigned = nonEpic.filter((c) => !c.assignee_id && catOf(c.status) !== "done").length
  const maxAssignee = Math.max(1, ...byAssignee.map((x) => x.count), unassigned)

  return (
    <aside className="w-72 shrink-0 rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-4 shadow-card dark:shadow-none">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-paper">
          <BarChart3 className="size-4 text-brand-500" /> Insights
        </span>
        <button onClick={onClose} className="text-paper-400 hover:text-ink dark:hover:text-paper">
          <X className="size-4" />
        </button>
      </div>

      {/* Progresso em pontos */}
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-paper-400">Progresso (pontos)</p>
      {totalPts > 0 ? (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
            <span className="bg-success" style={{ width: `${pct(pts(done))}%` }} />
            <span className="bg-brand-400" style={{ width: `${pct(pts(doing))}%` }} />
            <span className="bg-paper-300 dark:bg-ink-600" style={{ width: `${pct(pts(todo))}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-paper-500">
            <span>✓ {pts(done)} feito</span>
            <span>{pts(doing)} andamento</span>
            <span>{pts(todo)} a fazer</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-paper-400">Sem cards pontuados no scope.</p>
      )}

      {/* Atrasados */}
      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-paper-400">
        Atrasados ({overdue.length})
      </p>
      {overdue.length === 0 ? (
        <p className="text-xs text-paper-400">Nenhum card vencido. 🎉</p>
      ) : (
        <ul className="space-y-1">
          {overdue.slice(0, 5).map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-xs text-ink dark:text-paper">
              <span className="size-1.5 shrink-0 rounded-full bg-danger" />
              <span className="font-mono text-[10px] text-paper-400">{c.ref}</span>
              <span className="truncate">{c.title}</span>
            </li>
          ))}
          {overdue.length > 5 && (
            <li className="text-[10px] text-paper-400">+{overdue.length - 5} outros</li>
          )}
        </ul>
      )}

      {/* Carga por responsável */}
      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-paper-400">
        Cards abertos por pessoa
      </p>
      <ul className="space-y-1.5">
        {byAssignee.map((x) => (
          <li key={x.name} className="flex items-center gap-2">
            <span className="w-20 truncate text-[11px] text-paper-500">{x.name.split(" ")[0]}</span>
            <span className="h-2 rounded-full bg-brand-400" style={{ width: `${(x.count / maxAssignee) * 100}%`, minWidth: 8 }} />
            <span className="text-[10px] tabular text-paper-500">{x.count}</span>
          </li>
        ))}
        {unassigned > 0 && (
          <li className="flex items-center gap-2">
            <span className="w-20 truncate text-[11px] text-paper-400">Sem dono</span>
            <span className="h-2 rounded-full bg-paper-300 dark:bg-ink-600" style={{ width: `${(unassigned / maxAssignee) * 100}%`, minWidth: 8 }} />
            <span className="text-[10px] tabular text-paper-500">{unassigned}</span>
          </li>
        )}
        {byAssignee.length === 0 && unassigned === 0 && (
          <p className="text-xs text-paper-400">Nada em aberto.</p>
        )}
      </ul>
    </aside>
  )
}

// ─── quick add ───────────────────────────────────────────────────────────────

function QuickAdd({
  projectId,
  status,
  sprintId,
}: {
  projectId: string
  status: string
  sprintId: string | null
}) {
  const createCard = useCreateCard(projectId)
  const { can } = useProjectPermissions(projectId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")

  // Esconde a criação quando o papel do usuário não permite (Domínio 12).
  if (!can("create_issue")) return null

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setTitle("")
    await createCard.mutateAsync({ title: t, status: status as CardStatus, sprint_id: sprintId })
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-paper-500 transition-colors hover:bg-paper-200/70 hover:text-ink dark:hover:text-paper"
      >
        <Plus className="size-4" /> Criar
      </button>
    )

  return (
    <div className="rounded-xl border border-brand-300 bg-paper dark:bg-ink-900 p-2 shadow-card">
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="O que precisa ser feito?"
        autoFocus
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
          if (e.key === "Escape") {
            setOpen(false)
            setTitle("")
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false)
        }}
        className="w-full resize-none border-0 bg-transparent text-sm text-ink dark:text-paper placeholder-paper-400 outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-paper-400">Enter para criar</span>
        <Button size="sm" onClick={submit} loading={createCard.isPending} disabled={!title.trim()}>
          Criar
        </Button>
      </div>
    </div>
  )
}

// ─── card components ──────────────────────────────────────────────────────────

function DraggableCard({
  card,
  members,
  onOpen,
  onDone,
}: {
  card: Card
  members: Member[]
  onOpen: (c: Card) => void
  onDone?: (cardId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  // Enquanto QUALQUER card está sendo arrastado, desligamos a animação de layout:
  // ela reflui os vizinhos a cada frame do ponteiro (e quando o indicador de drop
  // aparece), o que causava o "tremido". No drop, `active` volta a null e a
  // animação religa, fazendo o card deslizar suavemente para a nova coluna.
  const { active } = useDndContext()
  const dragActive = active != null
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      layout={dragActive ? false : "position"}
      layoutId={card.id}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.6 }}
      onClick={() => onOpen(card)}
      className="cursor-grab active:cursor-grabbing"
    >
      <CardCell card={card} members={members} onDone={onDone} />
    </motion.div>
  )
}

export function CardCell({
  card,
  members,
  dragging = false,
  onDone,
}: {
  card: Card
  members: Member[]
  dragging?: boolean
  onDone?: (cardId: string) => void
}) {
  const assignee = members.find((m) => m.user_id === card.assignee_id)
  const isEpic = card.type === "epic"
  const isDone = card.status === "done"
  const due = dueState(card.due_date)
  const { data: epics } = useEpics(card.epic_id ? card.project_id : null)
  const epic = card.epic_id ? (epics ?? []).find((e) => e.id === card.epic_id) : null
  const nSub = card.subtasks_count ?? 0
  const nComments = card.comments_count ?? 0
  const nFiles = card.attachments_count ?? 0
  const hasMeta = nSub > 0 || nComments > 0 || nFiles > 0 || due != null

  return (
    <div
      className={cx(
        "group relative overflow-hidden rounded-md border bg-paper dark:bg-ink-800 shadow-card dark:shadow-none transition-all duration-150",
        "hover:shadow-panel hover:-translate-y-0.5 hover:border-paper-300 dark:hover:border-ink-600",
        dragging && "rotate-2 shadow-pop scale-105",
        isEpic ? "border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50/60 dark:from-violet-900/20 to-paper dark:to-ink-800" : "border-paper-200 dark:border-ink-700",
        isDone && "opacity-60",
      )}
    >
      {/* Barra de prioridade (cor cheia à esquerda) */}
      <span className={cx("absolute inset-y-0 left-0 w-1", PRIORITY_BAR[card.priority])} />

      <div className="px-3 py-2.5 pl-4">
        {/* Título + checkbox de conclusão */}
        <div className="flex items-start gap-2">
          {onDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onDone(card.id) }}
              className={cx(
                "mt-0.5 shrink-0 flex size-3.5 items-center justify-center rounded border transition-colors",
                isDone
                  ? "border-success bg-success"
                  : "border-paper-300 hover:border-success/60 hover:bg-success/5",
              )}
            >
              {isDone && <Check className="size-2.5 text-white" strokeWidth={3} />}
            </button>
          )}
          <p className={cx(
            "text-[13px] font-medium leading-snug text-ink dark:text-paper line-clamp-2",
            isDone && "line-through text-paper-400",
          )}>
            {card.title}
          </p>
        </div>

        {/* Chip do épico ao qual o card pertence */}
        {epic && (
          <span
            className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: epic.color }}
          >
            {epic.ref}
          </span>
        )}

        {/* Labels coloridas (determinísticas por nome) */}
        {card.labels && card.labels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.labels.slice(0, 3).map((l) => (
              <span
                key={l}
                className={cx("rounded px-1.5 py-0.5 text-[10px] font-medium", labelColor(l))}
              >
                {l}
              </span>
            ))}
            {card.labels.length > 3 && (
              <span className="rounded px-1 py-0.5 text-[10px] font-medium text-paper-400">
                +{card.labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Linha de metadados: prazo + contadores */}
        {hasMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-paper-500">
            {due && (
              <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5", due.tone)}>
                <CalendarDays className="size-3" />
                {due.label}
              </span>
            )}
            {nSub > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular" title="Subtarefas">
                <ListTree className="size-3" />
                {card.subtasks_done ?? 0}/{nSub}
              </span>
            )}
            {nComments > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular" title="Comentários">
                <MessageSquare className="size-3" />
                {nComments}
              </span>
            )}
            {nFiles > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular" title="Anexos">
                <Paperclip className="size-3" />
                {nFiles}
              </span>
            )}
          </div>
        )}

        {/* Rodapé: tipo + chave + prioridade + pontos + responsável */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <IssueTypeIcon type={card.type} />
            <span className="font-mono text-[10px] text-paper-400 tabular">{card.ref}</span>
            <PriorityIcon priority={card.priority} />
            {card.points != null && (
              <span className="grid min-w-[18px] place-items-center rounded-full bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-paper-500 dark:text-paper-400 tabular">
                {card.points}
              </span>
            )}
          </div>
          {assignee ? (
            <ColoredAvatar name={assignee.name} size="xs" />
          ) : (
            <span className="grid size-5 place-items-center rounded-full border border-dashed border-paper-300 text-[9px] text-paper-400">
              ?
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── scope chip ──────────────────────────────────────────────────────────────

function ScopeChip({
  active,
  onClick,
  label,
  dot = false,
  count,
  points,
}: {
  active: boolean
  onClick: () => void
  label: string
  dot?: boolean
  count?: number
  points?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "bg-ink text-paper shadow-sm"
          : "border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-600 hover:bg-paper-100 dark:hover:bg-ink-800 hover:border-paper-300",
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
      {label}
      {count !== undefined && (
        <span className={cx(
          "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold",
          active ? "bg-white/20 text-paper" : "bg-paper-100 dark:bg-ink-800 text-paper-500",
        )}>
          {count}
        </span>
      )}
      {points !== undefined && points > 0 && (
        <span className={cx(
          "text-[10px] font-medium",
          active ? "text-paper/60" : "text-paper-400",
        )}>
          {points}sp
        </span>
      )}
    </button>
  )
}

// ─── modals ───────────────────────────────────────────────────────────────────

function ManageWorkflowModal({
  open,
  statuses,
  onClose,
  onCreate,
  onDelete,
}: {
  open: boolean
  statuses: WorkflowStatus[]
  onClose: () => void
  onCreate: (input: { name: string; category: WorkflowStatus["category"]; color: string }) => Promise<unknown>
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<WorkflowStatus["category"]>("todo")
  const [color, setColor] = useState("#6b7280")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onCreate({ name: name.trim(), category, color })
    setName(""); setSaving(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerenciar workflow"
      description="Configure os status do board deste projeto."
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
    >
      <div className="space-y-3">
        {/* Existing statuses */}
        <ul className="space-y-1.5">
          {statuses.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 px-3 py-2">
              <span className="size-3 rounded-full border border-paper-200 dark:border-ink-700" style={{ backgroundColor: s.color }} />
              <span className="flex-1 text-sm font-medium text-ink dark:text-paper">{s.name}</span>
              <span className="text-[10px] text-paper-400 uppercase tracking-wide">{s.category}</span>
              {!s.is_default && (
                <button onClick={() => onDelete(s.id)} className="text-paper-300 hover:text-danger">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Create new */}
        <div className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-400">Novo status</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Nome do status"
              className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-900 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-9 cursor-pointer rounded-lg border border-paper-300 bg-paper dark:bg-ink-900 p-0.5"
              title="Cor"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WorkflowStatus["category"])}
              className="flex-1 rounded-lg border border-paper-300 bg-paper dark:bg-ink-900 px-2 py-1.5 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
            >
              <option value="todo">A fazer</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluído</option>
            </select>
            <Button size="sm" onClick={save} loading={saving} disabled={!name.trim()}>
              Criar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function NewSprintModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  const createSprint = useCreateSprint(projectId)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await createSprint.mutateAsync({ name, goal })
      setName("")
      setGoal("")
      onClose()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova sprint"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createSprint.isPending} disabled={!name.trim()}>
            Criar sprint
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 1" autoFocus />
        </Field>
        <Field label="Objetivo" hint="Opcional — a meta principal da sprint.">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Entregar o fluxo de login" />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
