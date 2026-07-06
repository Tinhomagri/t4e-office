import { api } from "@/shared/api/client"

export interface GithubStatus {
  connected: boolean
  login?: string
  avatar?: string
}

export interface GithubRepo {
  full_name: string
  private: boolean
  default_branch: string
  admin: boolean
  push: boolean
}

export interface ProjectRepo {
  id: string
  full_name: string
  default_branch: string
  webhook_active: boolean
}

export type DevLinkKind = "branch" | "commit" | "pull_request"

export interface DevLink {
  id: string
  kind: DevLinkKind
  title: string
  url: string
  state: string
  branch: string
  number: number | null
  author_login: string
  author_avatar: string
  updated_at: string
}

export interface CardDevLinks {
  repo_connected: boolean
  links: DevLink[]
}

export async function getGithubStatus(): Promise<GithubStatus> {
  const { data } = await api.get<GithubStatus>("/github/status/")
  return data
}

// Inicia OAuth e devolve a URL do GitHub p/ redirecionar.
export async function getGithubAuthUrl(returnTo: string): Promise<string> {
  const { data } = await api.get<{ url: string }>("/github/oauth/url/", {
    params: { return_to: returnTo },
  })
  return data.url
}

export async function disconnectGithub(): Promise<void> {
  await api.post("/github/disconnect/")
}

export async function listMyRepos(): Promise<GithubRepo[]> {
  const { data } = await api.get<{ repos: GithubRepo[] }>("/github/repos/")
  return data.repos
}

export async function listProjectRepos(projectId: string): Promise<ProjectRepo[]> {
  const { data } = await api.get<{ repos: ProjectRepo[] }>(
    `/github/projects/${projectId}/repos/`,
  )
  return data.repos
}

export async function linkProjectRepo(
  projectId: string,
  fullName: string,
): Promise<ProjectRepo> {
  const { data } = await api.post<ProjectRepo>(`/github/projects/${projectId}/repos/`, {
    full_name: fullName,
  })
  return data
}

export async function unlinkProjectRepo(projectId: string, linkId: string): Promise<void> {
  await api.delete(`/github/projects/${projectId}/repos/${linkId}/`)
}

export interface DevMetrics {
  repos: ProjectRepo[]
  prs: { open: number; merged: number; closed: number; total: number }
  branches: number
  commits: number
  linked_cards: number
  recent_prs: {
    id: string
    title: string
    url: string
    state: string
    number: number | null
    branch: string
    author_login: string
    author_avatar: string
    updated_at: string
  }[]
}

export async function getProjectDevMetrics(projectId: string): Promise<DevMetrics> {
  const { data } = await api.get<DevMetrics>(`/github/projects/${projectId}/dev/`)
  return data
}

export async function getCardDevLinks(cardId: string): Promise<CardDevLinks> {
  const { data } = await api.get<CardDevLinks>(`/github/cards/${cardId}/links/`)
  return data
}

export async function createCardBranch(
  cardId: string,
  opts?: { branch?: string; from_branch?: string },
): Promise<{ branch: string; url: string }> {
  const { data } = await api.post<{ branch: string; url: string }>(
    `/github/cards/${cardId}/branch/`,
    opts ?? {},
  )
  return data
}
