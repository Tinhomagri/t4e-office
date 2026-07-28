// Aba "Colunas" — CRUD dos workflow statuses que viram colunas do board:
// reordenar por drag, renomear, trocar categoria/cor e definir limite de WIP.
import { useEffect, useState } from "react"
import { GripVertical, Plus, Trash2 } from "lucide-react"

import {
  useCreateWorkflowStatus,
  useDeleteWorkflowStatus,
  useReorderWorkflowStatuses,
  useUpdateWorkflowStatus,
  useWorkflowStatuses,
} from "@/features/workspace/workspace.hooks"
import type {
  WorkflowCategory,
  WorkflowStatus,
} from "@/features/workspace/workspace.types"
import { Button, Input, Select, Spinner, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { ColorPicker, SettingsCard } from "./board-settings.shared"

const CATEGORY_LABEL: Record<WorkflowCategory, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  done: "Concluído",
}

export function ColumnsTab({
  projectId,
  canEdit,
}: {
  projectId: string
  canEdit: boolean
}) {
  const { data: statuses, isLoading } = useWorkflowStatuses(projectId)
  const create = useCreateWorkflowStatus(projectId)
  const reorder = useReorderWorkflowStatuses(projectId)

  // Ordem local para o drag responder na hora; o servidor confirma depois.
  const [order, setOrder] = useState<WorkflowStatus[]>([])
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    if (statuses) setOrder([...statuses].sort((a, b) => a.order - b.order))
  }, [statuses])

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const from = order.findIndex((s) => s.id === dragId)
    const to = order.findIndex((s) => s.id === targetId)
    if (from < 0 || to < 0) return

    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    reorder.mutate(next.map((s) => s.id), {
      // Se o servidor recusar, volta para a ordem que ele conhece.
      onError: () => {
        setOrder([...(statuses ?? [])].sort((a, b) => a.order - b.order))
        toast.error("Não foi possível reordenar as colunas.")
      },
    })
  }

  async function handleCreate() {
    try {
      await create.mutateAsync({ name: "Nova coluna", category: "todo" })
      toast.success("Coluna criada.")
    } catch {
      toast.error("Não foi possível criar a coluna.")
    }
  }

  return (
    <SettingsCard
      title="Colunas do quadro"
      description="Cada coluna é um status. Arraste para reordenar; a ordem vale para todo o time."
      actions={
        canEdit && (
          <Button
            size="sm"
            icon={<Plus className="size-3.5" />}
            loading={create.isPending}
            onClick={handleCreate}
          >
            Adicionar coluna
          </Button>
        )
      }
    >
      <ul className="space-y-2">
        {order.map((status) => (
          <ColumnRow
            key={status.id}
            projectId={projectId}
            status={status}
            canEdit={canEdit}
            isDragging={dragId === status.id}
            // Só permite excluir se sobrar pelo menos uma coluna — um board sem
            // colunas deixaria os cards existentes órfãos.
            canDelete={canEdit && order.length > 1}
            onDragStart={() => setDragId(status.id)}
            onDragEnd={() => setDragId(null)}
            onDropOn={() => handleDrop(status.id)}
          />
        ))}
      </ul>
    </SettingsCard>
  )
}

function ColumnRow({
  projectId,
  status,
  canEdit,
  canDelete,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  projectId: string
  status: WorkflowStatus
  canEdit: boolean
  canDelete: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
}) {
  const update = useUpdateWorkflowStatus(projectId)
  const remove = useDeleteWorkflowStatus(projectId)
  const [name, setName] = useState(status.name)
  const [wip, setWip] = useState(status.wip_limit?.toString() ?? "")

  useEffect(() => {
    setName(status.name)
    setWip(status.wip_limit?.toString() ?? "")
  }, [status.name, status.wip_limit])

  const patch = (input: Parameters<typeof update.mutate>[0]["input"]) =>
    update.mutate({ statusId: status.id, input })

  return (
    <li
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      className={cx(
        "rounded-xl border border-paper-200 bg-paper px-3 py-3 dark:border-ink-800 dark:bg-ink-900",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <GripVertical
          className={cx(
            "size-4 shrink-0 text-paper-400",
            canEdit ? "cursor-grab active:cursor-grabbing" : "opacity-30",
          )}
          aria-hidden
        />
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden
        />
        <Input
          className="h-9 min-w-[140px] flex-1"
          value={name}
          disabled={!canEdit}
          aria-label={`Nome da coluna ${status.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== status.name && name.trim() && patch({ name: name.trim() })}
        />
        <Select
          className="h-9 w-auto"
          value={status.category}
          disabled={!canEdit}
          aria-label={`Categoria da coluna ${status.name}`}
          onChange={(e) => patch({ category: e.target.value as WorkflowCategory })}
        >
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={0}
          className="h-9 w-24"
          placeholder="WIP"
          value={wip}
          disabled={!canEdit}
          aria-label={`Limite de WIP da coluna ${status.name}`}
          onChange={(e) => setWip(e.target.value)}
          // Campo vazio ou 0 significa "sem limite".
          onBlur={() => patch({ wip_limit: wip ? Number(wip) : null })}
        />
        {canDelete && (
          <button
            type="button"
            aria-label={`Excluir coluna ${status.name}`}
            onClick={() => {
              if (!confirm(`Excluir a coluna "${status.name}"?`)) return
              remove.mutate(status.id, {
                onError: () => toast.error("Não foi possível excluir a coluna."),
              })
            }}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-paper-400 transition-colors hover:bg-danger/10 hover:text-danger focus-ring"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {canEdit && (
        <div className="mt-2.5 pl-7">
          <ColorPicker value={status.color} onChange={(color) => patch({ color })} />
        </div>
      )}
    </li>
  )
}
