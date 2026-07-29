import { useAuthStore } from "@/features/auth/auth.store"
import { EmptyState, PageHeader, Spinner } from "@/shared/ui/primitives"
import { useMembers, useWorkspaces } from "@/features/workspace/workspace.hooks"

import { pcSeats } from "../pc/desk"
import { useAssignDesk, useDeskAssignments } from "../pc/desks.hooks"
import { buildFloor1 } from "../world/floors/floor1"

const FLOOR = 1
const SEATS = pcSeats(buildFloor1().seats)

export function DesksManagerPage() {
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
        description="Crie um workspace na aba Boards para gerenciar mesas."
      />
    )
  }

  return <DesksManagerInner workspaceId={activeWorkspaceId} />
}

function DesksManagerInner({ workspaceId }: { workspaceId: string }) {
  const me = useAuthStore((s) => s.user)
  const members = useMembers(workspaceId)
  const assignments = useDeskAssignments(workspaceId, FLOOR)
  const assign = useAssignDesk(workspaceId, FLOOR)

  const myRole = (members.data ?? []).find((m) => m.user_id === me?.id)?.role ?? null
  const canManage = myRole === "owner" || myRole === "admin"

  if (!canManage) {
    return (
      <EmptyState
        title="Sem acesso"
        description="Só owner ou admin do workspace podem gerenciar mesas."
      />
    )
  }

  const byId = new Map((assignments.data ?? []).map((a) => [a.seat_id, a]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mesas"
        subtitle="Quem senta em qual computador do Bullpen (andar 1)"
      />
      <div className="space-y-1">
        {SEATS.map((seat, i) => {
          const current = byId.get(seat.id)
          return (
            <div
              key={seat.id}
              className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2"
            >
              <span className="text-sm text-black/80">Mesa {i + 1}</span>
              <select
                className="rounded-md border border-gray-400 bg-white px-2 py-1 text-sm text-black"
                value={current?.user_id ?? ""}
                onChange={(e) => {
                  const userId = e.target.value || null
                  assign.mutate({ seatId: seat.id, userId })
                }}
              >
                <option value="">Livre</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
