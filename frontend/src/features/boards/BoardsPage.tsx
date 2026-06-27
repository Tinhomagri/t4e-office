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
import { FolderPlus, Plus, SquareKanban } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  cx,
} from "@/shared/ui/primitives"
import { RichEditor } from "@/shared/ui/RichEditor"
import {
  useCards,
  useCreateCard,
  useCreateProject,
  useCreateSprint,
  useMembers,
  useProjects,
  useSprints,
  useUpdateCard,
  useWorkspaces,
} from "@/features/workspace/workspace.hooks"
import type {
  Card,
  CardPriority,
  CardStatus,
  CardType,
  Member,
  Project,
  Sprint,
} from "@/features/workspace/workspace.types"

// --------------------------- constantes de UI ---------------------------
const COLUMNS: CardStatus[] = ["todo", "doing", "review", "done"]
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
// Prioridade por cor de barra (acento sutil, sem poluir)
const PRIORITY_BAR: Record<CardPriority, string> = {
  low: "bg-paper-300",
  medium: "bg-brand-400",
  high: "bg-warning",
  urgent: "bg-danger",
}

type Scope = { kind: "backlog" } | { kind: "sprint"; id: string }

// =============================== página ===============================
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

  useEffect(() => {
    if (projects && projects.length > 0 && !projects.some((p) => p.id === projectId)) {
      setProjectId(projects[0].id)
    }
  }, [projects, projectId])

  if (isLoading) return <CenterSpinner />

  const activeProject = projects?.find((p) => p.id === projectId) ?? null

  return (
    <div className="space-y-6">
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
        <Button variant="outline" icon={<FolderPlus className="size-4" />} onClick={() => setNewProjectOpen(true)}>
          Novo projeto
        </Button>
      </PageHeader>

      {/* Tabs de projeto */}
      {projects && projects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-paper-200 pb-px">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className={cx(
                "relative -mb-px rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
                p.id === projectId
                  ? "text-ink"
                  : "text-paper-500 hover:text-ink",
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

      {activeProject && <ProjectBoard project={activeProject} workspaceId={workspaceId} />}

      <NewProjectModal
        workspaceId={workspaceId}
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(p) => setProjectId(p.id)}
      />
    </div>
  )
}

// ============================== board ==============================
function ProjectBoard({ project, workspaceId }: { project: Project; workspaceId: string }) {
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Default: sprint ativa se existir.
  useEffect(() => {
    const active = sprints?.find((s) => s.status === "active")
    if (active) setScope({ kind: "sprint", id: active.id })
  }, [sprints])

  const scopeCards = useMemo(() => {
    const all = cards ?? []
    if (scope.kind === "backlog") return all.filter((c) => !c.sprint_id)
    return all.filter((c) => c.sprint_id === scope.id)
  }, [cards, scope])

  const activeCard = scopeCards.find((c) => c.id === activeId) ?? null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? (String(e.over.id) as CardStatus) : null
    const card = scopeCards.find((c) => c.id === String(e.active.id))
    if (!card || !overId || card.status === overId) return
    // Atualização otimista: move já no cache, reconciliação na resposta.
    qc.setQueryData<Card[]>(["cards", projectId], (old) =>
      (old ?? []).map((c) => (c.id === card.id ? { ...c, status: overId } : c)),
    )
    updateCard.mutate({ cardId: card.id, input: { status: overId } })
  }

  if (isLoading) return <CenterSpinner />

  const currentSprintId = scope.kind === "sprint" ? scope.id : null

  return (
    <div className="space-y-5">
      {/* Barra de sprint / backlog */}
      <div className="flex flex-wrap items-center gap-2">
        <ScopeChip
          active={scope.kind === "backlog"}
          onClick={() => setScope({ kind: "backlog" })}
          label="Backlog"
        />
        {(sprints ?? []).map((s) => (
          <ScopeChip
            key={s.id}
            active={scope.kind === "sprint" && scope.id === s.id}
            onClick={() => setScope({ kind: "sprint", id: s.id })}
            label={s.name}
            dot={s.status === "active"}
          />
        ))}
        <button
          onClick={() => setNewSprintOpen(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-paper-300 px-3 py-1.5 text-xs font-medium text-paper-500 transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <Plus className="size-3.5" /> Sprint
        </button>
      </div>

      {/* Kanban */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={scopeCards.filter((c) => c.status === status)}
              members={members ?? []}
              onAdd={() => setNewCardStatus(status)}
              onOpen={setOpenCard}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard ? <CardCell card={activeCard} members={members ?? []} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Modais */}
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
    </div>
  )
}

// ============================ coluna ============================
function Column({
  status,
  cards,
  members,
  onAdd,
  onOpen,
}: {
  status: CardStatus
  cards: Card[]
  members: Member[]
  onAdd: () => void
  onOpen: (c: Card) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cx(
        "flex flex-col rounded-2xl border bg-paper-100/70 p-2 transition-colors",
        isOver ? "border-brand-300 bg-brand-50/60" : "border-transparent",
      )}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{STATUS_LABEL[status]}</span>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-paper-200 px-1.5 text-[11px] font-medium text-paper-600">
            {cards.length}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="grid size-6 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-200 hover:text-ink"
          title="Adicionar card"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2 p-1">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} members={members} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <button
            onClick={onAdd}
            className="rounded-xl border border-dashed border-paper-300 py-6 text-center text-xs text-paper-400 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            + Adicionar card
          </button>
        )}
      </div>
    </div>
  )
}

