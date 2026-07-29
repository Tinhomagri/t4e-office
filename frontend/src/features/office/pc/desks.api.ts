import { api } from "@/shared/api/client"

export interface DeskAssignment {
  seat_id: string
  floor: number
  user_id: string
  user_name: string
}

export async function listDeskAssignments(
  workspaceId: string,
  floor: number,
): Promise<DeskAssignment[]> {
  const { data } = await api.get<DeskAssignment[]>("/presence/desks/", {
    params: { workspace_id: workspaceId, floor },
  })
  return data
}

export async function assignDesk(input: {
  workspaceId: string
  floor: number
  seatId: string
  userId: string | null
}): Promise<DeskAssignment[]> {
  const { data } = await api.post<DeskAssignment[]>("/presence/desks/assign/", {
    workspace_id: input.workspaceId,
    floor: input.floor,
    seat_id: input.seatId,
    user_id: input.userId,
  })
  return data
}
