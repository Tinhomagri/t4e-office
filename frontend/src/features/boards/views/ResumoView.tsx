import { AlertCircle, CheckCircle2, Circle, Clock, Target, Users } from "lucide-react"
import { cx } from "@/shared/ui/primitives"
import type { Card, CardStatus, CardType, Member, Sprint } from "@/features/workspace/workspace.types"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
}
const STATUS_COLOR: Record<CardStatus, string> = {
  backlog: "bg-paper-300", todo: "bg-paper-400", doing: "bg-brand-500", review: "bg-warning", done: "bg-success",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature", bug: "Bug", debt: "Débito", spike: "Spike", chore: "Tarefa", epic: "Epic",
}

export function ResumoView({
  cards,
  sprints,
  members,
}: {
  cards: Card[]
  sprints: Sprint[]
  members: Member[]
}) {
  const activeSprint = sprints.find((s) => s.status === "active")
  const sprintCards = activeSprint ? cards.filter((c) => c.sprint_id === activeSprint.id) : []
  const doneCards = sprintCards.filter((c) => c.status === "done")
  const progress = sprintCards.length > 0 ? Math.round((doneCards.length / sprintCards.length) * 100) : 0

  const byStatus = Object.fromEntries(
    (["todo", "doing", "review", "done"] as CardStatus[]).map((s) => [
      s, cards.filter((c) => c.status === s).length,
    ])
  ) as Record<CardStatus, number>

  const byType = Object.fromEntries(
    (["feature", "bug", "debt", "spike", "chore", "epic"] as CardType[]).map((t) => [
      t, cards.filter((c) => c.type === t).length,
    ])
  ) as Record<CardType, number>

  const urgent = cards.filter((c) => c.priority === "urgent" && c.status !== "done")
  const overdue = cards.filter((c) => c.due_date && new Date(c.due_date) < new Date() && c.status !== "done")

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Sprint ativa */}
      <div className="lg:col-span-2 space-y-5">
        {activeSprint ? (
          <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-500">Sprint ativa</p>
                <h3 className="mt-0.5 text-lg font-semibold text-ink dark:text-paper">{activeSprint.name}</h3>
                {activeSprint.goal && (
                  <p className="mt-1 text-sm text-paper-500">{activeSprint.goal}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                {progress}% concluído
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-4 gap-3">
              {(["todo", "doing", "review", "done"] as CardStatus[]).map((s) => (
                <div key={s} className="rounded-xl bg-paper-50 dark:bg-ink-900 p-3 text-center">
                  <span className={cx("mb-1.5 inline-block size-2 rounded-full", STATUS_COLOR[s])} />
                  <p className="text-xs font-medium text-paper-500">{STATUS_LABEL[s]}</p>
                  <p className="mt-0.5 text-2xl font-bold text-ink dark:text-paper">
                    {sprintCards.filter((c) => c.status === s).length}
                  </p>
                </div>
              ))}
            </div>

            {activeSprint.start_date && activeSprint.end_date && (
              <div className="mt-4 flex items-center gap-2 text-xs text-paper-400">
                <Clock className="size-3.5" />
                {fmt(activeSprint.start_date)} → {fmt(activeSprint.end_date)}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-paper-300 bg-paper-50 dark:bg-ink-900 p-8 text-center">
            <Target className="mx-auto mb-2 size-8 text-paper-300" />
            <p className="font-medium text-paper-500">Nenhuma sprint ativa</p>
            <p className="mt-1 text-sm text-paper-400">Crie e ative uma sprint para ver o progresso aqui.</p>
          </section>
        )}

        {/* Avisos */}
        {(urgent.length > 0 || overdue.length > 0) && (
          <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-paper-500">Atenção</p>
            <div className="space-y-2">
              {urgent.map((c) => (
                <AlertRow key={c.id} icon={<AlertCircle className="size-4 text-danger" />} label={`[${c.ref}] ${c.title}`} sub="Urgente" />
              ))}
              {overdue.map((c) => (
                <AlertRow key={c.id} icon={<Clock className="size-4 text-warning" />} label={`[${c.ref}] ${c.title}`} sub={`Venceu em ${fmt(c.due_date!)}`} />
              ))}
            </div>
          </section>
        )}

        {/* Cards por tipo */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-paper-500">Cards por tipo</p>
          <div className="space-y-2">
            {(Object.keys(TYPE_LABEL) as CardType[])
              .filter((t) => byType[t] > 0)
              .sort((a, b) => byType[b] - byType[a])
              .map((t) => (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-paper-500">{TYPE_LABEL[t]}</span>
                  <div className="flex-1 h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div
                      className="h-full rounded-full bg-brand-400"
                      style={{ width: `${(byType[t] / Math.max(cards.length, 1)) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold text-ink dark:text-paper">{byType[t]}</span>
                </div>
              ))}
          </div>
        </section>
      </div>

      {/* Painel lateral */}
      <div className="space-y-5">
        {/* Total cards */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-500">Visão geral</p>
          <div className="mt-3 space-y-2">
            <Stat label="Total de cards" value={cards.length} />
            <Stat label="Em andamento" value={byStatus.doing} accent />
            <Stat label="Concluídos" value={byStatus.done} />
            <Stat label="Backlog" value={cards.filter((c) => !c.sprint_id).length} />
          </div>
        </section>

        {/* Equipe */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-3.5 text-paper-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-paper-500">Equipe</p>
          </div>
          <div className="space-y-2">
            {members.map((m) => {
              const assigned = cards.filter((c) => c.assignee_id === m.user_id && c.status !== "done")
              const done = cards.filter((c) => c.assignee_id === m.user_id && c.status === "done")
              return (
                <div key={m.user_id} className="flex items-center gap-3">
                  <InitialsDot name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">{m.name}</p>
                    <p className="text-[11px] text-paper-400">{assigned.length} abertos · {done.length} feitos</p>
                  </div>
                </div>
              )
            })}
            {members.length === 0 && (
              <p className="text-sm text-paper-400">Nenhum membro no workspace.</p>
            )}
          </div>
        </section>

        {/* Sprints */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-paper-500">Sprints</p>
          <div className="space-y-2">
            {sprints.length === 0 && <p className="text-sm text-paper-400">Nenhuma sprint criada.</p>}
            {sprints.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                {s.status === "active" ? (
                  <CheckCircle2 className="size-3.5 text-success" />
                ) : s.status === "planned" ? (
                  <Circle className="size-3.5 text-paper-300" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-paper-300" />
                )}
                <span className="flex-1 text-sm text-ink dark:text-paper">{s.name}</span>
                <span className={cx(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  s.status === "active" ? "bg-success/10 text-success" :
                  s.status === "planned" ? "bg-paper-100 dark:bg-ink-800 text-paper-500" :
                  "bg-paper-100 dark:bg-ink-800 text-paper-400",
                )}>
                  {s.status === "active" ? "Ativa" : s.status === "planned" ? "Planejada" : "Encerrada"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function AlertRow({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-paper-50 dark:bg-ink-900 px-3 py-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-medium text-ink dark:text-paper">{label}</p>
        <p className="text-[11px] text-paper-400">{sub}</p>
      </div>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-paper-500">{label}</span>
      <span className={cx("text-sm font-semibold", accent ? "text-brand-600" : "text-ink dark:text-paper")}>{value}</span>
    </div>
  )
}

function InitialsDot({ name }: { name: string }) {
  const init = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 text-[9px] font-semibold text-paper ring-1 ring-inset ring-white/10">
      {init}
    </span>
  )
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}
