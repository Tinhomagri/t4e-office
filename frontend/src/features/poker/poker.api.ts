import { api } from "@/shared/api/client"
import type {
  PokerCard,
  PokerRound,
  PokerSession,
  PokerWorkspaceSummary,
  Squad,
} from "./poker.types"

export async function listSessions(workspaceId: string): Promise<PokerSession[]> {
  const { data } = await api.get(`/workspaces/${workspaceId}/poker/`)
  return data
}

// ---- Squads ----
export async function listSquads(workspaceId: string): Promise<Squad[]> {
  const { data } = await api.get(`/workspaces/${workspaceId}/squads/`)
  return data
}

export async function createSquad(
  workspaceId: string,
  input: { name: string; color?: string; member_ids?: string[] },
): Promise<Squad> {
  const { data } = await api.post(`/workspaces/${workspaceId}/squads/`, input)
  return data
}

export async function updateSquad(
  squadId: string,
  input: { name?: string; color?: string; member_ids?: string[] },
): Promise<Squad> {
  const { data } = await api.patch(`/squads/${squadId}/`, input)
  return data
}

export async function deleteSquad(squadId: string): Promise<void> {
  await api.delete(`/squads/${squadId}/`)
}

/** Sessão da squad: sem projeto, pontua cards de qualquer projeto. */
export async function createSquadSession(
  workspaceId: string,
  squadId: string,
  name: string,
): Promise<PokerSession> {
  const { data } = await api.post(`/workspaces/${workspaceId}/poker/`, {
    squad_id: squadId,
    name,
  })
  return data
}

export async function createSession(
  workspaceId: string,
  projectId: string,
  name: string,
): Promise<PokerSession> {
  const { data } = await api.post(`/workspaces/${workspaceId}/poker/`, {
    project_id: projectId,
    name,
  })
  return data
}

export async function getSession(sessionId: string): Promise<PokerSession> {
  const { data } = await api.get(`/poker/${sessionId}/`)
  return data
}

export async function joinSession(sessionId: string): Promise<void> {
  await api.post(`/poker/${sessionId}/join/`)
}

export async function heartbeat(sessionId: string): Promise<void> {
  await api.post(`/poker/${sessionId}/heartbeat/`)
}

export async function leaveSession(sessionId: string): Promise<void> {
  await api.post(`/poker/${sessionId}/leave/`)
}

export async function sendReaction(
  sessionId: string,
  toUserId: string,
  emoji: string,
): Promise<void> {
  await api.post(`/poker/${sessionId}/reactions/`, { to_user_id: toUserId, emoji })
}

export async function sendEmote(sessionId: string, emote: string): Promise<void> {
  await api.post(`/poker/${sessionId}/reactions/`, { emote })
}

export async function submitVote(sessionId: string, value: string): Promise<void> {
  await api.post(`/poker/${sessionId}/vote/`, { value })
}

export async function updateSession(
  sessionId: string,
  patch: { status?: string; current_card_id?: string | null; card_ids?: string[] },
): Promise<PokerSession> {
  const { data } = await api.patch(`/poker/${sessionId}/`, patch)
  return data
}

/** Cards que o host pode enfileirar: sem pontuação, de todos os projetos.
 *  `q` busca por título/número e `project` restringe a um projeto. */
export async function getPokerCards(
  sessionId: string,
  filtros?: { q?: string; project?: string },
): Promise<PokerCard[]> {
  const { data } = await api.get(`/poker/${sessionId}/cards/`, { params: filtros })
  return data
}

// ---- Sala a partir do projeto/board ----
export async function listProjectSessions(projectId: string): Promise<PokerSession[]> {
  const { data } = await api.get(`/projects/${projectId}/poker/`)
  return data
}

export async function createProjectSession(
  projectId: string,
  input?: { name?: string; card_ids?: string[] },
): Promise<PokerSession> {
  const { data } = await api.post(`/projects/${projectId}/poker/`, {
    name: input?.name,
    card_ids: input?.card_ids,
  })
  return data
}

export async function applyPoints(sessionId: string, points: number): Promise<PokerSession> {
  const { data } = await api.post(`/poker/${sessionId}/apply/`, { points })
  return data
}

export async function getRounds(sessionId: string): Promise<PokerRound[]> {
  const { data } = await api.get(`/poker/${sessionId}/rounds/`)
  return data
}

export async function getWorkspaceSummary(workspaceId: string): Promise<PokerWorkspaceSummary> {
  const { data } = await api.get(`/workspaces/${workspaceId}/poker/summary/`)
  return data
}
