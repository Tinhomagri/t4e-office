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
import { useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays,
  Check,
  FileText,
  Filter,
  FolderPlus,
  GanttChartSquare,
  ChevronDown,
  ChevronRight,
  Layers,
  LayoutList,
  ListChecks,
  ListTree,
  MessageSquare,
  Paperclip,
  Plus,
  Settings2,
  SquareKanban,
  Spade,
  Target,
  X,
  Zap,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ResumoView } from "./views/ResumoView"
import { ListaView } from "./views/ListaView"
import { CronogramaView } from "./views/CronogramaView"
import { CalendarioView } from "./views/CalendarioView"
import { MetasView } from "./views/MetasView"
import { DocumentosView } from "./views/DocumentosView"
import { BacklogView } from "./views/BacklogView"
import { AutomacoesView } from "./views/AutomacoesView"

import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
  cx,
} from "@/shared/ui/primitives"
import { CardDrawer } from "./CardDrawer"
import { JqlSearchBar } from "./JqlSearchBar"
import { NotificationBell } from "./NotificationBell"
import { useBoardPrefs, colKey } from "./board.prefs.store"
import {
  useCards,
  useCreateCard,
  useCreateProject,
  useCreateSprint,
  useCreateWorkspace,
  useCreateWorkflowStatus,
  useDeleteWorkflowStatus,
  useMembers,
  useProjectPermissions,
  useProjects,
  useSprints,
  useUpdateCard,
  useWorkflowStatuses,
  useWorkspaces,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  CardStatus,
  CardType,
  Member,
  Project,
  WorkflowStatus,
} from "@/features/workspace/workspace.types"
import { IssueTypeIcon, PriorityIcon } from "@/shared/ui/issue"

// ─── constants ───────────────────────────────────────────────────────────────

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
  epic: "Epic",
}

const TYPE_COLOR: Record<CardType, string> = {
  feature: "bg-brand-100 text-brand-700",
  bug: "bg-red-100 text-red-700",
  debt: "bg-orange-100 text-orange-700",
  spike: "bg-cyan-100 text-cyan-700",
  chore: "bg-paper-200 dark:bg-ink-700 text-paper-600",
  epic: "bg-violet-100 text-violet-700",
}

const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

const PRIORITY_BAR: Record<CardPriority, string> = {
  low: "bg-paper-300",
  medium: "bg-brand-400",
  high: "bg-warning",
  urgent: "bg-danger",
}

// Avatar colors — determinístico por nome
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-cyan-500 to-sky-700",
  "from-fuchsia-500 to-pink-700",
  "from-lime-500 to-green-700",
]

function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

// Cor determinística de label (estilo Jira) — bg/texto a partir do nome.
const LABEL_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-red-100 text-red-700",
  "bg-cyan-100 text-cyan-700",
  "bg-yellow-100 text-yellow-700",
]

function labelColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) & 0xffff
  return LABEL_COLORS[hash % LABEL_COLORS.length]
}

// Estado do prazo: vencido / próximo (≤2 dias) / normal.
type DueState = { tone: string; label: string }

function dueState(due: string | null): DueState | null {
  if (!due) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(due + "T00:00:00")
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  if (diffDays < 0) return { tone: "bg-red-100 text-red-700", label }
  if (diffDays <= 2) return { tone: "bg-orange-100 text-orange-700", label }
  return { tone: "bg-paper-100 text-paper-500", label }
}

type Scope = { kind: "backlog" } | { kind: "sprint"; id: string }

type ProjectView = "resumo" | "quadro" | "backlog" | "lista" | "cronograma" | "calendario" | "metas" | "documentos" | "automacoes"

const PROJECT_VIEWS: { id: ProjectView; label: string; icon: React.ReactNode }[] = [
  { id: "resumo", label: "Resumo", icon: <SquareKanban className="size-3.5" /> },
  { id: "quadro", label: "Quadro", icon: <Layers className="size-3.5" /> },
  { id: "backlog", label: "Backlog", icon: <ListChecks className="size-3.5" /> },
  { id: "lista", label: "Lista", icon: <LayoutList className="size-3.5" /> },
  { id: "cronograma", label: "Cronograma", icon: <GanttChartSquare className="size-3.5" /> },
  { id: "calendario", label: "Calendário", icon: <CalendarDays className="size-3.5" /> },
  { id: "metas", label: "Metas", icon: <Target className="size-3.5" /> },
  { id: "documentos", label: "Documentos", icon: <FileText className="size-3.5" /> },
  { id: "automacoes", label: "Automações", icon: <Zap className="size-3.5" /> },
]

