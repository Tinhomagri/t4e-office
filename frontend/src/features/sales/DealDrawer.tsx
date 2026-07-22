// Detalhe do negócio. Segue o padrão do CardDrawer: autosave por campo (blur
// grava, sem botão "Salvar"), painel lateral com metadados e corpo com a
// timeline de atividades. Full-screen no mobile, painel de 5xl no desktop.
import { AnimatePresence, motion } from "framer-motion"
import {
  Award,
  Building2,
  CalendarClock,
  Check,
  CircleSlash,
  Loader2,
  MessageSquare,
  Send,
  Users,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { settleSpring, springSmooth } from "@/shared/lib/motion"
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cx,
} from "@/shared/ui/primitives"

import {
  useCreateActivity,
  useDealActivities,
  useDealHistory,
  useLoseDeal,
  useToggleActivity,
  useUpdateDeal,
  useWinDeal,
} from "./sales.hooks"
import { ACTIVITY_LABEL, dealAmount, formatDateTime, formatMoney } from "./sales.shared"
import type { ActivityKind, Deal, PipelineStage, UpdateDealInput } from "./sales.types"

const ACTIVITY_TONE: Record<ActivityKind, string> = {
  note: "bg-paper-100 text-paper-600 dark:bg-ink-800 dark:text-paper-400",
  task: "bg-brand-50 text-brand-700",
  meeting: "bg-success/10 text-success",
}

