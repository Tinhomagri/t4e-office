// Shell da página de boards: header, tabs de projeto/views e modais
// compartilhados. O quadro Kanban em si vive em views/KanbanView.tsx.
import {
  CalendarDays,
  FileText,
  FolderPlus,
  GanttChartSquare,
  GitBranch,
  Layers,
  LayoutList,
  ListChecks,
  Plus,
  SquareKanban,
  Spade,
  Target,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ResumoView } from "./views/ResumoView"
import { ListaView } from "./views/ListaView"
import { CronogramaView } from "./views/CronogramaView"
import { CalendarioView } from "./views/CalendarioView"
import { MetasView } from "./views/MetasView"
import { DocumentosView } from "./views/DocumentosView"
import { BacklogView } from "./views/BacklogView"
import { AutomacoesView } from "./views/AutomacoesView"
import { KanbanView } from "./views/KanbanView"
import { DevelopmentView } from "@/features/github/DevelopmentView"

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
import { NotificationBell } from "./NotificationBell"
import { PRIORITY_LABEL, STATUS_DOT, STATUS_LABEL, TYPE_LABEL, errMsg } from "./board.shared"
import {
  useCards,
  useCreateCard,
  useCreateProject,
  useCreateWorkspace,
  useMembers,
  useProjects,
  useSprints,
  useWorkspaces,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  CardStatus,
  CardType,
  Project,
} from "@/features/workspace/workspace.types"
import { useCreateProjectSession, useProjectSessions } from "@/features/poker/poker.hooks"

type ProjectView = "resumo" | "quadro" | "backlog" | "lista" | "cronograma" | "calendario" | "metas" | "desenvolvimento" | "documentos" | "automacoes"

const PROJECT_VIEWS: { id: ProjectView; label: string; icon: React.ReactNode }[] = [
  { id: "resumo", label: "Resumo", icon: <SquareKanban className="size-3.5" /> },
  { id: "quadro", label: "Quadro", icon: <Layers className="size-3.5" /> },
  { id: "backlog", label: "Backlog", icon: <ListChecks className="size-3.5" /> },
  { id: "lista", label: "Lista", icon: <LayoutList className="size-3.5" /> },
  { id: "cronograma", label: "Cronograma", icon: <GanttChartSquare className="size-3.5" /> },
  { id: "calendario", label: "Calendário", icon: <CalendarDays className="size-3.5" /> },
  { id: "metas", label: "Metas", icon: <Target className="size-3.5" /> },
  { id: "desenvolvimento", label: "Desenvolvimento", icon: <GitBranch className="size-3.5" /> },
  { id: "documentos", label: "Documentos", icon: <FileText className="size-3.5" /> },
  { id: "automacoes", label: "Automações", icon: <Zap className="size-3.5" /> },
]

// ─── page ────────────────────────────────────────────────────────────────────

export function BoardsPage() {
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces()

  if (isLoading) return <CenterSpinner />
  if (!workspaces || workspaces.length === 0) return <CreateWorkspacePrompt />
  if (!activeWorkspaceId) return <CenterSpinner />

  return <BoardsInner workspaceId={activeWorkspaceId} />
}

function BoardsInner({ workspaceId }: { workspaceId: string }) {
  const { data: projects, isLoading } = useProjects(workspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [pokerModalOpen, setPokerModalOpen] = useState(false)
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
        {activeProject && (
          <Button
            variant="ghost"
            icon={<Spade className="size-4" />}
            onClick={() => setPokerModalOpen(true)}
          >
            Planning Poker
          </Button>
        )}
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
      {pokerModalOpen && activeProject && (
        <PokerLaunchModal projectId={activeProject.id} onClose={() => setPokerModalOpen(false)} />
      )}
    </div>
  )
}

// ─── board dispatch ───────────────────────────────────────────────────────────

