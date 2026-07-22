// Kanban do funil comercial. Reusa o vocabulário tátil do board de projetos
// (KanbanView): card levantado com tilt no DragOverlay, coluna "respirando"
// como drop zone e assentamento com spring no drop. A leitura nova é o
// cabeçalho da coluna: contagem, soma do valor e soma ponderada (valor ×
// probabilidade), com uma barra que anima quando o peso do funil muda.
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { AnimatePresence, motion } from "framer-motion"
import { Building2, CalendarClock, Plus, Settings2, Target, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"

import { EASE, dropZone, liftCard, settleSpring, springSmooth } from "@/shared/lib/motion"
import { Button, EmptyState, Field, Input, Modal, Select, Spinner, cx } from "@/shared/ui/primitives"

import { DealDrawer } from "../DealDrawer"
import { ManageStagesModal } from "../ManageStagesModal"
import {
  useCreateDeal,
  useCustomers,
  useDeals,
  useMoveDealStage,
  useStages,
} from "../sales.hooks"
import {
  closeDateState,
  columnTotals,
  dealAmount,
  formatDate,
  formatMoney,
  type DueState,
} from "../sales.shared"
import type { Deal, PipelineStage } from "../sales.types"

const DUE_CHIP: Record<DueState, string> = {
  overdue: "bg-danger/10 text-danger",
  today: "bg-warning/15 text-warning",
  soon: "bg-brand-50 text-brand-700",
  far: "bg-paper-100 dark:bg-ink-800 text-paper-500",
}

export function PipelineView({ workspaceId }: { workspaceId: string | null }) {
  const { data: stages, isLoading: loadingStages } = useStages(workspaceId)
  const { data: deals, isLoading: loadingDeals } = useDeals(workspaceId)
  const { data: customers } = useCustomers(workspaceId)
  const moveDeal = useMoveDealStage(workspaceId)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [openDeal, setOpenDeal] = useState<Deal | null>(null)
  const [createIn, setCreateIn] = useState<PipelineStage | null>(null)
  const [manageStages, setManageStages] = useState(false)

  // Toque: exige 180ms parado antes de arrastar, senão o scroll horizontal da
  // board no mobile viraria drag acidental.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const columns = stages ?? []
  const allDeals = useMemo(() => deals ?? [], [deals])
  const activeDeal = allDeals.find((d) => d.id === activeId) ?? null

  // Maior soma ponderada entre as colunas — normaliza a barra de peso do funil.
  const maxWeighted = useMemo(() => {
    let max = 0
    for (const stage of columns) {
      const { weighted } = columnTotals(allDeals.filter((d) => d.stage_id === stage.id))
      if (weighted > max) max = weighted
    }
    return max
  }, [columns, allDeals])

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const over = e.over?.id ? String(e.over.id) : null
    const deal = allDeals.find((d) => d.id === String(e.active.id))
    if (!deal || !over) return

    // Soltou sobre um card: entra logo acima dele, na coluna daquele card.
    if (over.startsWith("deal:")) {
      const targetId = over.slice(5)
      if (targetId === deal.id) return
      const target = allDeals.find((d) => d.id === targetId)
      if (!target) return

      // Vizinhos na coluna de destino, ignorando o card arrastado.
      const column = allDeals
        .filter((d) => d.stage_id === target.stage_id && d.id !== deal.id)
        .sort((a, b) => a.rank.localeCompare(b.rank))
      const at = column.findIndex((d) => d.id === targetId)
      if (at === -1) return

      moveDeal.mutate({
        dealId: deal.id,
        stageId: target.stage_id,
        previousDealId: at > 0 ? column[at - 1].id : null,
        nextDealId: targetId,
      })
      return
    }

    // Soltou na coluna: vai para o fim dela.
    if (deal.stage_id === over) return
    moveDeal.mutate({ dealId: deal.id, stageId: over })
  }

  if (loadingStages || loadingDeals) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (columns.length === 0) {
    return (
      <EmptyState
        icon={<Target className="size-6" />}
        title="Funil ainda não configurado"
        description="Os estágios padrão são criados junto com o workspace. Recarregue a página em instantes."
      />
    )
  }

  // Mantém a referência do drawer sempre fresca em relação ao cache.
  const drawerDeal = openDeal ? (allDeals.find((d) => d.id === openDeal.id) ?? openDeal) : null

  return (
    <div className="flex flex-col gap-4">
      <PipelineSummary deals={allDeals} stages={columns} />

      <div className="flex justify-end">
        <button
          onClick={() => setManageStages(true)}
          className="chip-neutral flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors sm:py-1.5"
        >
          <Settings2 className="size-3.5" /> Estágios
        </button>
      </div>

      {/* Breakout de largura total, alinhado ao padding do main (4 mobile / 6 sm+). */}
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-4 scrollbar-slim sm:-mx-6 sm:px-6">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3" style={{ minWidth: `${columns.length * 288}px` }}>
            {columns.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={allDeals.filter((d) => d.stage_id === stage.id)}
                maxWeighted={maxWeighted}
                onOpen={setOpenDeal}
                onCreate={() => setCreateIn(stage)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDeal ? (
              <motion.div
                initial={{ scale: 1, rotate: 0 }}
                animate={{ scale: 1.04, rotate: -2.5 }}
                transition={liftCard}
                className="w-[264px] cursor-grabbing"
              >
                <DealCell deal={activeDeal} dragging />
              </motion.div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <ManageStagesModal
        open={manageStages}
        onClose={() => setManageStages(false)}
        workspaceId={workspaceId}
        stages={columns}
      />

      {createIn && (
        <CreateDealModal
          workspaceId={workspaceId}
          stage={createIn}
          customers={customers ?? []}
          onClose={() => setCreateIn(null)}
        />
      )}

      <AnimatePresence>
        {drawerDeal && (
          <DealDrawer
            key={drawerDeal.id}
            deal={drawerDeal}
            workspaceId={workspaceId}
            stages={columns}
            onClose={() => setOpenDeal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Resumo do funil ─────────────────────────────────────────────────────────

function PipelineSummary({ deals, stages }: { deals: Deal[]; stages: PipelineStage[] }) {
  const openStageIds = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id))
  const open = deals.filter((d) => openStageIds.has(d.stage_id))
  const { count, total, weighted } = columnTotals(open)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryTile label="Negócios em aberto" value={String(count)} icon={<Target className="size-4" />} />
      <SummaryTile label="Valor total no funil" value={formatMoney(total)} icon={<TrendingUp className="size-4" />} />
      <SummaryTile
        label="Previsão ponderada"
        value={formatMoney(weighted)}
        icon={<TrendingUp className="size-4" />}
        highlight
      />
    </div>
  )
}

function SummaryTile({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3",
        highlight
          ? "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-900/20"
          : "border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-paper-500">
        {icon}
        {label}
      </div>
      {/* key = valor: remonta e reanima quando o número muda (feedback do drop). */}
      <motion.p
        key={value}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSmooth}
        className={cx(
          "mt-1 text-xl font-bold tabular tracking-tight",
          highlight ? "text-brand-700 dark:text-brand-300" : "text-ink dark:text-paper",
        )}
      >
        {value}
      </motion.p>
    </div>
  )
}

// ─── Coluna ──────────────────────────────────────────────────────────────────

function StageColumn({
  stage,
  deals,
  maxWeighted,
  onOpen,
  onCreate,
}: {
  stage: PipelineStage
  deals: Deal[]
  maxWeighted: number
  onOpen: (deal: Deal) => void
  onCreate: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const { count, total, weighted } = columnTotals(deals)
  const ratio = maxWeighted > 0 ? weighted / maxWeighted : 0

  return (
    <motion.div
      ref={setNodeRef}
      variants={dropZone}
      animate={isOver ? "over" : "idle"}
      className={cx(
        "flex max-h-[calc(100vh-24rem)] w-[272px] shrink-0 flex-col rounded-2xl border-2 will-change-transform",
        "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        isOver
          ? "border-brand-400 bg-brand-50/80 shadow-brand-glow dark:bg-brand-900/20"
          : "border-transparent bg-paper-100/70 dark:bg-ink-900/60",
      )}
    >
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full shadow-sm"
              style={{ backgroundColor: stage.color }}
            />
            <span className="truncate text-[12px] font-bold uppercase tracking-wider text-paper-600 dark:text-paper-400">
              {stage.name}
            </span>
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-paper-200 px-1.5 text-[11px] font-semibold text-paper-600 dark:bg-ink-800 dark:text-paper-400">
              {count}
            </span>
          </div>
          <button
            onClick={onCreate}
            aria-label={`Novo negócio em ${stage.name}`}
            className="grid size-11 shrink-0 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-200 hover:text-ink dark:hover:bg-ink-700 dark:hover:text-paper sm:size-6"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Soma do valor e soma ponderada (valor × probabilidade). */}
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] tabular">
          <span className="font-semibold text-ink dark:text-paper">{formatMoney(total)}</span>
          <span className="text-paper-500" title="Soma ponderada pela probabilidade">
            ~{formatMoney(weighted)}
          </span>
        </div>

        {/* Barra de peso: quanto essa coluna representa da maior previsão. */}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-200 dark:bg-ink-800">
          {/* origin-left + scaleX: anima na GPU, sem reflow de largura. */}
          <motion.div
            className="h-full origin-left rounded-full"
            style={{ backgroundColor: stage.color }}
            initial={false}
            animate={{ scaleX: ratio }}
            transition={{ duration: 0.4, ease: EASE }}
          />
        </div>
      </div>

      <div className="flex min-h-[80px] flex-col gap-2 overflow-y-auto px-2 pb-3 scrollbar-slim">
        <AnimatePresence initial={false}>
          {deals.map((deal) => (
            <DraggableDeal key={deal.id} deal={deal} onOpen={onOpen} />
          ))}
        </AnimatePresence>
        {deals.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] text-paper-400">
            Arraste um negócio para cá
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

function DraggableDeal({ deal, onOpen }: { deal: Deal; onOpen: (d: Deal) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id })
  // O card também é alvo de drop: soltar sobre outro card posiciona o negócio
  // naquele ponto da coluna (reordenação), em vez de mandá-lo para o fim.
  const { setNodeRef: setDropRef } = useDroppable({ id: `deal:${deal.id}` })
  // Mesmo motivo do KanbanView: com um drag ativo, a animação de layout reflui
  // os vizinhos a cada frame e "treme". Desliga durante o drag, religa no drop
  // para o card deslizar até a nova coluna com o spring de assentamento.
  const { active } = useDndContext()
  const dragActive = active != null

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      layout={dragActive ? false : "position"}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{
        opacity: isDragging ? 0.35 : 1,
        scale: isDragging ? 0.96 : 1,
      }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={settleSpring}
      onClick={() => onOpen(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(deal)
        }
      }}
      className="cursor-grab touch-none rounded-md focus-ring active:cursor-grabbing"
    >
      <div ref={setDropRef}>
        <DealCell deal={deal} />
      </div>
    </motion.div>
  )
}

export function DealCell({ deal, dragging = false }: { deal: Deal; dragging?: boolean }) {
  const due = closeDateState(deal.expected_close_date)

  return (
    <div
      className={cx(
        "group relative overflow-hidden rounded-md border border-paper-200 bg-paper px-3 py-2.5 shadow-card dark:border-ink-700 dark:bg-ink-800 dark:shadow-none",
        "transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        "hover:-translate-y-1 hover:border-paper-300 hover:shadow-panel dark:hover:border-ink-600",
        "active:translate-y-0 active:shadow-card active:duration-75",
        dragging && "shadow-pop ring-1 ring-ink/10",
      )}
    >
      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink dark:text-paper">
        {deal.title}
      </p>

      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-paper-500">
        <Building2 className="size-3 shrink-0" />
        {deal.customer_name || "Sem cliente"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold tabular text-ink dark:text-paper">
          {formatMoney(dealAmount(deal), deal.currency)}
        </span>
        <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[10px] font-semibold tabular text-paper-600 dark:bg-ink-900 dark:text-paper-400">
          {deal.probability}%
        </span>
        {due && (
          <span
            className={cx(
              "ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              DUE_CHIP[due],
            )}
          >
            <CalendarClock className="size-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Criação rápida ──────────────────────────────────────────────────────────

function CreateDealModal({
  workspaceId,
  stage,
  customers,
  onClose,
}: {
  workspaceId: string | null
  stage: PipelineStage
  customers: { id: string; name: string }[]
  onClose: () => void
}) {
  const createDeal = useCreateDeal(workspaceId)
  const [title, setTitle] = useState("")
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!title.trim()) return setError("Informe o título do negócio.")
    if (!customerId) return setError("Selecione um cliente.")
    await createDeal.mutateAsync({
      title: title.trim(),
      customer_id: customerId,
      stage_id: stage.id,
      amount: amount || "0",
      probability: stage.probability_default,
    })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo negócio"
      description={`Será criado no estágio "${stage.name}".`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={createDeal.isPending}>
            Criar negócio
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Título">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Implantação do portal"
            autoFocus
          />
        </Field>

        <Field label="Cliente">
          {customers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-paper-300 px-3 py-2 text-sm text-paper-500">
              Cadastre um cliente na aba Clientes antes de criar negócios.
            </p>
          ) : (
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Valor estimado" hint="Somente números, em reais.">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