export function DealDrawer({
  deal,
  workspaceId,
  stages,
  onClose,
}: {
  deal: Deal
  workspaceId: string | null
  stages: PipelineStage[]
  onClose: () => void
}) {
  const updateDeal = useUpdateDeal(workspaceId)
  const [draft, setDraft] = useState<Deal>(deal)
  const [savedHint, setSavedHint] = useState(false)
  const [winOpen, setWinOpen] = useState(false)
  const [loseOpen, setLoseOpen] = useState(false)

  useEffect(() => setDraft(deal), [deal])

  // Fecha com Esc — o drawer é modal, precisa de saída pelo teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = <K extends keyof Deal>(k: K, v: Deal[K]) => setDraft((d) => ({ ...d, [k]: v }))

  // Autosave por campo: grava imediatamente e pisca a confirmação.
  const persist = async (patch: UpdateDealInput) => {
    await updateDeal.mutateAsync({ dealId: deal.id, input: patch })
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 1500)
  }

  const stage = stages.find((s) => s.id === draft.stage_id)
  const isClosed = stage?.kind === "won" || stage?.kind === "lost"

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-0 sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      />

      <motion.div
        role="dialog"
        aria-label={`Negócio ${deal.title}`}
        // Painel "puxado" da direita — mesma assinatura do CardDrawer.
        initial={{ opacity: 0, x: 48, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 48, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
        className="relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-none border-paper-200 bg-white text-ink shadow-xl will-change-transform dark:border-ink-700 dark:bg-ink-900 dark:text-paper sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-paper-200 bg-white px-4 py-2.5 dark:border-ink-700 dark:bg-ink-900">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {stage && (
              <Badge
                tone={stage.kind === "won" ? "success" : stage.kind === "lost" ? "danger" : "brand"}
                className="rounded-full"
              >
                {stage.name}
              </Badge>
            )}
            <Badge tone="outline" className="rounded-full tabular">
              {formatMoney(dealAmount(draft), draft.currency)}
            </Badge>
            <AnimatePresence>
              {savedHint && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={springSmooth}
                  className="flex items-center gap-1 text-xs font-medium text-success"
                >
                  <Check className="size-3" /> salvo
                </motion.span>
              )}
            </AnimatePresence>
            {updateDeal.isPending && <Loader2 className="size-3.5 animate-spin text-paper-400" />}
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar detalhe do negócio"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper sm:size-8"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo: conteúdo + painel lateral */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto scrollbar-slim lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6 p-4 sm:p-5">
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              onBlur={() => draft.title !== deal.title && persist({ title: draft.title })}
              aria-label="Título do negócio"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold text-ink outline-none transition-colors hover:bg-paper-50 focus:border-brand-300 focus:bg-paper dark:text-paper dark:hover:bg-ink-800 dark:focus:bg-ink-800"
            />

            <p className="flex items-center gap-1.5 px-2 text-sm text-paper-500">
              <Building2 className="size-4" />
              {deal.customer_name || "Sem cliente vinculado"}
            </p>

            {/* Ações de fechamento */}
            <div className="flex flex-wrap gap-2 px-2">
              <Button
                icon={<Award className="size-4" />}
                onClick={() => setWinOpen(true)}
                disabled={isClosed}
                className="min-h-11 flex-1 sm:flex-none"
              >
                Ganhar
              </Button>
              <Button
                variant="outline"
                icon={<CircleSlash className="size-4" />}
                onClick={() => setLoseOpen(true)}
                disabled={isClosed}
                className="min-h-11 flex-1 sm:flex-none"
              >
                Perder
              </Button>
            </div>

            {isClosed && deal.lost_reason && (
              <div className="mx-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                <strong className="font-semibold">Motivo da perda:</strong> {deal.lost_reason}
                {deal.lost_notes && <p className="mt-1 text-paper-600">{deal.lost_notes}</p>}
              </div>
            )}

            <ActivityTimeline dealId={deal.id} />
            <HistoryList dealId={deal.id} />
          </div>

          {/* Painel lateral: campos com autosave */}
          <aside className="space-y-3 border-t border-paper-200 bg-paper-50/60 p-4 dark:border-ink-700 dark:bg-ink-900/60 lg:border-l lg:border-t-0">
            <Field label="Estágio">
              <Select
                value={draft.stage_id}
                onChange={(e) => {
                  set("stage_id", e.target.value)
                  void persist({ stage_id: e.target.value } as UpdateDealInput)
                }}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Valor">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                onBlur={() => draft.amount !== deal.amount && persist({ amount: draft.amount })}
              />
            </Field>

            <Field label="Probabilidade (%)" hint="Editar aqui congela o valor ao mudar de estágio.">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.probability}
                onChange={(e) => set("probability", Number(e.target.value))}
                onBlur={() =>
                  draft.probability !== deal.probability &&
                  persist({ probability: draft.probability })
                }
              />
            </Field>

            <Field label="Previsão de fechamento">
              <Input
                type="date"
                value={draft.expected_close_date ?? ""}
                onChange={(e) => set("expected_close_date", e.target.value || null)}
                onBlur={() =>
                  draft.expected_close_date !== deal.expected_close_date &&
                  persist({ expected_close_date: draft.expected_close_date })
                }
              />
            </Field>

            <Field label="Origem">
              <Input
                value={draft.source}
                onChange={(e) => set("source", e.target.value)}
                onBlur={() => draft.source !== deal.source && persist({ source: draft.source })}
                placeholder="Ex: Indicação, LinkedIn…"
              />
            </Field>

            {deal.delivery_project_id && (
              <p className="flex items-center gap-1.5 rounded-xl bg-success/10 px-3 py-2 text-xs font-medium text-success">
                <Check className="size-3.5" /> Projeto de entrega criado
              </p>
            )}
          </aside>
        </div>
      </motion.div>

      {winOpen && (
        <WinDealModal
          deal={deal}
          workspaceId={workspaceId}
          onClose={() => setWinOpen(false)}
        />
      )}
      {loseOpen && (
        <LoseDealModal
          deal={deal}
          workspaceId={workspaceId}
          onClose={() => setLoseOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Ganhar ──────────────────────────────────────────────────────────────────

function WinDealModal({
  deal,
  workspaceId,
  onClose,
}: {
  deal: Deal
  workspaceId: string | null
  onClose: () => void
}) {
  const winDeal = useWinDeal(workspaceId)
  // Já existe projeto vinculado? A criação é idempotente no backend; aqui a
  // opção nem aparece marcada para não sugerir que criaria um segundo.
  const [createProject, setCreateProject] = useState(!deal.delivery_project_id)

  const confirm = async () => {
    await winDeal.mutateAsync({
      dealId: deal.id,
      input: { create_delivery_project: createProject && !deal.delivery_project_id },
    })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Marcar negócio como ganho"
      description={`${deal.title} — ${formatMoney(dealAmount(deal), deal.currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Award className="size-4" />} onClick={confirm} loading={winDeal.isPending}>
            Confirmar ganho
          </Button>
        </>
      }
    >
      {deal.delivery_project_id ? (
        <p className="text-sm text-paper-600">
          Este negócio já tem um projeto de entrega vinculado. Nenhum novo projeto será criado.
        </p>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-paper-200 px-3 py-3 transition-colors hover:bg-paper-50 dark:border-ink-700 dark:hover:bg-ink-800">
          <input
            type="checkbox"
            checked={createProject}
            onChange={(e) => setCreateProject(e.target.checked)}
            className="mt-0.5 size-4 accent-brand-500"
          />
          <span className="text-sm">
            <span className="font-medium text-ink dark:text-paper">
              Criar projeto de entrega
            </span>
            <span className="mt-0.5 block text-paper-500">
              Abre um projeto ligado a este negócio para o time de operação tocar a entrega.
            </span>
          </span>
        </label>
      )}
    </Modal>
  )
}

// ─── Perder ──────────────────────────────────────────────────────────────────

const LOSS_REASONS = [
  "Preço",
  "Concorrente",
  "Sem orçamento",
  "Sem resposta",
  "Fora do escopo",
  "Outro",
]

function LoseDealModal({
  deal,
  workspaceId,
  onClose,
}: {
  deal: Deal
  workspaceId: string | null
  onClose: () => void
}) {
  const loseDeal = useLoseDeal(workspaceId)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    // Regra do spec: perder exige motivo.
    if (!reason) {
      setError("Selecione o motivo da perda.")
      return
    }
    await loseDeal.mutateAsync({ dealId: deal.id, input: { lost_reason: reason, lost_notes: notes } })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Marcar negócio como perdido"
      description={deal.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} loading={loseDeal.isPending}>
            Confirmar perda
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo da perda">
          <Select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
          >
            <option value="">Selecione…</option>
            {LOSS_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Detalhes (opcional)">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="O que aconteceu?"
          />
        </Field>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-danger"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  )
}

// ─── Timeline de atividades ──────────────────────────────────────────────────

function ActivityTimeline({ dealId }: { dealId: string }) {
  const { data: activities } = useDealActivities(dealId)
  const createActivity = useCreateActivity(dealId)
  const toggleActivity = useToggleActivity(dealId)

  const [kind, setKind] = useState<ActivityKind>("note")
  const [content, setContent] = useState("")
  const [dueDate, setDueDate] = useState("")

  const submit = async () => {
    if (!content.trim()) return
    await createActivity.mutateAsync({
      kind,
      content: content.trim(),
      due_date: kind === "task" && dueDate ? dueDate : null,
    })
    setContent("")
    setDueDate("")
  }

  const list = activities ?? []

  return (
    <section className="px-2">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
        <MessageSquare className="size-4" /> Atividades
      </h3>

      {/* Composer */}
      <div className="rounded-xl border border-paper-200 p-3 dark:border-ink-700">
        <div className="flex flex-wrap gap-2">
          {(["note", "task", "meeting"] as ActivityKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cx(
                "min-h-11 rounded-full px-3 text-xs font-medium transition-colors sm:min-h-0 sm:py-1.5",
                kind === k
                  ? "bg-brand-500 text-white"
                  : "bg-paper-100 text-paper-600 hover:bg-paper-200 dark:bg-ink-800 dark:text-paper-400",
              )}
            >
              {ACTIVITY_LABEL[k]}
            </button>
          ))}
        </div>

        <Textarea
          rows={2}
          className="mt-2"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            kind === "meeting"
              ? "Assunto da reunião (será criada no Google Calendar)"
              : kind === "task"
                ? "O que precisa ser feito?"
                : "Escreva uma nota…"
          }
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {kind === "task" && (
            <Input
              type="date"
              className="w-auto"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Prazo da tarefa"
            />
          )}
          <Button
            size="sm"
            className="ml-auto min-h-11 sm:min-h-0"
            icon={<Send className="size-3.5" />}
            onClick={submit}
            loading={createActivity.isPending}
          >
            Registrar
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <ul className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {list.map((a) => {
            const done = !!a.done_at
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={settleSpring}
                className="flex gap-3"
              >
                <span
                  className={cx(
                    "mt-0.5 h-fit rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    ACTIVITY_TONE[a.kind],
                  )}
                >
                  {ACTIVITY_LABEL[a.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      "text-sm text-ink dark:text-paper",
                      done && "text-paper-400 line-through",
                    )}
                  >
                    {a.content}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-paper-400">
                    <span>{a.author_name || "—"}</span>
                    <span>{formatDateTime(a.created_at)}</span>
                    {a.due_date && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3" /> {a.due_date}
                      </span>
                    )}
                    {a.google_event_id && (
                      <span className="flex items-center gap-1 text-success">
                        <Users className="size-3" /> no Google Calendar
                      </span>
                    )}
                  </p>
                </div>
                {a.kind === "task" && (
                  <button
                    onClick={() => toggleActivity.mutate({ activityId: a.id, done: !done })}
                    aria-pressed={done}
                    aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                    className={cx(
                      "grid size-11 shrink-0 place-items-center rounded-lg transition-colors sm:size-8",
                      done
                        ? "text-success"
                        : "text-paper-400 hover:bg-paper-100 hover:text-success dark:hover:bg-ink-800",
                    )}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {list.length === 0 && (
        <p className="mt-4 text-sm text-paper-400">Nenhuma atividade registrada ainda.</p>
      )}
    </section>
  )
}

// ─── Histórico ───────────────────────────────────────────────────────────────

function HistoryList({ dealId }: { dealId: string }) {
  const { data: history } = useDealHistory(dealId)
  const list = history ?? []
  if (list.length === 0) return null

  return (
    <section className="px-2">
      <h3 className="mb-2 text-sm font-semibold text-ink dark:text-paper">Histórico</h3>
      <ul className="space-y-1.5">
        {list.map((h) => (
          <li key={h.id} className="text-[11px] text-paper-500">
            <span className="font-medium text-paper-600">{h.author_name}</span> alterou{" "}
            <span className="font-medium">{h.field}</span> de "{h.from_value}" para "{h.to_value}" ·{" "}
            {formatDateTime(h.at)}
          </li>
        ))}
      </ul>
    </section>
  )
}
