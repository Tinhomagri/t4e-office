// Quadro Kanban (estilo Jira): colunas por workflow status, swimlanes,
// quick filters salvos, gestão de colunas inline e painel de Insights.
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { createPortal } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  Check,
  Clock,
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
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Ref } from "react"
import { Link } from "react-router-dom"

import { Button, EmptyState, Field, Input, Modal, cx } from "@/shared/ui/primitives"
import { cardFade, dragLift, dropFlight, popCheck, settleSpring } from "@/shared/lib/motion"
import { formatDoingSince } from "@/shared/lib/businessTime"
import { IssueTypeIcon, PriorityIcon } from "@/shared/ui/issue"
import { JqlSearchBar } from "../JqlSearchBar"
import { useBoardPrefs, colKey } from "../board.prefs.store"
import type { SwimlaneMode } from "@/features/workspace/workspace.types"
import {
  ColoredAvatar,
  InitialsDot,
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
  useBoardConfig,
  useCreateWorkflowStatus,
  useDeleteSavedFilter,
  useDeleteWorkflowStatus,
  useEpics,
  useMembers,
  useProjectPermissions,
  useReorderWorkflowStatuses,
  useSprints,
  useUpdateBoardConfig,
  useRankCard,
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
const EMPTY_CARDS: Card[] = []

const SWIMLANE_LABEL: Record<SwimlaneMode, string> = {
  none: "Nenhum",
  epic: "Épico",
  assignee: "Responsável",
  priority: "Prioridade",
  subtask: "Subtarefa",
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
  const rankCard = useRankCard(projectId)

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
  const reorderWorkflowStatuses = useReorderWorkflowStatuses(projectId)
  const [jqlResults, setJqlResults] = useState<Card[] | null>(null)
  const [chipJql, setChipJql] = useState<string | null>(null)
  const [currentJql, setCurrentJql] = useState("")
  const [saveFilterOpen, setSaveFilterOpen] = useState(false)

  // Swimlane vem da config do quadro (compartilhada com o time), não mais do
  // localStorage — assim todo mundo vê o board agrupado do mesmo jeito.
  const { data: boardConfig } = useBoardConfig(projectId)
  const updateBoardConfig = useUpdateBoardConfig(projectId)
  const swimlane: SwimlaneMode = boardConfig?.swimlane_mode ?? "none"

  const columns: WorkflowStatus[] = useMemo(
    () => [...(workflowStatuses ?? [])].sort((a, b) => a.order - b.order),
    [workflowStatuses],
  )

  // Coluna "concluído" DESTE board — a flag `is_done` primeiro (configurável
  // por coluna, igual `is_working`), categoria "done" como fallback pra
  // board ainda sem nenhuma marcada (ex.: template de marketing).
  const doneStatus =
    columns.find((c) => c.is_done)?.slug ?? columns.find((c) => c.category === "done")?.slug ?? "done"

  // Identidade estável: iguais em toda coluna, então não quebram o memo do
  // card a cada re-render do board.
  const onDoneCard = useCallback(
    (cardId: string) => updateCard.mutate({ cardId, input: { status: doneStatus as CardStatus } }),
    [updateCard, doneStatus],
  )
  const onAssignCard = useCallback(
    (cardId: string, assigneeId: string | null) =>
      updateCard.mutate({ cardId, input: { assignee_id: assigneeId } }),
    [updateCard],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // O voo do clone é uma animação WAAPI de duração fixa, fora do alcance do
  // framer: sem este guarda ele ignoraria `prefers-reduced-motion`.
  const reduceMotion = useReducedMotion()

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

  // Subtarefa não vira card solto no board — no Jira ela some dentro do card
  // pai (o badge "2/5" já mostra o progresso). Sem isto ela ocupava sua
  // própria coluna, dobrando a contagem visual do que já aparecia no pai.
  // A visão "Agrupar por Subtarefas" é a exceção: o ponto dela é justamente
  // separar item principal de subtarefa, então ali elas continuam visíveis.
  const boardCards = swimlane === "subtask" ? scopeCards : scopeCards.filter((c) => !c.parent_id)

  // Um único agrupamento por status, em vez de um `.filter()` novo (varrendo
  // todos os cards) para cada coluna a cada render — coluna com muitos cards
  // travava o board inteiro.
  const cardsByStatus = useMemo(() => {
    const map = new Map<string, Card[]>()
    for (const c of boardCards) {
      const list = map.get(c.status)
      if (list) list.push(c)
      else map.set(c.status, [c])
    }
    return map
  }, [boardCards])

  const activeCard = scopeCards.find((c) => c.id === activeId) ?? null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  /**
   * Muda a coluna já durante o arrasto, assim que o card entra nela.
   *
   * Sem isto o card só trocaria de coluna ao soltar: enquanto sobrevoa, a
   * coluna de destino não abre espaço e a origem não fecha o buraco — que é
   * exatamente a sensação de "o card não está indo para lugar nenhum".
   */
  const onDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id ? String(e.over.id) : null
    const activeCardId = String(e.active.id)
    if (!overId || overId === activeCardId) return
    // Arrasto de coluna: o reposicionamento visual é do dnd-kit; a gravação
    // acontece no fim, para não disparar um PATCH por pixel percorrido.
    if (activeCardId.startsWith("col:")) return

    const card = scopeCards.find((c) => c.id === activeCardId)
    if (!card) return

    const overCard = scopeCards.find((c) => c.id === overId)
    const destino = (overCard?.status ?? overId) as CardStatus
    if (card.status === destino) return

    // Só o cache: o PATCH sai uma vez, no fim do gesto.
    qc.setQueryData<Card[]>(["cards", projectId], (old) =>
      (old ?? []).map((c) => (c.id === card.id ? { ...c, status: destino } : c)),
    )
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? String(e.over.id) : null
    const activeId = String(e.active.id)

    if (activeId.startsWith("col:")) {
      if (overId?.startsWith("col:")) reorderColumns(activeId, overId)
      return
    }

    const card = scopeCards.find((c) => c.id === activeId)
    if (!card || !overId) return

    const overCard = scopeCards.find((c) => c.id === overId)
    const destino = (overCard?.status ?? overId) as CardStatus

    if (card.status !== destino) {
      qc.setQueryData<Card[]>(["cards", projectId], (old) =>
        (old ?? []).map((c) => (c.id === card.id ? { ...c, status: destino } : c)),
      )
      updateCard.mutate({ cardId: card.id, input: { status: destino } })
    }

    // Soltou no vazio da coluna: mudou de lista, mantém a posição relativa.
    if (!overCard || overCard.id === card.id) return

    // Reposiciona entre os vizinhos do destino; o backend converte o par
    // before/after em Lexorank (mesmo caminho que o Backlog já usa).
    const destinoCards = scopeCards.filter((c) => c.status === destino && c.id !== card.id)
    const alvo = destinoCards.findIndex((c) => c.id === overCard.id)
    if (alvo === -1) return
    const ordenado = [...destinoCards.slice(0, alvo), card, ...destinoCards.slice(alvo)]
    const beforeId = ordenado[alvo - 1]?.id ?? null
    const afterId = ordenado[alvo + 1]?.id ?? null

    // Encaixa o card na posição final já no cache: sem isto ele volta pro
    // lugar antigo assim que solta e só pula pro novo quando o rank volta do
    // servidor — o mesmo pisca-pisca da troca de coluna.
    qc.setQueryData<Card[]>(["cards", projectId], (old) => {
      if (!old) return old
      const resto = old.filter((c) => c.id !== card.id)
      let indice: number
      if (beforeId) {
        indice = resto.findIndex((c) => c.id === beforeId) + 1
      } else if (afterId) {
        indice = resto.findIndex((c) => c.id === afterId)
      } else {
        indice = resto.length
      }
      const novo = [...resto]
      novo.splice(indice, 0, { ...card, status: destino })
      return novo
    })
    rankCard.mutate({
      cardId: card.id,
      beforeId,
      afterId,
    })
  }

  const currentSprintId = scope.kind === "sprint" ? scope.id : null
  const activeFiltersCount =
    filters.types.length + filters.priorities.length + filters.assigneeIds.length
  const epicCards = allCards.filter((c) => c.type === "epic")

  /** Reordena a partir de um arrasto: `col:<id>` sobre `col:<id>`. */
  const reorderColumns = (activeId: string, overId: string) => {
    const de = columns.findIndex((c) => `col:${c.id}` === activeId)
    const para = columns.findIndex((c) => `col:${c.id}` === overId)
    if (de === -1 || para === -1 || de === para) return
    // `order` é reescrito para todas: trocar só o par (como fazem as setas)
    // não resolve quando a coluna anda várias casas de uma vez.
    const nova = arrayMove(columns, de, para).map((c, ordem) => ({ ...c, order: ordem }))
    // Grava no cache já com a ordem final: sem isto a coluna volta pra
    // posição antiga assim que o dnd-kit solta o transform, e só pula pro
    // lugar certo quando a resposta do servidor chega — o pisca-pisca.
    qc.setQueryData<WorkflowStatus[]>(["workflow-statuses", projectId], nova)
    reorderWorkflowStatuses.mutate(nova.map((c) => c.id))
  }

  const moveColumn = (ws: WorkflowStatus, dir: -1 | 1) => {
    const idx = columns.findIndex((c) => c.id === ws.id)
    if (idx + dir < 0 || idx + dir >= columns.length) return
    const nova = arrayMove(columns, idx, idx + dir).map((c, ordem) => ({ ...c, order: ordem }))
    qc.setQueryData<WorkflowStatus[]>(["workflow-statuses", projectId], nova)
    reorderWorkflowStatuses.mutate(nova.map((c) => c.id))
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
                  <ColoredAvatar name={m.name} userId={m.user_id} size="sm" />
                </button>
              ))}
            </div>
          )}

          {/* Swimlane / agrupar por */}
          <SwimlaneDropdown
            mode={swimlane}
            onChange={(m) => updateBoardConfig.mutate({ swimlane_mode: m })}
          />

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

          {/* Menu do board (…): workflow já é gerenciado nas colunas, então só
              tem Configurações — não vale um botão próprio na toolbar. */}
          <BoardMenu projectId={projectId} />

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

          {/* Kanban — full width breakout (alinhado ao padding do main: 4 no mobile, 6 no sm+) */}
          <div className="-mx-4 px-4 overflow-x-auto overscroll-x-contain pb-4 scrollbar-slim sm:-mx-6 sm:px-6">
            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              {swimlane !== "none" ? (
                <SwimlaneBoard
                  mode={swimlane}
                  epics={epicCards}
                  columns={columns}
                  scopeCards={boardCards}
                  members={members ?? []}
                  projectId={projectId}
                  sprintId={currentSprintId}
                  onAddDetailed={onNewCard}
                  onOpen={onOpen}
                  onDone={onDoneCard}
                  onAssign={onAssignCard}
                />
              ) : (
                <div className="flex gap-3" style={{ minWidth: `${(columns.length + 1) * 296}px` }}>
                  {/* Reordenar coluna arrastando. Os ids levam prefixo `col:`
                      porque cards e colunas dividem o mesmo DndContext — sem
                      isso, soltar um card sobre uma coluna viraria reordenação. */}
                  <SortableContext
                    items={columns.map((c) => `col:${c.id}`)}
                    strategy={horizontalListSortingStrategy}
                  >
                  {columns.map((ws, i) => (
                    <Column
                      key={ws.slug}
                      sortableId={`col:${ws.id}`}
                      status={ws.slug}
                      label={ws.name}
                      color={ws.color}
                      cards={cardsByStatus.get(ws.slug) ?? EMPTY_CARDS}
                      members={members ?? []}
                      projectId={projectId}
                      sprintId={currentSprintId}
                      wipLimit={ws.wip_limit}
                      onWipChange={(wip_limit) =>
                        updateWorkflowStatus.mutate({ statusId: ws.id, input: { wip_limit } })
                      }
                      isWorking={ws.is_working}
                      onWorkingChange={(is_working) =>
                        updateWorkflowStatus.mutate({ statusId: ws.id, input: { is_working } })
                      }
                      isDone={ws.is_done}
                      onDoneChange={(is_done) =>
                        updateWorkflowStatus.mutate({ statusId: ws.id, input: { is_done } })
                      }
                      onAddDetailed={() => onNewCard(ws.slug as CardStatus, currentSprintId)}
                      onOpen={onOpen}
                      onDone={onDoneCard}
                      onAssign={onAssignCard}
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
                  </SortableContext>
                  <AddColumn
                    projectId={projectId}
                    onCreate={(name) =>
                      createWorkflowStatus.mutateAsync({ name, category: "todo", color: "#626F86" })
                    }
                  />
                </div>
              )}
              {/* Em portal para o body: o overlay nasce dentro da faixa que
                  rola na horizontal (`overflow-x-auto`), e ali o clone era
                  recortado pela borda do contêiner — parecia que o card
                  passava POR BAIXO da coluna vizinha ao ser arrastado.
                  createPortal muda só o nó no DOM; o contexto do dnd-kit
                  continua valendo. */}
              {createPortal(
              /* `key` e `id` são obrigatórios: o AnimationManager do dnd-kit só
                 segura o clone durante o voo de drop se o filho tiver os dois —
                 sem eles a animação era descartada e o card teleportava. */
              <DragOverlay dropAnimation={reduceMotion ? null : dropFlight} zIndex={60}>
                {activeCard ? (
                  <motion.div
                    key={activeCard.id}
                    id={activeCard.id}
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.02 }}
                    transition={dragLift}
                    className="cursor-grabbing"
                  >
                    <CardCell card={activeCard} members={members ?? []} dragging />
                  </motion.div>
                ) : null}
              </DragOverlay>,
              document.body,
              )}
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

// ─── board menu (…) ───────────────────────────────────────────────────────────

function BoardMenu({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Mais opções do quadro"
        className="grid size-8 place-items-center rounded-full border border-paper-300 text-paper-500 transition-colors hover:border-paper-400 hover:text-ink dark:hover:text-paper"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 py-1 shadow-pop">
            <Link
              to={`/app/boards/${projectId}/settings`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-700"
            >
              <SlidersHorizontal className="size-3.5" />
              Configurações do quadro
            </Link>
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
  onAssign,
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
  onAssign?: (cardId: string, assigneeId: string | null) => void
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
    if (mode === "subtask") {
      // Separa o trabalho que pendura em outro card do trabalho de topo.
      return [
        { key: "_parent", label: "Itens principais", cards: nonEpic.filter((c) => !c.parent_id) },
        { key: "_subtask", label: "Subtarefas", cards: nonEpic.filter((c) => !!c.parent_id) },
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
    <div className="flex flex-col gap-6" style={{ minWidth: `${columns.length * 296}px` }}>
      {groups.map((group) => {
        if (group.cards.length === 0) return null
        return (
          <div key={group.key}>
            <div className="mb-3 flex items-center gap-2">
              {group.color ? (
                <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />
              ) : mode === "assignee" && group.key !== "_none" ? (
                <ColoredAvatar name={group.label} userId={group.key} size="xs" />
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
                  wipLimit={ws.wip_limit}
                  onAddDetailed={() => onAddDetailed(ws.slug as CardStatus)}
                  onOpen={onOpen}
                  onDone={onDone}
                  onAssign={onAssign}
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
  onAssign,
  onRemove,
  onRename,
  onMoveLeft,
  onMoveRight,
  wipLimit,
  onWipChange,
  isWorking = false,
  onWorkingChange,
  isDone = false,
  onDoneChange,
  sortableId,
  compact = false,
}: {
  status: string
  label?: string
  color?: string
  cards: Card[]
  members: Member[]
  projectId: string
  sprintId: string | null
  // Ausentes nas swimlanes, onde o WIP é só exibido e não editável.
  wipLimit?: number | null
  onWipChange?: (limit: number | null) => void
  /** Ausente nas swimlanes, onde a coluna é só exibição. */
  isWorking?: boolean
  onWorkingChange?: (value: boolean) => void
  isDone?: boolean
  onDoneChange?: (value: boolean) => void
  onAddDetailed: () => void
  onOpen: (c: Card) => void
  onDone?: (cardId: string) => void
  onAssign?: (cardId: string, assigneeId: string | null) => void
  onRemove?: () => void
  onRename?: (name: string) => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
  /** Sem id, a coluna não é arrastável (é o caso das swimlanes). */
  sortableId?: string
  compact?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  // A coluna inteira é o alvo de drop dos cards; só o CABEÇALHO arrasta a
  // coluna. Sem essa separação, pegar um card arrastaria a coluna junto.
  const {
    attributes: colAttrs,
    listeners: colListeners,
    setNodeRef: setColRef,
    transform: colTransform,
    transition: colTransition,
    isDragging: colDragging,
  } = useSortable({ id: sortableId ?? `col-inerte-${status}`, disabled: !sortableId })
  const totalPoints = cards.reduce((acc, c) => acc + (c.points ?? 0), 0)
  const displayLabel = label ?? (STATUS_LABEL[status as CardStatus] ?? status)
  const displayColor = color ?? "#626F86"

  // Colapso segue local: é preferência de visualização de cada pessoa, ao
  // contrário do WIP, que é regra do time e vem do WorkflowStatus.
  const key = colKey(projectId, status)
  const collapsed = useBoardPrefs((s) => s.collapsed[key] ?? false)
  const toggleCollapse = useBoardPrefs((s) => s.toggleCollapse)
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
    // Sem `motion` nem `scale` no drop: escalar o painel arrastava junto o header
    // e todos os cards de dentro. A troca de cor/borda abaixo (transição CSS) já
    // diz "solta aqui" sem mover nada — e sai o `will-change` permanente, que
    // mantinha uma camada de composição por coluna sem necessidade.
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(colTransform),
        transition: colTransition,
        // A coluna arrastada sobe e apaga um pouco: sem isso, o vão que abre
        // no destino não se distingue da coluna original.
        opacity: colDragging ? 0.4 : 1,
        zIndex: colDragging ? 30 : undefined,
      }}
      className={cx(
        // 284 = card de 272 + 4px de padding lateral da lista + 2px de borda em cada
        // lado. É o que faz o card bater exatamente com os 272px do Jira.
        "flex w-[284px] shrink-0 flex-col rounded-xl border-2 transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        compact ? "max-h-[300px]" : "max-h-[calc(100vh-22rem)]",
        isOver
          ? "border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 shadow-brand-glow"
          : overWip
            ? "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10"
            // Opaco, não `/60`: com alpha a coluna se misturava à página e o board
            // perdia a leitura de "painel". Um passo acima da página, como no Jira.
            : "border-transparent bg-paper-100/70 dark:bg-ink-900",
      )}
    >
      {/* Header. É por aqui que a coluna é arrastada — a área do corpo continua
          sendo alvo de drop dos cards.

          `setColRef` mora SÓ aqui, não no container inteiro: registrar os dois
          hooks (droppable de card + sortable de coluna) no MESMO nó fazia os
          dois competirem pelo mesmo retângulo na detecção de colisão, e o
          `over` nunca resolvia pro id `col:` — arrastar a coluna simplesmente
          não fazia nada ao soltar. Com o header isolado, cada um disputa só
          a própria área. */}
      <div
        ref={setColRef}
        {...(sortableId ? { ...colAttrs, ...colListeners } : {})}
        className={cx(
          "group/head flex items-center justify-between gap-2 px-3 pt-3 pb-2",
          sortableId && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
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
            // Sem uppercase + bold + tracking: o Jira usa o rótulo em caixa
            // normal, e o peso todo no header competia com o título dos cards.
            <span className="truncate text-sm font-medium leading-5 text-paper-600 dark:text-paper-300">
              {displayLabel}
            </span>
          )}
          <span
            className={cx(
              // 12/16 medium: a contagem do header de coluna do Jira.
              "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-medium leading-4",
              // Fora do estouro de WIP a contagem é texto solto, sem pílula: no
              // Jira ela é informação de apoio, não um badge disputando atenção.
              overWip
                ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                : "text-paper-400",
            )}
            title={wipLimit != null ? `${cards.length} de ${wipLimit} (limite WIP)` : undefined}
          >
            {wipLimit != null ? `${cards.length}/${wipLimit}` : cards.length}
          </span>
          {totalPoints > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-paper-400 tabular">peso {totalPoints}</span>
          )}
        </div>
        {/* Ações só no hover/foco da coluna (como no Jira): dois ícones fixos por
            coluna somavam mais controles que conteúdo num board com 5 colunas.
            `focus-visible:opacity-100` mantém o acesso por teclado. */}
        <div
          className={cx(
            "relative flex items-center gap-0.5 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100",
            // Com o menu aberto tem de continuar visível: o dropdown é filho
            // deste wrapper e sairia da tela junto ao tirar o mouse.
            menu ? "opacity-100" : "opacity-0",
          )}
        >
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
                {onWorkingChange && (
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-paper-100 dark:hover:bg-ink-700">
                    <input
                      type="checkbox"
                      checked={isWorking}
                      onChange={(e) => onWorkingChange(e.target.checked)}
                      className="mt-0.5 size-3.5 accent-brand-500"
                    />
                    <span className="text-[12px] leading-tight text-ink dark:text-paper">
                      Card aqui = em andamento
                      <span className="mt-0.5 block text-[11px] text-paper-500">
                        Senta seu boneco na mesa do Escritório e conta o tempo.
                      </span>
                    </span>
                  </label>
                )}
                {onDoneChange && (
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-paper-100 dark:hover:bg-ink-700">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={(e) => onDoneChange(e.target.checked)}
                      className="mt-0.5 size-3.5 accent-brand-500"
                    />
                    <span className="text-[12px] leading-tight text-ink dark:text-paper">
                      Card aqui = concluído
                      <span className="mt-0.5 block text-[11px] text-paper-500">
                        É pra onde o atalho de concluir card manda.
                      </span>
                    </span>
                  </label>
                )}
                <div className="my-1 border-t border-paper-100 dark:border-ink-700" />
                <div className="px-3 py-1.5">
                  <label className="mb-1 block text-[11px] font-medium text-paper-500">Limite WIP</label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={wipLimit ?? ""}
                    placeholder="Sem limite"
                    disabled={!onWipChange}
                    // Grava no blur, não a cada tecla: cada mudança é um PATCH.
                    onBlur={(e) =>
                      onWipChange?.(e.target.value === "" ? null : Number(e.target.value))
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

      {/* Card list */}
      {/* gap 4px e padding 1px/4px — o scroll-container do Jira. */}
      <div className="flex min-h-[60px] flex-1 flex-col gap-1 overflow-y-auto px-1 py-px scrollbar-slim">
        {/* Um contexto por coluna: é ele que dá aos cards a noção de vizinho e
            produz o vão abrindo na posição de destino. */}
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {cards.map((card) => (
              <DraggableCard
                key={card.id}
                card={card}
                members={members}
                onOpen={onOpen}
                onDone={onDone}
                onAssign={onAssign}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
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

// Coluna-fantasma no fim do board, como o "+" do Jira. Criar status vivia só
// dentro do modal "Workflow" — quem queria mais uma coluna não tinha nenhuma
// pista disso olhando para o board.
function AddColumn({
  projectId,
  onCreate,
}: {
  projectId: string
  onCreate: (name: string) => Promise<unknown>
}) {
  const { can } = useProjectPermissions(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sem permissão de workflow o botão não existe — melhor do que oferecer e
  // devolver 403 no clique.
  if (!can("manage_workflow")) return null

  const submit = async () => {
    const v = name.trim()
    if (!v) return
    setSaving(true)
    setError(null)
    try {
      await onCreate(v)
      setName("")
      setOpen(false)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        title="Criar coluna"
        className="flex h-11 w-[284px] shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-paper-300 text-sm font-medium text-paper-500 transition-colors hover:border-brand-300 hover:text-brand-600 dark:border-ink-700 dark:hover:border-brand-500/50"
      >
        <Plus className="size-4" /> Criar coluna
      </button>
    )

  return (
    <div className="flex w-[284px] shrink-0 flex-col gap-2 rounded-xl border-2 border-brand-300 bg-paper p-2 dark:bg-ink-900">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") {
            setOpen(false)
            setName("")
          }
        }}
        placeholder="Nome da coluna"
        autoFocus
        className="w-full rounded-lg border border-paper-300 bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-400 dark:border-ink-600 dark:bg-ink-900 dark:text-paper"
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setName("")
          }}
        >
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} loading={saving} disabled={!name.trim()}>
          Criar
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
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

      {/* Progresso em peso */}
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-paper-400">Progresso (peso)</p>
      {totalPts > 0 ? (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
            <span className="bg-success" style={{ width: `${pct(pts(done))}%` }} />
            <span className="bg-brand-400" style={{ width: `${pct(pts(doing))}%` }} />
            <span className="bg-paper-300 dark:bg-ink-600" style={{ width: `${pct(pts(todo))}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-paper-500">
            <span>✓ {pts(done)} feito</span>
            <span>{pts(doing)} em andamento</span>
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

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node)
      else if (ref && typeof ref === "object") (ref as { current: T }).current = node
    }
  }
}

const DraggableCard = memo(forwardRef<HTMLDivElement, {
  card: Card
  members: Member[]
  onOpen: (c: Card) => void
  onDone?: (cardId: string) => void
  onAssign?: (cardId: string, assigneeId: string | null) => void
}>(function DraggableCard({ card, members, onOpen, onDone, onAssign }, forwardedRef) {
  // useSortable, não useDraggable: além de arrastar, registra o card como ALVO
  // de drop. É o que permite soltar ENTRE dois cards — e o que faz os vizinhos
  // abrirem espaço enquanto o card sobrevoa, em vez de a coluna ficar parada
  // até o drop.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
  // Criado nos últimos segundos = apareceu agora, merece entrada animada.
  const recemCriado =
    !!card.created_at && Date.now() - new Date(card.created_at).getTime() < 5000
  return (
    // Duas camadas de propósito. A de fora é do dnd-kit: só ela escreve
    // `transform`, que é o deslocamento abrindo espaço para o card em voo. A de
    // dentro é do framer-motion, cuidando apenas de opacidade na entrada e
    // saída. Já houve tremor neste arquivo por três donos disputarem o mesmo
    // transform; manter um dono por elemento é o que evita a repetição.
    <div
      ref={mergeRefs<HTMLDivElement>(setNodeRef, forwardedRef)}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={() => onOpen(card)}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
    <motion.div
      // Só card RECÉM-CRIADO entra com fade. Mudar de coluna desmonta o card
      // de uma lista e monta na outra: com fade dos dois lados, o movimento
      // aparecia como o texto piscando no destino. O deslocamento em si já é
      // contado pelo clone que voa no DragOverlay.
      initial={recemCriado ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={cardFade}
    >
      {/* Slot fantasma: o card sai de cena e fica o buraco do tamanho exato,
          então a coluna não reflui durante o arrasto. `visibility` (e não
          `display`) preserva a altura, e o clone no cursor é o único conteúdo
          visível — sem cópia pálida competindo com ele. */}
      <div
        className={cx(
          // Transição nas cores: sem isto a moldura tracejada piscava de uma vez
          // no primeiro frame do arrasto.
          "rounded-lg border border-dashed transition-colors duration-150",
          isDragging
            ? "border-paper-300 dark:border-ink-600 bg-paper-100/50 dark:bg-ink-900/40"
            : "border-transparent",
        )}
      >
        <div className={cx(isDragging && "invisible")}>
          <CardCell
            card={card}
            members={members}
            onDone={onDone}
            onAssign={onAssign && ((assigneeId) => onAssign(card.id, assigneeId))}
          />
        </div>
      </div>
    </motion.div>
    </div>
  )
}))

/**
 * Troca o responsável sem sair do quadro, como no Jira: clicar no avatar abre
 * a lista ali mesmo, em vez de exigir abrir o card.
 *
 * Dois cuidados que fazem isso conviver com o arrasto:
 *  - `stopPropagation` no clique, senão o clique sobe para o card e abre o
 *    painel lateral por baixo do menu;
 *  - `stopPropagation` no pointerdown, porque quem escuta o gesto de arrasto é
 *    o wrapper: sem isso, tentar clicar no avatar começava a arrastar o card.
 */
function AssigneePicker({
  card,
  members,
  onAssign,
}: {
  card: Card
  members: Member[]
  onAssign: (userId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const assignee = members.find((m) => m.user_id === card.assignee_id)

  // O card tem `overflow-hidden` (e ainda vive dentro da coluna que rola), então
  // um menu ali dentro nasce recortado. Vai por portal no body, com a posição
  // medida a partir do botão — é o que faz ele SOBREPOR o quadro.
  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const largura = 208
    const altura = 240
    // Abre para baixo, como pedido; só sobe se não houver espaço embaixo.
    const cabeAbaixo = rect.bottom + altura < window.innerHeight
    setAt({
      top: cabeAbaixo ? rect.bottom + 6 : Math.max(8, rect.top - altura - 6),
      left: Math.min(Math.max(8, rect.right - largura), window.innerWidth - largura - 8),
    })
  }

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const alvo = event.target as Node
      if (!boxRef.current?.contains(alvo) && !menuRef.current?.contains(alvo)) setOpen(false)
    }
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
    // Fora do fluxo do card, o menu não acompanha a rolagem: fecha em vez de
    // ficar flutuando solto sobre o quadro.
    const reposition = () => setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open])

  const found = members.filter((m) =>
    m.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const pick = (userId: string | null) => {
    onAssign(userId)
    setOpen(false)
    setQuery("")
  }

  return (
    <div
      ref={boxRef}
      className="relative"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          place()
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={assignee ? `Responsável: ${assignee.name}. Trocar` : "Definir responsável"}
        className="rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        {assignee ? (
          <ColoredAvatar name={assignee.name} userId={assignee.user_id} size="xs" />
        ) : (
          <span className="grid size-5 place-items-center rounded-full border border-dashed border-paper-300 text-[9px] text-paper-400 transition-colors hover:border-brand-500 hover:text-brand-500">
            ?
          </span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && at && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{ top: at.top, left: at.left }}
            className="fixed z-[70] w-52 overflow-hidden rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 shadow-lg"
            role="listbox"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {members.length > 6 && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pessoa…"
                className="w-full border-b border-paper-200 dark:border-ink-700 bg-transparent px-3 py-2 text-xs text-ink dark:text-paper outline-none placeholder:text-paper-400"
              />
            )}
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-paper-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-700"
              >
                <span className="grid size-5 place-items-center rounded-full border border-dashed border-paper-300 text-[9px]">
                  ?
                </span>
                Sem responsável
              </button>
              {found.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => pick(m.user_id)}
                  role="option"
                  aria-selected={m.user_id === card.assignee_id}
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-paper-100 dark:hover:bg-ink-700",
                    m.user_id === card.assignee_id
                      ? "font-semibold text-ink dark:text-paper"
                      : "text-paper-600 dark:text-paper-400",
                  )}
                >
                  <ColoredAvatar name={m.name} userId={m.user_id} size="xs" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
              {found.length === 0 && (
                <p className="px-3 py-2 text-xs text-paper-400">Ninguém encontrado</p>
              )}
            </div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

export function CardCell({
  card,
  members,
  dragging = false,
  onDone,
  onAssign,
}: {
  card: Card
  members: Member[]
  dragging?: boolean
  onDone?: (cardId: string) => void
  /** Ausente no clone do arrasto: o menu não deve abrir no card em voo. */
  onAssign?: (userId: string | null) => void
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
  const hasMeta = nSub > 0 || nComments > 0 || nFiles > 0 || due != null || !!card.doing_since

  return (
    <div
      className={cx(
        "group relative overflow-hidden rounded-lg border bg-paper dark:bg-ink-800 shadow-card dark:shadow-none",
        "transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        // Levantar 4px a cada hover fazia a coluna inteira "respirar" ao passar o
        // mouse; 2px já dá o retorno sem agitar o board.
        "hover:-translate-y-0.5 hover:shadow-panel hover:border-paper-300 dark:hover:border-ink-600",
        "active:translate-y-0 active:shadow-card active:duration-75",
        dragging && "shadow-pop ring-1 ring-ink/10",
        isEpic ? "border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50/60 dark:from-violet-900/20 to-paper dark:to-ink-800" : "border-paper-200 dark:border-ink-700",
        isDone && "opacity-60",
        // Flag de atenção: cliente marcou na criação (ou o time marcou depois)
        // — aura laranja pra saltar aos olhos na varredura do board.
        card.flagged &&
          "border-orange-400/70 dark:border-orange-500/60 shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_0_16px_-4px_rgba(249,115,22,0.5)]",
      )}
    >
      {card.flagged && (
        // O card pai é overflow-hidden (recorta os cantos arredondados) — um
        // badge protruso (-top/-right negativo) seria cortado. Fica encostado
        // por dentro em vez de "pendurado" na borda.
        <span
          title="Marcado como urgente"
          className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full bg-orange-500 text-white shadow-[0_0_6px_rgba(249,115,22,0.6)]"
        >
          <AlertTriangle className="size-3" strokeWidth={2.5} />
        </span>
      )}
      {/* Sem barra de prioridade: o sinal já vem do PriorityIcon no rodapé, e a
          faixa colorida cheia (que ainda engrossava no hover) era o que fazia o
          board parecer carregado ao lado do Jira. */}
      <div className="px-3 py-2.5">
        {/* Título + checkbox de conclusão */}
        <div className="flex items-start gap-2">
          {onDone && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); onDone(card.id) }}
              variants={popCheck}
              animate={isDone ? "done" : "idle"}
              whileTap={{ scale: 0.8 }}
              aria-pressed={isDone}
              aria-label={isDone ? "Reabrir card" : "Concluir card"}
              className={cx(
                "mt-0.5 shrink-0 grid size-3.5 place-items-center rounded border transition-colors",
                isDone
                  ? "border-success bg-success"
                  : "border-paper-300 hover:border-success/60 hover:bg-success/10",
              )}
            >
              <AnimatePresence>
                {isDone && (
                  <motion.span
                    key="check"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={settleSpring}
                  >
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
          <p className={cx(
            // 14/20 regular: a tipografia do título de card do Jira. O clamp em 2
            // linhas é nosso — o Jira deixa o card crescer.
            "text-sm font-normal leading-5 text-ink dark:text-paper line-clamp-2",
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
            {card.doing_since && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                title="Tempo em andamento (horário comercial)"
              >
                <Clock className="size-3" />
                {formatDoingSince(card.doing_since)}
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

        {/* Rodapé: tipo + chave + prioridade + peso + responsável */}
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
          {onAssign && !dragging ? (
            <AssigneePicker card={card} members={members} onAssign={onAssign} />
          ) : assignee ? (
            <ColoredAvatar name={assignee.name} userId={assignee.user_id} size="xs" />
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
