import { useState } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
import { EmptyState, PageHeader, Spinner } from "@/shared/ui/primitives"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"

import { useActiveCard, useSaveWorkingNote } from "../pc/activeCard.hooks"

export function MyCardPage() {
  const { data: workspaces, isLoading, activeWorkspaceId } = useWorkspaces()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }
  if (!workspaces || workspaces.length === 0 || !activeWorkspaceId) {
    return (
      <EmptyState
        title="Nenhum workspace"
        description="Entre num workspace pra ver seu card ativo."
      />
    )
  }

  return <MyCardInner workspaceId={activeWorkspaceId} />
}

function MyCardInner({ workspaceId }: { workspaceId: string }) {
  const me = useAuthStore((s) => s.user)
  const activeCard = useActiveCard(workspaceId, me?.id ?? null, true)
  const saveNote = useSaveWorkingNote(workspaceId, me?.id ?? null)
  const [note, setNote] = useState(activeCard.data?.working_note ?? "")
  const [dirty, setDirty] = useState(false)

  if (activeCard.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  // Falha de rede/permissão não é "você não tem card": mostrar o estado vazio
  // aqui esconderia o erro e o usuário ficaria esperando um card que existe.
  if (activeCard.isError) {
    return (
      <EmptyState
        title="Meu Card"
        description="Não foi possível carregar seu card. Tente de novo."
      />
    )
  }

  if (!activeCard.data?.active) {
    return (
      <EmptyState
        title="Meu Card"
        description="Você não tem nenhum card em andamento no momento."
      />
    )
  }

  const card = activeCard.data.card!
  const shownNote = dirty ? note : activeCard.data.working_note ?? ""

  return (
    <div className="space-y-6">
      <PageHeader title="Meu Card" subtitle="O que você está trabalhando agora" />
      <div className="rounded-md border border-gray-300 p-4">
        <div className="font-semibold text-black">
          {card.project}-{card.number} {card.title}
        </div>
        <label className="mt-4 block text-sm text-black/80" htmlFor="working-note">
          Observação
        </label>
        <textarea
          id="working-note"
          className="mt-1 w-full rounded-md border border-gray-400 bg-white p-2 text-sm text-black"
          rows={4}
          value={shownNote}
          onChange={(e) => {
            setNote(e.target.value)
            setDirty(true)
          }}
        />
        <button
          type="button"
          className="mt-2 rounded-md border border-gray-400 bg-white px-3 py-1 text-sm text-black"
          onClick={() => {
            saveNote.mutate(
              { cardId: card.id, note: shownNote },
              { onSuccess: () => setDirty(false) },
            )
          }}
        >
          Salvar
        </button>
        {saveNote.isError ? (
          <p className="mt-1 text-sm text-red-600">Erro ao salvar. Tente de novo.</p>
        ) : null}
      </div>
    </div>
  )
}
