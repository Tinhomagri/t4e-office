// Shell da página de boards: header, tabs de projeto/views e modais
// compartilhados. O quadro Kanban em si vive em views/KanbanView.tsx.
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  FolderPlus,
  GanttChartSquare,
  GitBranch,
  Layers,
  LayoutList,
  ListChecks,
  Megaphone,
  Plus,
  SquareKanban,
  Spade,
  Target,
  X,
  Zap,
} from "lucide-react"
import { AnimatePresence } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useCopilotContextStore } from "@/features/copilot/copilot.context.store"

import { ResumoView } from "./views/ResumoView"
import { ListaView } from "./views/ListaView"
import { CronogramaView } from "./views/CronogramaView"
import { CalendarioView } from "./views/CalendarioView"
import { MarketingView } from "./views/MarketingView"
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
import { ColoredAvatar, PRIORITY_LABEL, STATUS_DOT, STATUS_LABEL, TYPE_LABEL, errMsg } from "./board.shared"
import { IssueTypeIcon, PriorityIcon } from "@/shared/ui/issue"
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
  ProjectTemplate,
} from "@/features/workspace/workspace.types"
import {
  useCloseProjectSession,
  useCreateProjectSession,
  useProjectSessions,
} from "@/features/poker/poker.hooks"
import { useAuthStore } from "@/features/auth/auth.store"

type ProjectView = "resumo" | "quadro" | "backlog" | "lista" | "cronograma" | "calendario" | "marketing" | "metas" | "desenvolvimento" | "documentos" | "automacoes"

// Abas visíveis apenas em projetos de marketing (template != software)
const MARKETING_ONLY_VIEWS = new Set<ProjectView>(["marketing"])

