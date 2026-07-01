import { CheckCircle2, Circle, Plus, Target } from "lucide-react"
import { useState } from "react"
import { cx } from "@/shared/ui/primitives"
import type { Card } from "@/features/workspace/workspace.types"

interface Meta {
  id: string
  title: string
  description: string
  linkedEpicId: string | null
  createdAt: string
}

const STORAGE_KEY = (projectId: string) => `pulse_metas_${projectId}`

function loadMetas(projectId: string): Meta[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(projectId)) ?? "[]")
  } catch {
    return []
  }
}

function saveMetas(projectId: string, metas: Meta[]) {
  localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(metas))
}

export function MetasView({
  projectId,
  cards,
  onOpen,
}: {
  projectId: string
  cards: Card[]
  onOpen: (c: Card) => void
}) {
  const epics = cards.filter((c) => c.type === "epic")
  const [metas, setMetas] = useState<Meta[]>(() => loadMetas(projectId))
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newEpic, setNewEpic] = useState<string>("")

  function createMeta() {
    if (!newTitle.trim()) return
    const meta: Meta = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      linkedEpicId: newEpic || null,
      createdAt: new Date().toISOString(),
    }
    const next = [...metas, meta]
    setMetas(next)
    saveMetas(projectId, next)
    setNewTitle("")
    setNewDesc("")
    setNewEpic("")
    setCreating(false)
  }

  function deleteMeta(id: string) {
    const next = metas.filter((m) => m.id !== id)
    setMetas(next)
    saveMetas(projectId, next)
  }

  // For each meta, calculate progress via linked epic's child cards
  function getProgress(meta: Meta) {
    if (!meta.linkedEpicId) return null
    // Cards related to epic: treat cards in the same sprint as proxy
    const epic = epics.find((e) => e.id === meta.linkedEpicId)
    if (!epic) return null
    // Show overall project progress as a stand-in (epics don't have children in current model)
    const all = cards.filter((c) => c.type !== "epic")
    const done = all.filter((c) => c.status === "done")
    return { total: all.length, done: done.length }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink dark:text-paper">Metas do projeto</h3>
          <p className="text-sm text-paper-500">Defina objetivos e acompanhe o progresso via epics.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          <Plus className="size-4" /> Nova meta
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5">
          <p className="mb-3 text-sm font-semibold text-ink dark:text-paper">Nova meta</p>
          <div className="space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título da meta"
              className="w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper placeholder-paper-400 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descrição (opcional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper placeholder-paper-400 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30"
            />
            {epics.length > 0 && (
              <select
                value={newEpic}
                onChange={(e) => setNewEpic(e.target.value)}
                className="w-full rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
              >
                <option value="">Vincular a um epic (opcional)</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button
                onClick={createMeta}
                disabled={!newTitle.trim()}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                Criar meta
              </button>
              <button
                onClick={() => setCreating(false)}
                className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-4 py-2 text-sm font-medium text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metas list */}
      {metas.length === 0 && !creating ? (
        <div className="rounded-2xl border border-dashed border-paper-300 py-20 text-center">
          <Target className="mx-auto mb-3 size-10 text-paper-300" />
          <p className="font-medium text-paper-500">Nenhuma meta definida</p>
          <p className="mt-1 text-sm text-paper-400">Crie metas para acompanhar os objetivos do projeto.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {metas.map((meta) => {
            const prog = getProgress(meta)
            const pct = prog ? Math.round((prog.done / Math.max(prog.total, 1)) * 100) : null
            const linkedEpic = meta.linkedEpicId ? epics.find((e) => e.id === meta.linkedEpicId) : null

            return (
              <div key={meta.id} className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {pct === 100 ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-paper-300" />
                    )}
                    <div className="min-w-0">
                      <h4 className="font-semibold text-ink dark:text-paper">{meta.title}</h4>
                      {meta.description && <p className="mt-1 text-sm text-paper-500">{meta.description}</p>}
                      {linkedEpic && (
                        <button
                          onClick={() => onOpen(linkedEpic)}
                          className="mt-2 flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                          <span className="size-1.5 rounded-full bg-violet-400" />
                          {linkedEpic.ref} · {linkedEpic.title}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {pct !== null && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-ink dark:text-paper">{pct}%</p>
                        <p className="text-[11px] text-paper-400">{prog!.done}/{prog!.total}</p>
                      </div>
                    )}
                    <button
                      onClick={() => deleteMeta(meta.id)}
                      className="text-xs text-paper-400 hover:text-danger transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {pct !== null && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div
                      className={cx(
                        "h-full rounded-full transition-all",
                        pct === 100 ? "bg-success" : "bg-brand-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Epics as goals */}
      {epics.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-paper-500">Epics do projeto</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {epics.map((e) => {
              const all = cards.filter((c) => c.type !== "epic")
              const done = all.filter((c) => c.status === "done").length
              const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0
              return (
                <button
                  key={e.id}
                  onClick={() => onOpen(e)}
                  className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 text-left hover:bg-violet-50 transition-colors"
                >
                  <p className="text-[11px] font-mono text-violet-500">{e.ref}</p>
                  <p className="mt-0.5 font-semibold text-ink dark:text-paper">{e.title}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-paper-400">{pct}% concluído</p>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
