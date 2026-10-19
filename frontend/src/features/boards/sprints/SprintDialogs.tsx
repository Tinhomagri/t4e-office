import { useState } from "react"

import type { SprintCompletePreview } from "@/features/workspace/workspace.api"
import type { Sprint } from "@/features/workspace/workspace.types"
import { Button, Field, Input, Modal, Textarea, cx } from "@/shared/ui/primitives"

import {
  DURATION_WEEKS,
  type SprintDuration,
  daysToDuration,
  durationToDays,
  durationWeeks,
  endForDuration,
  todayISO,
} from "./sprintDates"

export interface SprintFormValues {
  name: string
  start_date: string
  end_date: string
  goal: string
  /** `null` = personalizada (as datas valem como vieram). */
  duration_days: number | null
}

/**
 * Nome, duração, início, fim e meta — o mesmo formulário do "Iniciar sprint"
 * e do "Editar sprint" do Jira. Escolher uma duração recalcula o fim; mexer
 * no fim à mão vira "Personalizada".
 */
function useSprintForm(sprint: Sprint) {
  // Duração escolhida na criação vence; sem ela, deduz das datas; sem datas,
  // 2 semanas (padrão do produto).
  const chosen = daysToDuration(sprint.duration_days)
  const start = sprint.start_date ?? todayISO()
  const end =
    sprint.end_date ??
    endForDuration(start, chosen && chosen !== "custom" ? chosen : 2)
  const [values, setValues] = useState<Omit<SprintFormValues, "duration_days">>({
    name: sprint.name,
    start_date: start,
    end_date: end,
    goal: sprint.goal ?? "",
  })
  const [duration, setDuration] = useState<SprintDuration>(
    sprint.start_date && sprint.end_date ? durationWeeks(start, end) : (chosen ?? 2),
  )

  const set = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }))
  const pickDuration = (d: SprintDuration) => {
    setDuration(d)
    if (d !== "custom" && values.start_date) set({ end_date: endForDuration(values.start_date, d) })
  }
  const setStart = (iso: string) => {
    // Duração fixa acompanha o início (o fim anda junto); personalizada não.
    if (duration !== "custom" && iso) set({ start_date: iso, end_date: endForDuration(iso, duration) })
    else set({ start_date: iso })
  }
  const setEnd = (iso: string) => {
    set({ end_date: iso })
    setDuration(values.start_date && iso ? durationWeeks(values.start_date, iso) : "custom")
  }

  const dateError =
    !values.start_date || !values.end_date
      ? "Informe início e fim."
      : values.end_date < values.start_date
        ? "A data de fim não pode ser anterior à de início."
        : null
  const valid = values.name.trim().length > 0 && dateError === null
  const payload = (): SprintFormValues => ({
    ...values,
    name: values.name.trim(),
    duration_days: durationToDays(duration),
  })
  return { values, set, duration, pickDuration, setStart, setEnd, dateError, valid, payload }
}

