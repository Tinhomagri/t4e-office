import { api } from "@/shared/api/client"

export interface MeetingRoom {
  id: string
  slug: string
  name: string
  project_id: string | null
  card_id: string | null
  created_by: string
  created_at: string
  closed_at: string | null
  participants: number
  /** Preenchido só no histórico: quem participou e por quanto tempo. */
  history: { user_id: string; name: string; joined_at: string; minutes: number }[]
  duration_minutes: number
}

export interface JoinResult {
  token: string
  url: string
  room: MeetingRoom
}

export interface MeetingCollaborator {
  user_id: string
  name: string
  meetings: number
  minutes: number
}

export interface MeetingReport {
  total_meetings: number
  total_minutes: number
  average_minutes: number
  busiest_weekday: string | null
  top_collaborators: MeetingCollaborator[]
}

export async function getMeetingReport(workspaceId: string, days = 30): Promise<MeetingReport> {
  const { data } = await api.get<MeetingReport>("/meetings/report/", {
    params: { workspace_id: workspaceId, days },
  })
  return data
}

export async function listRooms(
  workspaceId: string,
  closed = false,
): Promise<MeetingRoom[]> {
  const { data } = await api.get<MeetingRoom[]>("/meetings/rooms/", {
    params: { workspace_id: workspaceId, ...(closed ? { closed: 1 } : {}) },
  })
  return data
}

export async function createRoom(input: {
  workspaceId: string
  name: string
  projectId?: string | null
  cardId?: string | null
}): Promise<MeetingRoom> {
  const { data } = await api.post<MeetingRoom>("/meetings/rooms/", {
    workspace_id: input.workspaceId,
    name: input.name,
    project_id: input.projectId ?? null,
    card_id: input.cardId ?? null,
  })
  return data
}

/** Pede o token de entrada. `publish: false` entra como espectador. */
export async function joinRoom(roomId: string, publish = true): Promise<JoinResult> {
  const { data } = await api.post<JoinResult>(`/meetings/rooms/${roomId}/join/`, {
    publish,
  })
  return data
}

export async function joinOfficeRoom(workspaceId: string, floor: number): Promise<JoinResult> {
  const { data } = await api.post<JoinResult>("/meetings/office/join/", { workspace_id: workspaceId, floor })
  return data
}

/** Sala de mídia de uma sessão de Planning Poker (uma sala por sessão). */
export async function joinPokerRoom(sessionId: string): Promise<JoinResult> {
  const { data } = await api.post<JoinResult>("/meetings/poker/join/", { session_id: sessionId })
  return data
}

export async function leaveRoom(roomId: string): Promise<void> {
  await api.post(`/meetings/rooms/${roomId}/leave/`)
}

export async function closeRoom(roomId: string): Promise<MeetingRoom> {
  const { data } = await api.post<MeetingRoom>(`/meetings/rooms/${roomId}/close/`)
  return data
}
