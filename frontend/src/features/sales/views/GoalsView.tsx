// Tela de Metas & Forecast: meta geral do workspace + metas por vendedor, com
// atingimento e forecast ponderado do mês selecionado.
import { useMemo, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, Plus, Sparkles, Target, Trash2, Users } from "lucide-react"

import { useMembers } from "@/features/workspace/workspace.hooks"
import { Button, EmptyState, Modal, Skeleton, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { formatMoney } from "../proposals.shared"
import { useCreateGoal, useDeleteGoal, useGoalForecast } from "../goals.hooks"
import type { GoalProgress } from "../goals.types"

interface Props {
  workspaceId: string
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
}

function attainmentTone(pct: number): string {
  if (pct >= 100) return "bg-success-500"
  if (pct >= 60) return "bg-brand-500"
  return "bg-warning-500"
}

export function GoalsView({ workspaceId }: Props) {
  const [period, setPeriod] = useState(currentPeriod)
  const [creating, setCreating] = useState(false)
  const [newOwnerId, setNewOwnerId] = useState("")
  const [newTarget, setNewTarget] = useState("")

  const { data: forecast, isLoading } = useGoalForecast(workspaceId, period)
  const { data: members = [] } = useMembers(workspaceId)
  const create = useCreateGoal(workspaceId, period)
  const remove = useDeleteGoal(workspaceId, period)

  const goals = forecast?.goals ?? []
  const workspaceGoal = goals.find((g) => g.owner_id === null) ?? null
  const ownerGoals = useMemo(
    () => goals.filter((g) => g.owner_id !== null),
    [goals],
  )
  const memberName = (userId: string) =>
    members.find((m) => m.user_id === userId)?.name ?? "Ex-membro"

  const availableOwners = members.filter(
    (m) => !ownerGoals.some((g) => g.owner_id === m.user_id),
  )
  const canScopeGeneral = !workspaceGoal
  const targetValue = Number(newTarget.replace(",", "."))
  const targetInvalid = newTarget.trim() !== "" && (!Number.isFinite(targetValue) || targetValue <= 0)

  function openCreate() {
    setNewOwnerId(canScopeGeneral ? "" : (availableOwners[0]?.user_id ?? ""))
    setNewTarget("")
    setCreating(true)
  }

  async function handleCreate() {
    const target = newTarget.trim().replace(",", ".")
    if (!target || Number(target) <= 0) {
      toast.error("Informe um valor de meta maior que zero.")
      return
    }
    await create.mutateAsync({
      period,
      target_amount: target,
      owner_id: newOwnerId || null,
    })
    setCreating(false)
    setNewOwnerId("")
    setNewTarget("")
  }

  return (
    <div className="space-y-5">
      {/* Header + navegação de período */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink dark:text-paper">Metas & forecast</h3>
          <p className="text-sm text-paper-500">
            Quanto cada vendedor precisa fechar e o quanto já está encaminhado.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setPeriod((p) => shiftPeriod(p, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize text-ink dark:text-paper">
            {periodLabel(period)}
          </span>
          <Button size="sm" variant="outline" onClick={() => setPeriod((p) => shiftPeriod(p, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={openCreate} className="ml-2">
            Nova meta
          </Button>
        </div>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nova meta"
        description={`Defina o alvo para ${periodLabel(period)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              icon={<Sparkles className="size-3.5" />}
              loading={create.isPending}
              disabled={
                targetInvalid ||
                !newTarget.trim() ||
                (!canScopeGeneral && availableOwners.length === 0)
              }
              onClick={handleCreate}
            >
              Criar meta
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Cabeçalho visual: ícone com glow da marca, reforça o contexto da ação */}
          <div className="flex items-center gap-3 rounded-2xl border border-paper-200 bg-gradient-to-br from-brand-50 to-paper p-4 dark:border-ink-700 dark:from-brand-950/30 dark:to-ink-900">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-brand-glow">
              <Target className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-paper">
                Meta comercial · {periodLabel(period)}
              </p>
              <p className="truncate text-xs text-paper-500">
                Acompanhamento automático via forecast ponderado do funil.
              </p>
            </div>
          </div>

          {/* Escopo — chips em vez de <select>: a escolha vira algo que se vê, não que se lê */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink dark:text-paper">
              <Users className="size-3.5 text-paper-400" /> Escopo da meta
            </p>
            <div className="flex flex-wrap gap-2">
              {canScopeGeneral && (
                <ScopeChip
                  active={newOwnerId === ""}
                  onClick={() => setNewOwnerId("")}
                  label="Geral do workspace"
                  icon={<Target className="size-3.5" />}
                />
              )}
              {availableOwners.map((m) => (
                <ScopeChip
                  key={m.user_id}
                  active={newOwnerId === m.user_id}
                  onClick={() => setNewOwnerId(m.user_id)}
                  label={m.name}
                  initials={m.name.slice(0, 2).toUpperCase()}
                />
              ))}
              {!canScopeGeneral && availableOwners.length === 0 && (
                <p className="text-xs text-paper-500">
                  Todo mundo já tem meta neste mês — remova uma para reatribuir.
                </p>
              )}
            </div>
          </div>

          {/* Valor — símbolo fixo + número grande, com prévia formatada em tempo real */}
          <div>
            <label
              htmlFor="goal-target-amount"
              className="mb-2 block text-[13px] font-medium text-ink dark:text-paper"
            >
              Valor da meta
            </label>
            <div
              className={cx(
                "flex items-center gap-2 rounded-xl border bg-paper px-4 py-3 transition-colors dark:bg-ink-900",
                targetInvalid
                  ? "border-danger-400 ring-1 ring-danger-400/30"
                  : "border-paper-300 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400/30 dark:border-ink-700",
              )}
            >
              <span className="text-lg font-semibold text-paper-400">R$</span>
              <input
                id="goal-target-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="w-full bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-paper-300 dark:text-paper"
              />
            </div>
            {targetInvalid ? (
              <p className="mt-1.5 text-xs font-medium text-danger-500">
                Informe um valor maior que zero.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-paper-500">
                {newTarget.trim() ? formatMoney(targetValue || 0) : "Ex.: 50.000,00"}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : goals.length === 0 && !creating ? (
        <EmptyState
          icon={<Target className="size-6" />}
          title="Nenhuma meta definida"
          description="Defina a meta geral do workspace ou a meta individual de cada vendedor para este mês."
          action={
            <Button icon={<Plus className="size-3.5" />} onClick={openCreate}>
              Nova meta
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {workspaceGoal && (
            <GoalCard
              goal={workspaceGoal}
              label="Meta geral do workspace"
              onDelete={() => remove.mutate(workspaceGoal.id)}
            />
          )}
          {ownerGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              label={memberName(goal.owner_id as string)}
              onDelete={() => remove.mutate(goal.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScopeChip({
  active,
  onClick,
  label,
  icon,
  initials,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: ReactNode
  initials?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all active:scale-[0.97]",
        active
          ? "border-brand-400 bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-400/40 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300"
          : "border-paper-300 bg-paper text-paper-600 hover:border-paper-400 hover:bg-paper-50 dark:border-ink-700 dark:bg-ink-900 dark:text-paper-400 dark:hover:bg-ink-800",
      )}
    >
      {icon ? (
        <span className={active ? "text-brand-600 dark:text-brand-300" : "text-paper-400"}>
          {icon}
        </span>
      ) : (
        <span
          className={cx(
            "grid size-4 place-items-center rounded-full text-[9px] font-bold",
            active
              ? "bg-brand-500 text-white"
              : "bg-paper-200 text-paper-600 dark:bg-ink-700 dark:text-paper-300",
          )}
        >
          {initials}
        </span>
      )}
      {label}
    </button>
  )
}

function GoalCard({
  goal,
  label,
  onDelete,
}: {
  goal: GoalProgress
  label: string
  onDelete: () => void
}) {
  const pct = Math.min(goal.attainment_pct, 100)
  const forecastPct = Math.min(
    ((Number(goal.achieved_amount) + Number(goal.forecast_weighted_amount)) /
      Number(goal.target_amount || 1)) *
      100,
    100,
  )

  return (
    <div className="rounded-2xl border border-paper-200 bg-paper p-4 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink dark:text-paper">{label}</p>
          <p className="text-xs text-paper-500">
            {formatMoney(goal.achieved_amount, goal.currency)} de{" "}
            {formatMoney(goal.target_amount, goal.currency)} · {goal.attainment_pct}%
          </p>
        </div>
        <button
          onClick={onDelete}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-900/20"
          title="Remover meta"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
        {/* Camada de fundo: alcançado + forecast ponderado, até o total da meta */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-paper-300/60 dark:bg-ink-700"
          style={{ width: `${forecastPct}%` }}
        />
        {/* Camada da frente: só o que já foi ganho */}
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            attainmentTone(goal.attainment_pct),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-paper-500">
        <span>Forecast (aberto ponderado): {formatMoney(goal.forecast_weighted_amount, goal.currency)}</span>
        <span>
          Falta {formatMoney(goal.gap_amount, goal.currency)}
        </span>
      </div>
    </div>
  )
}