const PROJECT_VIEWS: { id: ProjectView; label: string; icon: React.ReactNode }[] = [
  { id: "resumo", label: "Resumo", icon: <SquareKanban className="size-3.5" /> },
  { id: "quadro", label: "Quadro", icon: <Layers className="size-3.5" /> },
  { id: "backlog", label: "Backlog", icon: <ListChecks className="size-3.5" /> },
  { id: "lista", label: "Lista", icon: <LayoutList className="size-3.5" /> },
  { id: "cronograma", label: "Cronograma", icon: <GanttChartSquare className="size-3.5" /> },
  { id: "calendario", label: "Calendário", icon: <CalendarDays className="size-3.5" /> },
  { id: "marketing", label: "Marketing", icon: <Megaphone className="size-3.5" /> },
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
  const { data: allProjects, isLoading } = useProjects(workspaceId)
  const [searchParams, setSearchParams] = useSearchParams()
  // Separação Boards (software) x Campanhas (marketing) — ?type=marketing filtra
  // a lista, espelhando o menu da sidebar.
  const typeFilter = searchParams.get("type")
  const projects = (allProjects ?? []).filter((p) =>
    typeFilter === "marketing"
      ? !!p.template && p.template !== "software"
      : typeFilter === "software"
        ? !p.template || p.template === "software"
        : true,
  )
  const [projectId, setProjectIdState] = useState<string | null>(
    searchParams.get("project"),
  )
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [pokerModalOpen, setPokerModalOpen] = useState(false)
  const [activeView, setActiveView] = useState<ProjectView>(
    (searchParams.get("view") as ProjectView | null) ?? "quadro",
  )

  const setProjectId = (id: string | null) => {
    setProjectIdState(id)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set("project", id)
        else next.delete("project")
        return next
      },
      { replace: true },
    )
  }

  // Sincroniza o projeto ativo com a URL (?project=) — sem isso, navegar pela
  // sidebar troca a URL mas mantém o projeto antigo no estado.
  useEffect(() => {
    const urlProject = searchParams.get("project")
    if (urlProject && urlProject !== projectId) setProjectIdState(urlProject)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!projects || projects.length === 0) return
    if (projectId && projects.some((p) => p.id === projectId)) return
    setProjectId(projects[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, projectId])

  const activeProject = projects?.find((p) => p.id === projectId) ?? null

  // Projeto aberto como contexto do Copiloto. O CardDrawer publica sob a chave
  // "card" e sobrepõe este enquanto estiver aberto — quem está lendo um card
  // pergunta sobre o card, não sobre o board inteiro.
  const setCopilotContext = useCopilotContextStore((s) => s.setContext)
  const clearCopilotContext = useCopilotContextStore((s) => s.clearContext)
  useEffect(() => {
    if (!activeProject) return
    setCopilotContext("project", {
      label: `${activeProject.key} · ${activeProject.name}`,
      hint:
        `O usuário está no board do projeto "${activeProject.name}" ` +
        `(key ${activeProject.key}, project_id="${activeProject.id}"). Quando ` +
        `ele disser "este projeto" ou "este board", é deste que se trata.`,
    })
    return () => clearCopilotContext("project")
  }, [activeProject, setCopilotContext, clearCopilotContext])

  // Porta de entrada por tipo: projeto de marketing abre no dashboard/calendário
  // (aba "marketing"), software abre no quadro. Só decide ao TROCAR de projeto e
  // se não houver ?view explícito — depois o usuário navega livre entre as abas.
  const lastProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeProject) return
    if (lastProjectRef.current === activeProject.id) return
    lastProjectRef.current = activeProject.id
    if (searchParams.get("view")) return
    const isMarketing = !!activeProject.template && activeProject.template !== "software"
    setActiveView(isMarketing ? "marketing" : "quadro")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject])

  if (isLoading) return <CenterSpinner />

  return (
    <div className="flex flex-col gap-0">
      {/* Top header */}
      <PageHeader
        eyebrow={
          <>
            {typeFilter === "marketing" ? (
              <Megaphone className="size-4 text-brand-500" />
            ) : (
              <SquareKanban className="size-4 text-brand-500" />
            )}
            <span>{typeFilter === "marketing" ? "Campanhas" : "Boards"}</span>
          </>
        }
        title={
          activeProject
            ? activeProject.name
            : typeFilter === "marketing"
              ? "Campanhas"
              : "Boards"
        }
        subtitle={
          activeProject
            ? `Projeto ${activeProject.key} · workspace`
            : typeFilter === "marketing"
              ? "Projetos de marketing do workspace"
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
          {PROJECT_VIEWS.filter(
            (v) =>
              !MARKETING_ONLY_VIEWS.has(v.id) ||
              (activeProject.template && activeProject.template !== "software"),
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={cx(
                // Aba do Jira: 32px de altura, 14/20 medium, e o estado ativo é só a
                // cor do texto — não há sublinhado. Ver docs/jira-ui-spec.md.
                "relative flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium leading-5 transition-colors rounded-t-lg",
                activeView === v.id
                  ? "text-brand-600"
                  : "text-paper-400 hover:text-ink dark:hover:text-paper hover:bg-paper-50 dark:hover:bg-ink-900",
              )}
            >
              {v.icon}
              {v.label}
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
        <PokerLaunchModal
          projectId={activeProject.id}
          workspaceId={workspaceId}
          onClose={() => setPokerModalOpen(false)}
        />
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

  // Botão "Criar" na top bar dispara este evento (AppShell) em vez de duplicar
  // o modal — mesmo fluxo do atalho "c".
  useEffect(() => {
    const onCreate = () => setNewCardStatus("todo")
    window.addEventListener("app:create-card", onCreate)
    return () => window.removeEventListener("app:create-card", onCreate)
  }, [])

  if (isLoading) return <BoardSkeleton />

  const allCards = cards ?? []
  const openNewCard = () => setNewCardStatus("todo")

  // Drawer + modal de criação sempre montados, compartilhados por todas as views.
  const sharedModals = (
    <>
      <AnimatePresence>
        {openCard && (
          <CardDrawer key={openCard.id} card={openCard} projectId={projectId} sprints={sprints ?? []} members={members ?? []} onClose={() => setOpenCard(null)} />
        )}
      </AnimatePresence>
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

  // Marketing renderiza antes do empty-state genérico: mesmo sem cards, o hub
  // precisa aparecer para o usuário gerar a primeira campanha.
  if (view === "marketing") {
    return (
      <>
        <MarketingView
          projectId={projectId}
          workspaceId={workspaceId}
          projectKey={project.key}
          cards={allCards}
          onOpen={setOpenCard}
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
    inner = <ListaView cards={allCards} members={members ?? []} sprints={sprints ?? []} projectId={projectId} onOpen={setOpenCard} />
  } else if (view === "cronograma") {
    inner = <CronogramaView cards={allCards} sprints={sprints ?? []} members={members ?? []} onOpen={setOpenCard} />
  } else if (view === "calendario") {
    inner = <CalendarioView cards={allCards} onOpen={setOpenCard} projectId={projectId} />
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
  const [template, setTemplate] = useState<ProjectTemplate>("software")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      const p = await createProject.mutateAsync({ name, key: key.toUpperCase(), template })
      onCreated(p)
      setName("")
      setKey("")
      setTemplate("software")
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
        <Field label="Template" hint="Define o fluxo inicial do board.">
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  template === t.id
                    ? "border-brand bg-brand/5 ring-1 ring-brand"
                    : "border-border hover:border-brand/50"
                }`}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-fg-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

// Templates de projeto — marketing usa workflow Briefing→Publicado no backend.
const PROJECT_TEMPLATES: { id: ProjectTemplate; label: string; hint: string }[] = [
  { id: "software", label: "Software", hint: "A fazer → Em andamento → Concluído" },
  { id: "campanha", label: "Campanha", hint: "Briefing → Criação → Aprovação → Publicado" },
  { id: "social", label: "Social Media", hint: "Posts com canal e calendário editorial" },
  { id: "conteudo", label: "Conteúdo", hint: "Blog, site e materiais institucionais" },
]

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

// Status da SALA de poker (não confundir com STATUS_LABEL/STATUS_DOT do
// board.shared, que são de card). Só os estados que aparecem em sala aberta.
const POKER_STATUS_LABEL: Record<string, string> = {
  waiting: "Aguardando", voting: "Votando", revealed: "Revelando", done: "Concluída",
}
const POKER_STATUS_DOT: Record<string, string> = {
  waiting: "bg-paper-400", voting: "bg-warning", revealed: "bg-brand-500", done: "bg-success",
}

// "há 5min" / "há 2h" / "há 3d" — a sala é efêmera, então a idade importa mais
// que a data exata.
function sinceLabel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins}min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.round(hours / 24)}d`
}

function PokerLaunchModal({
  projectId,
  workspaceId,
  onClose,
}: {
  projectId: string
  workspaceId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: sessions, isLoading } = useProjectSessions(projectId)
  const { data: cards } = useCards(projectId)
  const { data: members } = useMembers(workspaceId)
  const createSession = useCreateProjectSession(projectId)
  const closeSession = useCloseProjectSession(projectId)
  const userId = useAuthStore((s) => s.user?.id)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [name, setName] = useState("Planning Poker")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeEstimated, setIncludeEstimated] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

  const openSessions = (sessions ?? []).filter((s) => s.status !== "done")
  const enterRoom = (id: string) => navigate(`/app/poker/${id}`)

  // Candidatos à votação: cards não-épicos ainda SEM peso. Estimar de novo o que
  // já tem peso é a exceção, não a regra — listar tudo enchia o modal de ruído e
  // obrigava a desmarcar na mão. Quem precisa reestimar liga o toggle.
  const pending = (cards ?? []).filter((c) => c.type !== "epic" && c.points == null)
  const estimatedCards = (cards ?? []).filter((c) => c.type !== "epic" && c.points != null)
  const candidates = includeEstimated ? [...pending, ...estimatedCards] : pending
  const visible = query.trim()
    ? candidates.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.ref.toLowerCase().includes(query.toLowerCase()),
      )
    : candidates

  const startPicking = () => {
    // Tudo que está sem peso já vem marcado — é o caso comum.
    setSelected(new Set(pending.map((c) => c.id)))
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
        description="Cards sem peso do board já vêm marcados. Ajuste a seleção e abra a sala."
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

          <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-paper px-1 pb-2 pt-1 dark:bg-ink-900">
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar card por título ou chave…"
                className="flex-1"
              />
              <button
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (allVisibleSelected) visible.forEach((c) => next.delete(c.id))
                    else visible.forEach((c) => next.add(c.id))
                    return next
                  })
                }
                disabled={visible.length === 0}
                className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-brand-500/10"
              >
                {allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>

            {/* Barra de contexto: o que está selecionado e o que sobra de trabalho.
                Sem isto o host cria a sala sem saber o tamanho da fila. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                <Spade className="size-3" aria-hidden />
                {selected.size} para votar
              </span>
              <span className="text-paper-400">
                {pending.length} sem peso no board
              </span>
              {estimatedCards.length > 0 && (
                <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-paper-500 transition-colors hover:text-ink dark:hover:text-paper">
                  <input
                    type="checkbox"
                    checked={includeEstimated}
                    onChange={(e) => {
                      const on = e.target.checked
                      setIncludeEstimated(on)
                      // Ao esconder de novo, tira da seleção o que saiu da lista —
                      // senão a sala nasceria com cards que o host não vê mais.
                      if (!on) {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          estimatedCards.forEach((c) => next.delete(c.id))
                          return next
                        })
                      }
                    }}
                    className="size-3.5 accent-brand-500"
                  />
                  Reestimar {estimatedCards.length} card{estimatedCards.length !== 1 ? "s" : ""} já com peso
                </label>
              )}
            </div>
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
                    const assignee = members?.find((m) => m.user_id === c.assignee_id)
                    return (
                      <label
                        key={c.id}
                        className={cx(
                          "group/row flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
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
                        {/* Tipo e prioridade são o que faz o host reconhecer o card
                            de relance — os mesmos ícones do board, não texto novo. */}
                        <IssueTypeIcon type={c.type} className="size-3.5 shrink-0" />
                        <span className="shrink-0 font-mono text-[10px] text-paper-400">{c.ref}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-paper">{c.title}</span>
                        <PriorityIcon priority={c.priority} className="size-3.5 shrink-0" />
                        {c.points != null && (
                          <span className="shrink-0 rounded-full bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-paper-500">
                            {c.points}
                          </span>
                        )}
                        {assignee ? (
                          <ColoredAvatar name={assignee.name} size="xs" />
                        ) : (
                          <span className="size-5 shrink-0" aria-hidden />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="py-10 text-center">
                {query.trim() ? (
                  <p className="text-xs text-paper-400">
                    Nenhum card corresponde a “{query.trim()}”.
                  </p>
                ) : (
                  <>
                    <CheckCircle2 className="mx-auto size-7 text-success" aria-hidden />
                    <p className="mt-2 text-sm font-medium text-ink dark:text-paper">
                      Todo o board já está estimado
                    </p>
                    <p className="mt-0.5 text-xs text-paper-400">
                      {estimatedCards.length > 0
                        ? "Marque “Reestimar” acima para votar um card de novo."
                        : "Crie cards no board para poder votar."}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Planning Poker"
      description="Estime cards em equipe. Entre numa sala aberta ou crie uma nova."
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : openSessions.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-paper-400">
                Salas abertas
              </p>
              <span className="text-xs text-paper-400">{openSessions.length}</span>
            </div>
            {openSessions.map((s) => {
              const isHost = s.created_by === userId
              const confirming = closingId === s.id
              return (
                <div
                  key={s.id}
                  className="group flex items-center gap-2 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2.5 transition-colors hover:border-brand-300 dark:hover:border-brand-500/40"
                >
                  <button
                    onClick={() => enterRoom(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded-lg"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink dark:text-paper">
                          {s.name}
                        </span>
                        {isHost && (
                          <span className="shrink-0 rounded bg-paper-100 dark:bg-ink-700 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-paper-500">
                            host
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-paper-400">
                        <span className={cx("size-1.5 shrink-0 rounded-full", POKER_STATUS_DOT[s.status])} />
                        {POKER_STATUS_LABEL[s.status]}
                        <span aria-hidden>·</span>
                        {s.card_ids.length} card{s.card_ids.length !== 1 ? "s" : ""}
                        {s.created_at && (
                          <>
                            <span aria-hidden>·</span>
                            {sinceLabel(s.created_at)}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                      Entrar
                    </span>
                  </button>

                  {/* Só o host encerra — é a mesma regra do backend. Confirmação
                      inline em dois passos: window.confirm trava a página e sai
                      do visual do produto. */}
                  {isHost &&
                    (confirming ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            closeSession.mutate(s.id)
                            setClosingId(null)
                          }}
                          className="rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          Encerrar
                        </button>
                        <button
                          onClick={() => setClosingId(null)}
                          className="rounded-md px-1.5 py-1 text-[11px] text-paper-500 transition-colors hover:text-ink dark:hover:text-paper"
                        >
                          Não
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setClosingId(s.id)}
                        title="Encerrar sala"
                        aria-label={`Encerrar a sala ${s.name}`}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-paper-400 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        ) : null}

        {/* Caixa tracejada só quando não há nada — com salas na lista ela lia como
            placeholder de conteúdo faltando. Com salas, o CTA vira uma linha. */}
        {openSessions.length > 0 ? (
          <button
            onClick={startPicking}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-paper-200 dark:border-ink-700 py-2.5 text-sm font-medium text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
          >
            <Plus className="size-4" aria-hidden />
            Nova sala
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-paper-300 dark:border-ink-700 px-4 py-8 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-brand-50 dark:bg-brand-500/15">
              <Spade className="size-5 text-brand-500" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium text-ink dark:text-paper">
              Nenhuma sala aberta
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-paper-400">
              Escolha os cards sem peso do board e estime em equipe, carta a carta.
            </p>
            <Button className="mx-auto mt-4" onClick={startPicking} icon={<Spade className="size-4" />}>
              Criar sala
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