function SprintFormFields({ form }: { form: ReturnType<typeof useSprintForm> }) {
  const { values, set, duration, pickDuration, setStart, setEnd, dateError } = form
  return (
    <div className="space-y-4">
      <Field label="Nome da sprint">
        <Input value={values.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
      </Field>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink dark:text-paper">Duração</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duração">
          {[...DURATION_WEEKS, "custom" as const].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={duration === d}
              onClick={() => pickDuration(d)}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                duration === d
                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                  : "border-paper-200 text-paper-500 hover:bg-paper-100 dark:border-ink-700 dark:hover:bg-ink-800",
              )}
            >
              {d === "custom" ? "Personalizada" : `${d} semana${d > 1 ? "s" : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de início">
          <Input type="date" value={values.start_date} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Data de fim">
          <Input
            type="date"
            value={values.end_date}
            min={values.start_date || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      {dateError && values.start_date && values.end_date && (
        <p className="-mt-2 text-xs text-danger">{dateError}</p>
      )}

      <Field label="Meta da sprint" hint="O que o time quer entregar até o fim da sprint.">
        <Textarea rows={3} value={values.goal} onChange={(e) => set({ goal: e.target.value })} />
      </Field>
    </div>
  )
}

export function StartSprintModal({
  sprint,
  cardCount,
  isPending = false,
  onCancel,
  onConfirm,
}: {
  sprint: Sprint
  cardCount: number
  isPending?: boolean
  onCancel: () => void
  onConfirm: (values: SprintFormValues) => void
}) {
  const form = useSprintForm(sprint)
  return (
    <Modal
      open
      onClose={onCancel}
      title="Iniciar sprint"
      description={`${cardCount} card${cardCount === 1 ? "" : "s"} entra${cardCount === 1 ? "" : "m"} nesta sprint.`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(form.payload())} disabled={!form.valid} loading={isPending}>
            Iniciar
          </Button>
        </>
      }
    >
      <SprintFormFields form={form} />
    </Modal>
  )
}

export function EditSprintModal({
  sprint,
  isPending = false,
  onCancel,
  onConfirm,
}: {
  sprint: Sprint
  isPending?: boolean
  onCancel: () => void
  onConfirm: (values: SprintFormValues) => void
}) {
  const form = useSprintForm(sprint)
  return (
    <Modal
      open
      onClose={onCancel}
      title={`Editar sprint: ${sprint.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(form.payload())} disabled={!form.valid} loading={isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <SprintFormFields form={form} />
    </Modal>
  )
}

export interface CompleteSprintChoice {
  moveTo: string
  newSprintName?: string
}

export function CompleteSprintModal({
  sprint,
  openSprints,
  preview,
  isPending = false,
  onCancel,
  onConfirm,
}: {
  sprint: Sprint
  /** Sprints futuras (planejadas) que podem receber os abertos. */
  openSprints: Sprint[]
  preview: SprintCompletePreview | undefined
  isPending?: boolean
  onCancel: () => void
  onConfirm: (choice: CompleteSprintChoice) => void
}) {
  const [moveTo, setMoveTo] = useState("backlog")
  const [newName, setNewName] = useState<string | null>(null)
  const openCount = preview?.open_cards ?? 0
  const name = newName ?? preview?.suggested_name ?? ""

  const confirm = () =>
    onConfirm(moveTo === "new" ? { moveTo, newSprintName: name.trim() } : { moveTo })

  const option = (value: string, label: string) => (
    <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-100 dark:hover:bg-ink-800">
      <input
        type="radio"
        name="complete-move-to"
        value={value}
        checked={moveTo === value}
        onChange={() => setMoveTo(value)}
        className="accent-brand-500"
      />
      {label}
    </label>
  )

  return (
    <Modal
      open
      onClose={onCancel}
      title={`Concluir ${sprint.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={confirm}
            loading={isPending}
            disabled={!preview || (moveTo === "new" && !name.trim())}
          >
            Concluir sprint
          </Button>
        </>
      }
    >
      {!preview ? (
        <p className="text-sm text-paper-500">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-1 text-sm font-medium text-ink dark:text-paper">
            <li>{`${preview.completed_cards} cards concluídos`}</li>
            <li>{`${openCount} cards abertos`}</li>
          </ul>

          {openCount === 0 ? (
            <p className="text-sm text-paper-500">Todos os cards foram concluídos. 🎉</p>
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink dark:text-paper">
                Mover os cards abertos para
              </legend>
              {option("backlog", "Backlog")}
              {openSprints.map((s) => option(s.id, s.name))}
              {option("new", "Nova sprint")}
              {moveTo === "new" && (
                <div className="mt-2 pl-6">
                  <Field label="Nome da nova sprint">
                    <Input value={name} onChange={(e) => setNewName(e.target.value)} />
                  </Field>
                </div>
              )}
            </fieldset>
          )}
        </div>
      )}
    </Modal>
  )
}