interface FilterState {
  types: CardType[]
  priorities: CardPriority[]
  assigneeIds: string[]
  groupByEpic: boolean
}

const EMPTY_FILTER: FilterState = {
  types: [],
  priorities: [],
  assigneeIds: [],
  groupByEpic: false,
}

// ─── page ────────────────────────────────────────────────────────────────────

export function BoardsPage() {
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces()

  if (isLoading) return <CenterSpinner />
  if (!workspaces || workspaces.length === 0) return <CreateWorkspacePrompt />
  if (!activeWorkspaceId) return <CenterSpinner />

  return <BoardsInner workspaceId={activeWorkspaceId} />
}

function BoardsInner({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects(workspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [activeView, setActiveView] = useState<ProjectView>("quadro")

  useEffect(() => {
    if (projects && projects.length > 0 && !projects.some((p) => p.id === projectId)) {
      setProjectId(projects[0].id)
    }
  }, [projects, projectId])

  if (isLoading) return <CenterSpinner />

  const activeProject = projects?.find((p) => p.id === projectId) ?? null

  return (
    <div className="flex flex-col gap-0">
      {/* Top header */}
      <PageHeader
        eyebrow={
          <>
            <SquareKanban className="size-4 text-brand-500" />
            <span>Boards</span>
          </>
        }
        title={activeProject ? activeProject.name : "Boards"}
        subtitle={
          activeProject
            ? `Projeto ${activeProject.key} · workspace`
            : "Projetos e cards do workspace"
        }
      >
        <NotificationBell />
        <Button variant="ghost" icon={<Spade className="size-4" />} onClick={() => navigate("/app/poker")}>
          Planning Poker
        </Button>
        <Button variant="outline" icon={<FolderPlus className="size-4" />} onClick={() => setNewProjectOpen(true)}>
          Novo projeto
        </Button>
      </PageHeader>

      {/* Project tabs (workspaces) */}
      {projects && projects.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-paper-200 dark:border-ink-700 pb-px">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className={cx(
                "relative -mb-px rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
                p.id === projectId ? "text-ink dark:text-paper" : "text-paper-500 hover:text-ink dark:hover:text-paper",
              )}
            >
              <span className="font-mono text-xs text-paper-400">{p.key}</span>{" "}
              {p.name}
              {p.id === projectId && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <EmptyProjects onCreate={() => setNewProjectOpen(true)} />
      )}

      {/* Jira-style view tab bar */}
      {activeProject && (
        <div className="mt-3 flex items-center gap-0.5 border-b border-paper-100 dark:border-ink-800">
          {PROJECT_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={cx(
                "relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors rounded-t-lg",
                activeView === v.id
                  ? "text-brand-600"
                  : "text-paper-400 hover:text-ink dark:hover:text-paper hover:bg-paper-50 dark:hover:bg-ink-900",
              )}
            >
              {v.icon}
              {v.label}
              {activeView === v.id && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {activeProject && (
        <div className="mt-5">
          <ProjectBoard
            project={activeProject}
            workspaceId={workspaceId}
            view={activeView}
          />
        </div>
      )}

      <NewProjectModal
        workspaceId={workspaceId}
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(p) => setProjectId(p.id)}
      />
    </div>
  )
}

// ─── board ───────────────────────────────────────────────────────────────────

function ProjectBoard({ project, workspaceId, view }: { project: Project; workspaceId: string; view: ProjectView }) {
  const projectId = project.id
  const qc = useQueryClient()
  const { data: cards, isLoading } = useCards(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: members } = useMembers(workspaceId)
  const updateCard = useUpdateCard(projectId)

  const [scope, setScope] = useState<Scope>({ kind: "backlog" })
  const [newCardStatus, setNewCardStatus] = useState<CardStatus | null>(null)
  const [openCard, setOpenCard] = useState<Card | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newSprintOpen, setNewSprintOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER)
  const { data: workflowStatuses } = useWorkflowStatuses(projectId)
  const createWorkflowStatus = useCreateWorkflowStatus(projectId)
  const deleteWorkflowStatus = useDeleteWorkflowStatus(projectId)
  const [manageWorkflowOpen, setManageWorkflowOpen] = useState(false)
  const [jqlResults, setJqlResults] = useState<Card[] | null>(null)

  // Columns driven by backend workflow statuses (fallback to defaults while loading)
  const columns: WorkflowStatus[] = workflowStatuses ?? []

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const active = sprints?.find((s) => s.status === "active")
    if (active) setScope({ kind: "sprint", id: active.id })
  }, [sprints])

  const scopeCards = useMemo(() => {
    if (jqlResults !== null) return jqlResults
    const all = cards ?? []
    const base = scope.kind === "backlog"
      ? all.filter((c) => !c.sprint_id)
      : all.filter((c) => c.sprint_id === scope.id)

    return base.filter((c) => {
      if (filters.types.length && !filters.types.includes(c.type)) return false
      if (filters.priorities.length && !filters.priorities.includes(c.priority)) return false
      if (filters.assigneeIds.length && !filters.assigneeIds.includes(c.assignee_id ?? "")) return false
      return true
    })
  }, [cards, scope, filters, jqlResults])

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

  // Atalhos de teclado estilo Jira: "c" cria card, "/" foca a busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing =
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "c") {
        e.preventDefault()
        setNewCardStatus("todo")
      } else if (e.key === "/") {
        e.preventDefault()
        document.querySelector<HTMLInputElement>("[data-jql-search]")?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (isLoading) return <BoardSkeleton />

  const allCards = cards ?? []
  const currentSprintId = scope.kind === "sprint" ? scope.id : null
  const activeFiltersCount =
    filters.types.length + filters.priorities.length + filters.assigneeIds.length
  const epicCards = allCards.filter((c) => c.type === "epic")

  // Abas baseadas em cards (não-kanban). Compartilham toolbar "Novo card",
  // empty state com CTA e os modais (drawer + criação) sempre montados.
  const openNewCard = () => setNewCardStatus("todo")
  const sharedModals = (
    <>
      <CardDrawer card={openCard} projectId={projectId} sprints={sprints ?? []} members={members ?? []} onClose={() => setOpenCard(null)} />
      <NewCardModal projectId={projectId} sprintId={currentSprintId} status={newCardStatus} onClose={() => setNewCardStatus(null)} />
    </>
  )

  const CARD_VIEWS: ProjectView[] = ["resumo", "lista", "cronograma", "calendario", "metas", "backlog"]
  if (CARD_VIEWS.includes(view)) {
    let inner: React.ReactNode
    if (allCards.length === 0) {
      inner = (
        <EmptyState
          icon={<Layers className="size-6" />}
          title="Nenhum card ainda neste projeto"
          description="Crie o primeiro card para começar a planejar. Ele aparece em todas as abas — quadro, lista, calendário, cronograma e metas."
          action={
            <Button icon={<Plus className="size-4" />} onClick={openNewCard}>
              Criar primeiro card
            </Button>
          }
        />
      )
    } else if (view === "resumo") {
      inner = <ResumoView cards={allCards} sprints={sprints ?? []} members={members ?? []} />
    } else if (view === "lista") {
      inner = <ListaView cards={allCards} members={members ?? []} sprints={sprints ?? []} onOpen={setOpenCard} />
    } else if (view === "cronograma") {
      inner = <CronogramaView cards={allCards} sprints={sprints ?? []} members={members ?? []} onOpen={setOpenCard} />
    } else if (view === "calendario") {
      inner = <CalendarioView cards={allCards} onOpen={setOpenCard} />
    } else if (view === "metas") {
      inner = <MetasView projectId={projectId} cards={allCards} onOpen={setOpenCard} />
    } else {
      inner = <BacklogView projectId={projectId} cards={allCards} sprints={sprints ?? []} members={members ?? []} onOpen={setOpenCard} />
    }

    return (
      <div className="flex flex-col gap-3">
        <ViewToolbar projectKey={project.key} view={view} count={allCards.length} onNewCard={openNewCard} />
        {inner}
        {sharedModals}
      </div>
    )
  }

  if (view === "documentos") {
    return <DocumentosView projectId={projectId} />
  }
  if (view === "automacoes") {
    return <AutomacoesView projectId={projectId} />
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
            count={allCards.filter(c => !c.sprint_id).length}
          />
          {(sprints ?? []).map((s) => (
            <ScopeChip
              key={s.id}
              active={scope.kind === "sprint" && scope.id === s.id}
              onClick={() => setScope({ kind: "sprint", id: s.id })}
              label={s.name}
              dot={s.status === "active"}
              count={allCards.filter(c => c.sprint_id === s.id).length}
              points={allCards.filter(c => c.sprint_id === s.id && c.points).reduce((acc, c) => acc + (c.points ?? 0), 0)}
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
          {/* Member quick-filter avatars */}
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

          {/* Epic grouping toggle */}
          <button
            onClick={() => setFilters((f) => ({ ...f, groupByEpic: !f.groupByEpic }))}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
              filters.groupByEpic
                ? "bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-300"
                : "chip-neutral",
            )}
          >
            <Layers className="size-3.5" />
            Epic
          </button>

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

          {/* Workflow manager */}
          <button
            onClick={() => setManageWorkflowOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-paper-300 px-3 py-1.5 text-xs font-medium text-paper-500 transition-colors hover:border-paper-400 hover:text-ink dark:hover:text-paper"
          >
            <Zap className="size-3.5" /> Workflow
          </button>

          {/* Global create */}
          <button
            onClick={() => setNewCardStatus("todo")}
            className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            <Plus className="size-3.5" /> Criar
          </button>
        </div>
      </div>

      {/* JQL search bar */}
      <JqlSearchBar projectId={projectId} onResults={setJqlResults} />

      {/* Filter panel */}
      {filterOpen && (
        <FilterPanel
          filters={filters}
          members={members ?? []}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTER)}
        />
      )}

      {/* Board vazio (sem cards no scope atual): CTA para criar o primeiro */}
      {scopeCards.length === 0 && (
        <EmptyState
          icon={<Layers className="size-6" />}
          title={scope.kind === "sprint" ? "Sprint sem cards" : "Backlog sem cards"}
          description="Crie um card ou arraste cards existentes para cá. Ele aparece em todas as abas do projeto."
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setNewCardStatus("todo")}>
              Criar primeiro card
            </Button>
          }
        />
      )}

      {/* Kanban — full width breakout */}
      <div className="-mx-6 px-6 overflow-x-auto pb-4 scrollbar-slim">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {filters.groupByEpic ? (
            <EpicGroupedBoard
              epics={epicCards}
              columns={columns}
              scopeCards={scopeCards}
              members={members ?? []}
              projectId={projectId}
              sprintId={currentSprintId}
              onAddDetailed={setNewCardStatus}
              onOpen={setOpenCard}
              onDone={(cardId) => updateCard.mutate({ cardId, input: { status: "done" } })}
            />
          ) : (
            <div className="flex gap-3" style={{ minWidth: `${columns.length * 288}px` }}>
              {columns.map((ws) => (
                <Column
                  key={ws.slug}
                  status={ws.slug}
                  label={ws.name}
                  color={ws.color}
                  cards={scopeCards.filter((c) => c.status === ws.slug)}
                  members={members ?? []}
                  projectId={projectId}
                  sprintId={currentSprintId}
                  onAddDetailed={() => setNewCardStatus(ws.slug as CardStatus)}
                  onOpen={setOpenCard}
                  onDone={(cardId) => updateCard.mutate({ cardId, input: { status: "done" } })}
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

      {/* Modals */}
      <NewCardModal
        projectId={projectId}
        sprintId={currentSprintId}
        status={newCardStatus}
        onClose={() => setNewCardStatus(null)}
      />
      <CardDrawer
        card={openCard}
        projectId={projectId}
        sprints={sprints ?? []}
        members={members ?? []}
        onClose={() => setOpenCard(null)}
      />
      <NewSprintModal
        projectId={projectId}
        open={newSprintOpen}
        onClose={() => setNewSprintOpen(false)}
      />
      <ManageWorkflowModal
        open={manageWorkflowOpen}
        statuses={columns}
        onClose={() => setManageWorkflowOpen(false)}
        onCreate={(input) => createWorkflowStatus.mutateAsync(input)}
        onDelete={(id) => deleteWorkflowStatus.mutate(id)}
      />
    </div>
  )
}

// Toolbar comum das abas baseadas em cards: contexto + ação "Novo card".
function ViewToolbar({
  projectKey,
  view,
  count,
  onNewCard,
}: {
  projectKey: string
  view: ProjectView
  count: number
  onNewCard: () => void
}) {
  const label = PROJECT_VIEWS.find((v) => v.id === view)?.label ?? view
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm text-paper-500">
        <span className="font-mono text-xs text-paper-400">{projectKey}</span>
        <span className="font-medium text-ink dark:text-paper">{label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-paper-200 dark:bg-ink-800 px-1.5 text-[11px] font-semibold text-paper-600 dark:text-paper-400">
          {count}
        </span>
      </div>
      <Button size="sm" icon={<Plus className="size-4" />} onClick={onNewCard}>
        Novo card
      </Button>
    </div>
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

// ─── epic grouped board ───────────────────────────────────────────────────────

function EpicGroupedBoard({
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
  const noEpicCards = scopeCards.filter((c) => c.type !== "epic")
  const groups = [
    { label: "Sem Epic", id: null, color: "bg-paper-300" },
    ...epics.map((e) => ({ label: e.title, id: e.id, color: "bg-violet-400" })),
  ]

  return (
    <div className="flex flex-col gap-6" style={{ minWidth: `${columns.length * 288}px` }}>
      {groups.map((group) => {
        const groupCards = group.id === null
          ? noEpicCards.filter((c) => !c.sprint_id || c.sprint_id)
          : noEpicCards

        return (
          <div key={group.id ?? "no-epic"}>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-3.5 text-violet-500" />
              <span className="text-sm font-semibold text-ink dark:text-paper">{group.label}</span>
              <span className="text-xs text-paper-400">({groupCards.length})</span>
            </div>
            <div className="flex gap-3">
              {columns.map((ws) => (
                <Column
                  key={ws.slug}
                  status={ws.slug}
                  label={ws.name}
                  color={ws.color}
                  cards={groupCards.filter((c) => c.status === ws.slug)}
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
  const [wipMenu, setWipMenu] = useState(false)
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
          <span className="truncate text-[12px] font-bold uppercase tracking-wider text-paper-600 dark:text-paper-400">
            {displayLabel}
          </span>
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
            onClick={() => setWipMenu((o) => !o)}
            className={cx(
              "grid size-6 place-items-center rounded-md transition-colors hover:bg-paper-200 dark:hover:bg-ink-700",
              wipLimit != null ? "text-brand-500" : "text-paper-400 hover:text-ink dark:hover:text-paper",
            )}
            title="Limite WIP"
          >
            <Settings2 className="size-3.5" />
          </button>
          <button
            onClick={onAddDetailed}
            className="grid size-6 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
            title="Novo card"
          >
            <Plus className="size-4" />
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="grid size-6 place-items-center rounded-md text-paper-400 transition-colors hover:bg-danger/10 hover:text-danger"
              title="Remover coluna"
            >
              <X className="size-3.5" />
            </button>
          )}
          {wipMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setWipMenu(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-2.5 shadow-pop">
                <label className="mb-1 block text-[11px] font-medium text-paper-500">
                  Limite WIP
                </label>
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
                <p className="mt-1 text-[10px] text-paper-400">0 ou vazio = sem limite</p>
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
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} members={members} onOpen={onOpen} onDone={onDone} />
        ))}
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
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className={cx("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <CardCell card={card} members={members} onDone={onDone} />
    </div>
  )
}

function CardCell({
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

function ColoredAvatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  const grad = avatarGradient(name)
  return (
    <span
      title={name}
      className={cx(
        "grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/20 shadow-sm",
        grad,
        size === "xs" ? "size-5 text-[8px]" : "size-6 text-[9px]",
      )}
    >
      {init}
    </span>
  )
}



function InitialsDot({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  const grad = avatarGradient(name)
  return (
    <span
      className={cx(
        "grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/20",
        grad,
        size === "xs" ? "size-4 text-[8px]" : "size-6 text-[9px]",
      )}
    >
      {init}
    </span>
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

function NewProjectModal({
  workspaceId,
  open,
  onClose,
  onCreated,
}: {
  workspaceId: string
  open: boolean
  onClose: () => void
  onCreated: (p: Project) => void
}) {
  const createProject = useCreateProject(workspaceId)
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      const p = await createProject.mutateAsync({ name, key: key.toUpperCase() })
      onCreated(p)
      setName("")
      setKey("")
      onClose()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo projeto"
      description="Projetos agrupam sprints e cards dentro do workspace."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createProject.isPending} disabled={!name || key.length < 2}>
            Criar projeto
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome do projeto">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Migração de Atendimento" autoFocus />
        </Field>
        <Field label="Chave" hint="2 a 10 letras — prefixo dos cards (ex.: MIA-142).">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="MIA"
            maxLength={10}
            className="font-mono uppercase"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function NewCardModal({
  projectId,
  sprintId,
  status,
  onClose,
}: {
  projectId: string
  sprintId: string | null
  status: CardStatus | null
  onClose: () => void
}) {
  const createCard = useCreateCard(projectId)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<CardType>("feature")
  const [priority, setPriority] = useState<CardPriority>("medium")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await createCard.mutateAsync({
        title,
        type,
        priority,
        status: status ?? "todo",
        sprint_id: sprintId,
      })
      setTitle("")
      setType("feature")
      setPriority("medium")
      onClose()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <Modal
      open={status !== null}
      onClose={onClose}
      title="Novo card"
      description={status ? `Será criado em "${STATUS_LABEL[status]}".` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createCard.isPending} disabled={!title.trim()}>
            Criar card
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as CardType)}>
              {(Object.keys(TYPE_LABEL) as CardType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as CardPriority)}>
              {(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function CenterSpinner() {
  return (
    <div className="grid place-items-center py-20">
      <Spinner className="size-6" />
    </div>
  )
}

// Skeleton do board: colunas com cards-placeholder (shimmer) durante o load.
function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden p-1">
      {[0, 1, 2, 3].map((col) => (
        <div key={col} className="w-72 shrink-0 rounded-lg bg-paper-100/60 dark:bg-ink-900/40 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 - (col % 2) }).map((_, i) => (
              <div key={i} className="rounded-md border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 p-3">
                <Skeleton className="mb-2 h-3.5 w-full" />
                <Skeleton className="mb-2 h-3.5 w-2/3" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="size-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CreateWorkspacePrompt() {
  const createWorkspace = useCreateWorkspace()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await createWorkspace.mutateAsync(name.trim())
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <SquareKanban className="size-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink dark:text-paper">Crie seu primeiro workspace</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-paper-500">
        Um workspace agrupa seus projetos, sprints, cards e a equipe.
      </p>
      <div className="mx-auto mt-5 flex max-w-sm gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: T4E Group"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) submit()
          }}
        />
        <Button onClick={submit} loading={createWorkspace.isPending} disabled={!name.trim()}>
          Criar
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  )
}

function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-paper-300 bg-paper-50 dark:bg-ink-900 py-16 text-center">
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <SquareKanban className="size-6" />
      </div>
      <p className="text-sm font-semibold text-ink dark:text-paper">Crie seu primeiro projeto</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-paper-500">
        Um projeto organiza sprints, backlog e o board de cards da sua equipe.
      </p>
      <Button className="mx-auto mt-4" icon={<Plus className="size-4" />} onClick={onCreate}>
        Novo projeto
      </Button>
    </div>
  )
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir."
  )
}
