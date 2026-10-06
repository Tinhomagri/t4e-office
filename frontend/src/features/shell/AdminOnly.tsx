import { Navigate } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import { useMembers, useWorkspaces } from "@/features/workspace/workspace.hooks"

/**
 * Rota de administração do workspace: só owner e admin.
 *
 * Esconder o item no menu não é proteção — a URL continua existindo no
 * histórico, no favorito e no link que alguém cola no chat. Sem este guarda, o
 * `adminOnly` de spaces.ts seria só cosmético.
 *
 * Espera a membership carregar antes de decidir: redirecionar durante o
 * carregamento jogaria para fora quem tem acesso, a cada F5.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const me = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaces()
  const members = useMembers(activeWorkspaceId)

  if (!activeWorkspaceId || !me?.id || !members.isSuccess) return null
  const role = members.data?.find((m) => m.user_id === me.id)?.role
  if (role !== "owner" && role !== "admin") return <Navigate to="/app" replace />
  return <>{children}</>
}
