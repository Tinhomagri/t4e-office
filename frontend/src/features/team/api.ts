import { api } from "@/shared/api/client"
import type { Member, Invitation } from "@/features/workspace/workspace.types"

// ---- Tipos específicos de equipe/permissão ----

export type ProjectRole = "admin" | "developer" | "viewer"

export interface ProjectMemberAccess {
  user_id: string
  name: string
  email: string
  role: ProjectRole
}

export interface PermissionScheme {
  project_id: string
  scheme: string
  overrides: {
    user_id: string
    role: ProjectRole
  }[]
}

// ---- Membros do workspace ----

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { data } = await api.get<Member[]>(`/auth/workspaces/${workspaceId}/members/`)
  return data
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: string,
): Promise<Member> {
  const { data } = await api.patch<Member>(
    `/auth/workspaces/${workspaceId}/members/${userId}/`,
    { role },
  )
  return data
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await api.delete(`/auth/workspaces/${workspaceId}/members/${userId}/`)
}

// ---- Convites ----

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data } = await api.get<Invitation[]>(
    `/auth/workspaces/${workspaceId}/invitations/`,
  )
  return data
}

export async function createInvitation(
  workspaceId: string,
  payload: { email: string; role: string },
): Promise<Invitation> {
  const { data } = await api.post<Invitation>(
    `/auth/workspaces/${workspaceId}/invitations/`,
    payload,
  )
  return data
}

// ---- Acesso por projeto ----

export async function listProjectAccess(projectId: string): Promise<ProjectMemberAccess[]> {
  const { data } = await api.get<ProjectMemberAccess[]>(`/projects/${projectId}/access/`)
  return data
}

export async function setProjectAccess(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberAccess> {
  const { data } = await api.put<ProjectMemberAccess>(`/projects/${projectId}/access/`, {
    user_id: userId,
    role,
  })
  return data
}

// ---- Scheme de permissões ----

export async function getPermissionScheme(projectId: string): Promise<PermissionScheme> {
  const { data } = await api.get<PermissionScheme>(
    `/projects/${projectId}/permission-scheme/`,
  )
  return data
}

// ---- Projetos do workspace ----

export async function listWorkspaceProjects(
  workspaceId: string,
): Promise<import("@/features/workspace/workspace.types").Project[]> {
  const { data } = await api.get(`/projects/`, {
    params: { workspace_id: workspaceId },
  })
  return data
}