function ProjectBoard({ project, workspaceId, view }: { project: Project; workspaceId: string; view: ProjectView }) {
  const projectId = project.id
  const { data: cards, isLoading } = useCards(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: members } = useMembers(workspaceId)

  const [newCard, setNewCard] = useState<{ status: CardStatus; sprintId: string | null } | null>(null)
  const [openCard, setOpenCard] = useState<Card | null>(null)
  const setNewCardStatus = (status: CardStatus | null, sprintId: string | null = null) =>
    setNewCard(status ? { status, sprintId } : null)

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
  const openNewCard = () => setNewCardStatus("todo")

  // Drawer + modal de criação sempre montados, compartilhados por todas as views.
  const sharedModals = (
    <>
      <CardDrawer card={openCard} projectId={projectId} sprints={sprints ?? []} members={members ?? []} onClose={() => setOpenCard(null)} />
      <NewCardModal projectId={projectId} sprintId={newCard?.sprintId ?? null} status={newCard?.status ?? null} onClose={() => setNewCardStatus(null)} />
    </>
  )

  if (view === "quadro") {
    return (
      <>
        <KanbanView
          project={project}
          workspaceId={workspaceId}
          onOpen={setOpenCard}
          onNewCard={(status, sprintId) => setNewCardStatus(status, sprintId ?? null)}
        />
        {sharedModals}
      </>
    )
  }

  if (view === "documentos") {
    return <DocumentosView projectId={projectId} members={members ?? []} />
  }
  if (view === "automacoes") {
    return <AutomacoesView projectId={projectId} />
  }
  if (view === "desenvolvimento") {
    return (
      <div className="flex flex-col gap-3">
        <ViewToolbar projectKey={project.key} view={view} count={allCards.length} onNewCard={openNewCard} />
        <DevelopmentView projectId={projectId} />
        {sharedModals}
      </div>
    )
  }

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
    inner = <ResumoView cards={allCards} sprints={sprints ?? []} members={members ?? []} projectId={projectId} />
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

// ─── modals ───────────────────────────────────────────────────────────────────

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

// ─── Planning Poker — lançar sala a partir do board ──────────────────────────

function PokerLaunchModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: sessions, isLoading } = useProjectSessions(projectId)
  const { data: cards } = useCards(projectId)
  const createSession = useCreateProjectSession(projectId)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [name, setName] = useState("Planning Poker")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const openSessions = (sessions ?? []).filter((s) => s.status !== "done")
  const enterRoom = (id: string) => navigate(`/app/poker/${id}`)

  // Candidatos à votação: todos os cards não-épicos do board.
  const candidates = (cards ?? []).filter((c) => c.type !== "epic")
  const visible = query.trim()
    ? candidates.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.ref.toLowerCase().includes(query.toLowerCase()),
      )
    : candidates

  const startPicking = () => {
    // Pré-seleciona os cards ainda sem pontuação — o caso comum.
    setSelected(new Set(candidates.filter((c) => c.points == null).map((c) => c.id)))
    setPicking(true)
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleCreate = async () => {
    setError(null)
    try {
      const session = await createSession.mutateAsync({
        name: name.trim() || "Planning Poker",
        card_ids: candidates.filter((c) => selected.has(c.id)).map((c) => c.id),
      })
      enterRoom(session.id)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  if (picking) {
    const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id))
    // Agrupado por coluna/status — fica muito mais fácil escolher quando há
    // dezenas de cards no board (era uma lista solta antes, difícil de escanear).
    const groups = (["todo", "doing", "review", "backlog", "done"] as const)
      .map((status) => ({ status, items: visible.filter((c) => c.status === status) }))
      .filter((g) => g.items.length > 0)

    return (
      <Modal
        open
        onClose={onClose}
        title="Nova sala de Planning Poker"
        description="Selecione os cards do board que serão votados nesta sala."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPicking(false)}>Voltar</Button>
            <Button
              onClick={handleCreate}
              loading={createSession.isPending}
              disabled={selected.size === 0}
              icon={<Spade className="size-4" />}
            >
              Criar sala ({selected.size} card{selected.size !== 1 ? "s" : ""})
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nome da sala">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-paper px-1 py-1 dark:bg-ink-900">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar card por título ou chave…"
              className="flex-1"
            />
            <span className="shrink-0 rounded-full bg-paper-100 dark:bg-ink-800 px-2.5 py-1 text-xs font-semibold text-paper-500">
              {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (allVisibleSelected) visible.forEach((c) => next.delete(c.id))
                  else visible.forEach((c) => next.add(c.id))
                  return next
                })
              }
              className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
            >
              {allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>

          <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1 scrollbar-slim">
            {groups.map((g) => (
              <div key={g.status}>
                <div className="mb-1.5 flex items-center gap-2 px-0.5">
                  <span className={cx("size-2 rounded-full", STATUS_DOT[g.status])} />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-400">
                    {STATUS_LABEL[g.status]} · {g.items.length}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {g.items.map((c) => {
                    const checked = selected.has(c.id)
                    return (
                      <label
                        key={c.id}
                        className={cx(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                          checked
                            ? "border-brand-300 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10"
                            : "border-paper-200 dark:border-ink-700 hover:border-paper-300 dark:hover:border-ink-600",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(c.id)}
                          className="size-3.5 shrink-0 accent-brand-500"
                        />
                        <span className="shrink-0 font-mono text-[10px] text-paper-400">{c.ref}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-paper">{c.title}</span>
                        {c.points != null && (
                          <span className="shrink-0 rounded-full bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-paper-500">
                            {c.points} pts
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="py-10 text-center text-xs text-paper-400">Nenhum card encontrado.</p>
            )}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Planning Poker">
      <div className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : openSessions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-paper-400">Salas abertas</p>
            {openSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => enterRoom(s.id)}
                className="flex w-full items-center justify-between rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="text-sm font-medium text-ink dark:text-paper">{s.name}</span>
                <span className="text-xs text-paper-400">{s.card_ids.length} cards</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-dashed border-paper-300 dark:border-ink-700 p-4 text-center">
          <Spade className="mx-auto mb-2 size-6 text-brand-400" />
          <p className="text-sm text-paper-500">
            Crie uma sala nova escolhendo quais cards do board serão votados.
          </p>
          <Button className="mx-auto mt-3" onClick={startPicking}>
            Nova sala
          </Button>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </Modal>
  )
}