function DraggableCard({
  card,
  members,
  onOpen,
}: {
  card: Card
  members: Member[]
  onOpen: (c: Card) => void
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
      <CardCell card={card} members={members} />
    </div>
  )
}

// célula visual do card (reusada no overlay de drag)
function CardCell({
  card,
  members,
  dragging = false,
}: {
  card: Card
  members: Member[]
  dragging?: boolean
}) {
  const assignee = members.find((m) => m.user_id === card.assignee_id)
  return (
    <div
      className={cx(
        "group relative overflow-hidden rounded-xl border border-paper-200 bg-paper p-3 shadow-card transition-shadow hover:shadow-panel",
        dragging && "rotate-2 shadow-pop",
      )}
    >
      <span className={cx("absolute inset-y-0 left-0 w-1", PRIORITY_BAR[card.priority])} />
      <div className="mb-1.5 flex items-center justify-between gap-2 pl-1.5">
        <span className="font-mono text-[11px] font-medium text-paper-400 tabular">{card.ref}</span>
        <Badge tone="outline">{TYPE_LABEL[card.type]}</Badge>
      </div>
      <p className="pl-1.5 text-sm leading-snug text-ink">{card.title}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2 pl-1.5">
        <span className="text-[11px] text-paper-400">{PRIORITY_LABEL[card.priority]}</span>
        <div className="flex items-center gap-2">
          {card.points != null && (
            <span className="grid size-5 place-items-center rounded-full bg-paper-100 text-[10px] font-semibold text-paper-600 tabular">
              {card.points}
            </span>
          )}
          {assignee && <InitialsDot name={assignee.name} />}
        </div>
      </div>
    </div>
  )
}

function InitialsDot({ name }: { name: string }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  return (
    <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 text-[9px] font-semibold text-paper ring-1 ring-inset ring-white/10">
      {init}
    </span>
  )
}

function ScopeChip({
  active,
  onClick,
  label,
  dot = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  dot?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-ink text-paper"
          : "border border-paper-200 bg-paper text-paper-600 hover:bg-paper-100",
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-success" />}
      {label}
    </button>
  )
}

// ============================ modais ============================
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

// drawer/modal de detalhe de card com edição rica
function CardDrawer({
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

  useEffect(() => setDraft(card), [card])

  if (!card || !draft) return null

  const set = <K extends keyof Card>(k: K, v: Card[K]) => setDraft({ ...draft, [k]: v })

  const save = async () => {
    await updateCard.mutateAsync({
      cardId: card.id,
      input: {
        title: draft.title,
        description: draft.description,
        status: draft.status,
        type: draft.type,
        priority: draft.priority,
        points: draft.points,
        assignee_id: draft.assignee_id,
        sprint_id: draft.sprint_id,
      },
    })
    onClose()
  }

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      size="lg"
      title={card.ref}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={save} loading={updateCard.isPending}>
            Salvar alterações
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          className="!text-base font-semibold"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set("status", e.target.value as CardStatus)}>
              {(["backlog", ...COLUMNS] as CardStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={draft.type} onChange={(e) => set("type", e.target.value as CardType)}>
              {(Object.keys(TYPE_LABEL) as CardType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={draft.priority} onChange={(e) => set("priority", e.target.value as CardPriority)}>
              {(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pontos">
            <Input
              type="number"
              min={0}
              value={draft.points ?? ""}
              onChange={(e) => set("points", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="—"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsável">
            <Select
              value={draft.assignee_id ?? ""}
              onChange={(e) => set("assignee_id", e.target.value || null)}
            >
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sprint">
            <Select
              value={draft.sprint_id ?? ""}
              onChange={(e) => set("sprint_id", e.target.value || null)}
            >
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Descrição">
          <RichEditor value={draft.description} onChange={(html) => set("description", html)} />
        </Field>
      </div>
    </Modal>
  )
}

// ============================ auxiliares ============================
function CenterSpinner() {
  return (
    <div className="grid place-items-center py-20">
      <Spinner className="size-6" />
    </div>
  )
}

function CreateWorkspacePrompt() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="text-lg font-semibold text-ink">Nenhum workspace ainda</h2>
      <p className="mt-1 text-sm text-paper-500">
        Seu workspace pessoal deveria existir. Recarregue a página ou contate o suporte.
      </p>
    </div>
  )
}

function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-paper-300 bg-paper-50 py-16 text-center">
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <SquareKanban className="size-6" />
      </div>
      <p className="text-sm font-semibold text-ink">Crie seu primeiro projeto</p>
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
