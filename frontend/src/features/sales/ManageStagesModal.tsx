// Gestão dos estágios do funil: renomear, ajustar probabilidade padrão, cor,
// reordenar e adicionar/remover. Espelha a gestão de colunas do Kanban dos
// boards — mesma leitura para quem já usa o produto.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button, Input, Modal, cx } from "@/shared/ui/primitives"

import { useCreateStage, useDeleteStage, useUpdateStage } from "./sales.hooks"
import { STAGE_KIND_LABEL } from "./sales.shared"
import type { PipelineStage } from "./sales.types"

export function ManageStagesModal({
  open,
  onClose,
  workspaceId,
  stages,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string | null
  stages: PipelineStage[]
}) {
  const createStage = useCreateStage(workspaceId)
  const updateStage = useUpdateStage(workspaceId)
  const deleteStage = useDeleteStage(workspaceId)

  const [newName, setNewName] = useState("")

  // Trocar de posição = trocar o `order` com o vizinho. Duas escritas, mas
  // mantém a ordem densa e evita um endpoint de reordenação só para isso.
  const swap = (index: number, direction: -1 | 1) => {
    const current = stages[index]
    const neighbor = stages[index + direction]
    if (!current || !neighbor) return
    updateStage.mutate({ stageId: current.id, input: { order: neighbor.order } })
    updateStage.mutate({ stageId: neighbor.id, input: { order: current.order } })
  }

  const submitNew = () => {
    const name = newName.trim()
    if (!name) return
    createStage.mutate(
      { name, order: (stages[stages.length - 1]?.order ?? 0) + 1, probability_default: 50 },
      { onSuccess: () => setNewName("") },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Estágios do funil" size="lg">
      <div className="flex flex-col gap-2">
        {stages.map((stage, i) => {
          // Ganho e Perdido são os marcos do funil: podem ser renomeados, mas
          // não removidos — o backend também recusa, isso é só o espelho na UI.
          const isTerminal = stage.kind !== "open"

          return (
            <div
              key={stage.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 dark:border-ink-700 p-2.5"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color }}
                aria-hidden
              />

              <input
                defaultValue={stage.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== stage.name) {
                    updateStage.mutate({ stageId: stage.id, input: { name } })
                  }
                }}
                aria-label={`Nome do estágio ${stage.name}`}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-ink dark:text-paper outline-none transition-colors hover:border-paper-200 focus:border-brand-400 dark:hover:border-ink-600"
              />

              {isTerminal && (
                <span className="shrink-0 rounded-full bg-paper-100 dark:bg-ink-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper-500">
                  {STAGE_KIND_LABEL[stage.kind]}
                </span>
              )}

              <label className="flex shrink-0 items-center gap-1.5 text-xs text-paper-500">
                Prob.
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={stage.probability_default}
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    if (
                      Number.isFinite(value) &&
                      value >= 0 &&
                      value <= 100 &&
                      value !== stage.probability_default
                    ) {
                      updateStage.mutate({
                        stageId: stage.id,
                        input: { probability_default: value },
                      })
                    }
                  }}
                  aria-label={`Probabilidade padrão de ${stage.name}`}
                  className="w-16 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2 py-1 text-sm tabular text-ink dark:text-paper outline-none focus:border-brand-400"
                />
                %
              </label>

              <div className="flex shrink-0 items-center gap-0.5">
                <StageIconButton
                  label={`Mover ${stage.name} para cima`}
                  disabled={i === 0}
                  onClick={() => swap(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </StageIconButton>
                <StageIconButton
                  label={`Mover ${stage.name} para baixo`}
                  disabled={i === stages.length - 1}
                  onClick={() => swap(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </StageIconButton>
                <StageIconButton
                  label={`Remover ${stage.name}`}
                  disabled={isTerminal}
                  danger
                  onClick={() => deleteStage.mutate(stage.id)}
                >
                  <Trash2 className="size-4" />
                </StageIconButton>
              </div>
            </div>
          )
        })}

        {/* Label solto (não via <Field>): o botão não pode ficar dentro de um
            <label>, senão o clique nele também ativa o input. */}
        <div className="mt-2 border-t border-paper-100 dark:border-ink-800 pt-3">
          <label
            htmlFor="new-stage-name"
            className="mb-1.5 block text-[13px] font-medium text-ink dark:text-paper"
          >
            Novo estágio
          </label>
          <div className="flex gap-2">
            <Input
              id="new-stage-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNew()}
              placeholder="Ex.: Diagnóstico"
            />
            <Button
              icon={<Plus className="size-4" />}
              onClick={submitNew}
              disabled={!newName.trim() || createStage.isPending}
            >
              Adicionar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function StageIconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-9 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:size-8",
        danger
          ? "text-paper-400 hover:bg-danger/10 hover:text-danger"
          : "text-paper-400 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}
