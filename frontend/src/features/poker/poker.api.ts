import { api } from "@/shared/api/client"
import type { PokerCard, PokerRound, PokerSession, PokerWorkspaceSummary } from "./poker.types"

export async function listSessions(workspaceId: string): Promise<PokerSession[]> {
  const { data } = await api.get(`/workspaces/${workspaceId}/poker/`)
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

export async function getPokerCards(sessionId: string): Promise<PokerCard[]> {
  const { data } = await api.get(`/poker/${sessionId}/cards/`)
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
