// Deriva quais spaces o usuário atual pode ver no workspace ativo.
//
// Regras (espelham o backend — ver PATCH /auth/workspaces/<id>/members/<user_id>/):
// - owner/admin sempre enxergam todos os spaces, não importa o `allowed_spaces`
//   guardado (esses papéis nunca ficam restritos).
// - membro com `allowed_spaces` null/undefined é irrestrito: enxerga todos.
// - membro com lista enxerga só o que está na lista (filtrado contra os ids
//   válidos, defensivo contra dado velho/inconsistente).
// - sem workspace, sem sessão carregada, ou ainda carregando: lista vazia.
//   Falha fechado — mostrar nada é menos grave que vazar um space por um
//   instante durante o loading.
import { useMemo } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
import { useMembers } from "@/features/workspace/workspace.hooks"
import type { Role } from "@/features/workspace/workspace.types"

import { SPACES, type SpaceId } from "./spaces"

const ALL_SPACE_IDS: SpaceId[] = SPACES.map((s) => s.id)

/** Papel do usuário atual no workspace ativo — null enquanto carrega/sem acesso. */
export function useMyRole(workspaceId: string | null): Role | null {
  const me = useAuthStore((s) => s.user)
  const members = useMembers(workspaceId)

  return useMemo(() => {
    if (!workspaceId || !me?.id) return null
    return members.data?.find((m) => m.user_id === me.id)?.role ?? null
  }, [workspaceId, me?.id, members.data])
}

export function useMySpaceIds(workspaceId: string | null): SpaceId[] {
  const me = useAuthStore((s) => s.user)
  const members = useMembers(workspaceId)

  return useMemo(() => {
    if (!workspaceId || !me?.id) return []
    const list = members.data
    if (!list) return []

    const myself = list.find((m) => m.user_id === me.id)
    if (!myself) return []

    if (myself.role === "owner" || myself.role === "admin") return ALL_SPACE_IDS

    if (myself.allowed_spaces == null) return ALL_SPACE_IDS

    return ALL_SPACE_IDS.filter((id) => myself.allowed_spaces?.includes(id))
  }, [workspaceId, me?.id, members.data])
}
