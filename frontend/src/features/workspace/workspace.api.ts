import { api } from "@/shared/api/client"

import type {
  Card,
  CreateCardInput,
  CreateProjectInput,
  CreateSprintInput,
  Invitation,
  Member,
  Project,
  Role,
  Sprint,
  UpdateCardInput,
  UpdateSprintInput,
  Workspace,
} from "./workspace.types"

// ---- Workspaces ----
export async function listWorkspaces(): Promise<Workspace[]> {
  const { data } = await api.get<Workspace[]>("/auth/workspaces/")
  return data
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const { data } = await api.post<Workspace>("/auth/workspaces/", { name })
  return data
}

// ---- Membros e convites ----
export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { data } = await api.get<Member[]>(`/auth/workspaces/${workspaceId}/members/`)
  return data
}

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data } = await api.get<Invitation[]>(
    `/auth/workspaces/${workspaceId}/invitations/`,
  )
  return data
}

export async function createInvitation(
  workspaceId: string,
  payload: { email: string; role: Role },
): Promise<Invitation> {
  const { data } = await api.post<Invitation>(
    `/auth/workspaces/${workspaceId}/invitations/`,
    payload,
  )
  return data
}

export async function acceptInvitation(token: string): Promise<{ workspace_id: string }> {
  const { data } = await api.post("/auth/invitations/accept/", { token })
  return data
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await api.post(`/auth/invitations/${invitationId}/revoke/`)
}

// ---- Projetos ----
export async function listProjects(workspaceId: string): Promise<Project[]> {
  const { data } = await api.get<Project[]>("/projects/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function createProject(payload: CreateProjectInput): Promise<Project> {
  const { data } = await api.post<Project>("/projects/", payload)
  return data
}

// ---- Cards ----
export async function listCards(projectId: string): Promise<Card[]> {
  const { data } = await api.get<Card[]>(`/projects/${projectId}/cards/`)
  return data
}

export async function createCard(
  projectId: string,
  payload: CreateCardInput,
): Promise<Card> {
  const { data } = await api.post<Card>(`/projects/${projectId}/cards/`, payload)
  return data
}

export async function updateCard(
  cardId: string,
  payload: UpdateCardInput,
): Promise<Card> {
  const { data } = await api.patch<Card>(`/cards/${cardId}/`, payload)
  return data
}

// ---- Sprints ----
export async function listSprints(projectId: string): Promise<Sprint[]> {
  const { data } = await api.get<Sprint[]>(`/projects/${projectId}/sprints/`)
  return data
}

export async function createSprint(
  projectId: string,
  payload: CreateSprintInput,
): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/projects/${projectId}/sprints/`, payload)
  return data
}

export async function updateSprint(
  sprintId: string,
  payload: UpdateSprintInput,
): Promise<Sprint> {
  const { data } = await api.patch<Sprint>(`/sprints/${sprintId}/`, payload)
  return data
}
