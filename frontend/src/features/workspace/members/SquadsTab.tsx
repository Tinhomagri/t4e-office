// Squads: times que estimam juntos no Planning Poker.
//
// Squad é ETIQUETA dentro do workspace, não divisão dele: ninguém deixa de ver
// projeto, andar do Escritório ou colega por estar em outra squad. Se um dia
// for preciso isolar de verdade, isso é workspace — e aí o time deixa de
// transitar no mesmo escritório.
import { useState } from "react"
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react"

import {
  useCreateSquad,
  useDeleteSquad,
  useSquads,
  useUpdateSquad,
} from "@/features/poker/poker.hooks"
import type { Squad } from "@/features/poker/poker.types"
import { useMembers } from "../workspace.hooks"
import { Button, EmptyState, Input, Spinner, cx } from "@/shared/ui/primitives"

/** Cores sugeridas — as mesmas famílias usadas nos gráficos do Resumo. */
const CORES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"]

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

function SquadForm({
  workspaceId,
  squad,
  onDone,
}: {
  workspaceId: string
  squad?: Squad
  onDone: () => void
}) {
  const membros = useMembers(workspaceId).data ?? []
  const criar = useCreateSquad(workspaceId)
  const atualizar = useUpdateSquad(workspaceId)

  const [nome, setNome] = useState(squad?.name ?? "")
  const [cor, setCor] = useState(squad?.color ?? CORES[0])
  const [escolhidos, setEscolhidos] = useState<string[]>(
    squad?.members.map((m) => m.user_id) ?? [],
  )

  const alternar = (userId: string) =>
    setEscolhidos((atual) =>
      atual.includes(userId) ? atual.filter((id) => id !== userId) : [...atual, userId],
    )

  const salvar = async () => {
    const dados = { name: nome.trim(), color: cor, member_ids: escolhidos }
    if (!dados.name) return
    if (squad) await atualizar.mutateAsync({ squadId: squad.id, input: dados })
    else await criar.mutateAsync(dados)
    onDone()
  }

  const salvando = criar.isPending || atualizar.isPending

  return (
    <div className="rounded-2xl border border-paper-200 bg-paper p-4 dark:border-ink-700 dark:bg-ink-900">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-paper-500">Nome da squad</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Squad Alfa" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-paper-500">Cor</label>
          <div className="flex gap-1.5">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                className={cx(
                  "size-7 rounded-full border-2 transition-transform",
                  cor === c ? "scale-110 border-ink dark:border-paper" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-paper-500">
          Quem faz parte ({escolhidos.length})
        </label>
        <div className="flex flex-wrap gap-1.5">
          {membros.map((m) => {
            const dentro = escolhidos.includes(m.user_id)
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => alternar(m.user_id)}
                className={cx(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  dentro
                    ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-paper-200 text-paper-600 hover:border-paper-300 dark:border-ink-700 dark:text-paper-400",
                )}
              >
                {dentro && <Check className="size-3" />}
                {m.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button onClick={salvar} disabled={!nome.trim() || salvando}>
          {salvando ? "Salvando…" : squad ? "Salvar" : "Criar squad"}
        </Button>
      </div>
    </div>
  )
}

export function SquadsTab({ workspaceId }: { workspaceId: string }) {
  const { data: squads, isLoading } = useSquads(workspaceId)
  const apagar = useDeleteSquad(workspaceId)
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  const lista = squads ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-paper-500">
          Times que estimam juntos. A squad organiza o Planning Poker — todo mundo
          continua vendo os mesmos projetos e o mesmo Escritório.
        </p>
        {!criando && (
          <Button icon={<Plus className="size-4" />} onClick={() => setCriando(true)}>
            Nova squad
          </Button>
        )}
      </div>

      {criando && (
        <SquadForm workspaceId={workspaceId} onDone={() => setCriando(false)} />
      )}

      {lista.length === 0 && !criando ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Nenhuma squad ainda"
          description="Crie uma squad para abrir sessões de Planning Poker do time, com cards de vários projetos na mesma sala."
        />
      ) : (
        <div className="space-y-2">
          {lista.map((squad) =>
            editando === squad.id ? (
              <SquadForm
                key={squad.id}
                workspaceId={workspaceId}
                squad={squad}
                onDone={() => setEditando(null)}
              />
            ) : (
              <div
                key={squad.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-paper-200 bg-paper px-4 py-3 dark:border-ink-700 dark:bg-ink-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: squad.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">
                      {squad.name}
                    </p>
                    <p className="text-xs text-paper-500">
                      {squad.members.length === 0
                        ? "Sem membros"
                        : squad.members.map((m) => m.name.split(" ")[0]).join(", ")}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <div className="mr-2 flex -space-x-1.5">
                    {squad.members.slice(0, 4).map((m) => (
                      <span
                        key={m.user_id}
                        title={m.name}
                        className="grid size-6 place-items-center rounded-full border-2 border-paper text-[9px] font-bold text-white dark:border-ink-900"
                        style={{ backgroundColor: squad.color }}
                      >
                        {m.initials || iniciais(m.name)}
                      </span>
                    ))}
                    {squad.members.length > 4 && (
                      <span className="grid size-6 place-items-center rounded-full border-2 border-paper bg-paper-200 text-[9px] font-bold text-paper-600 dark:border-ink-900 dark:bg-ink-700">
                        +{squad.members.length - 4}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setEditando(squad.id)}
                    title="Editar"
                    className="grid size-8 place-items-center rounded-lg text-paper-400 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-700"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      // As sessões que a squad já fez continuam existindo — o
                      // vínculo é que se desfaz. Vale avisar antes mesmo assim.
                      if (window.confirm(`Excluir a squad "${squad.name}"? As sessões já realizadas são mantidas.`)) {
                        apagar.mutate(squad.id)
                      }
                    }}
                    title="Excluir"
                    className="grid size-8 place-items-center rounded-lg text-paper-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
