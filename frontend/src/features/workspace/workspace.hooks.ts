import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import * as wsApi from "./workspace.api"
import { useWorkspaceStore } from "./workspace.store"
import type { Card } from "./workspace.types"
import type {
  CreateCardInput,
  CreateSprintInput,
  Role,
  UpdateCardInput,
  UpdateSprintInput,
} from "./workspace.types"

// Carrega os workspaces do usuário e garante que haja um ativo selecionado.
export function useWorkspaces() {
  const query = useQuery({ queryKey: ["workspaces"], queryFn: wsApi.listWorkspaces })
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()

  useEffect(() => {
    if (!query.data) return
    const exists = query.data.some((w) => w.id === activeWorkspaceId)
    if (!exists) setActiveWorkspace(query.data[0]?.id ?? null)
  }, [query.data, activeWorkspaceId, setActiveWorkspace])

  return { ...query, activeWorkspaceId, setActiveWorkspace }
}

export function useCreateWorkspace() {
  const qc = useQueryClient()
  const setActive = useWorkspaceStore((s) => s.setActiveWorkspace)
  return useMutation({
    mutationFn: (name: string) => wsApi.createWorkspace(name),
    onSuccess: (ws) => {
      setActive(ws.id)
      qc.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

// ---- Projetos ----
export function useProjects(workspaceId: string | null) {
  return useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => wsApi.listProjects(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateProject(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; key: string }) =>
      wsApi.createProject({ workspace_id: workspaceId!, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", workspaceId] }),
  })
}

// ---- Cards ----
export function useCards(projectId: string | null) {
  return useQuery({
    queryKey: ["cards", projectId],
    queryFn: () => wsApi.listCards(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateCard(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCardInput) => wsApi.createCard(projectId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", projectId] }),
  })
}

export function useUpdateCard(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, input }: { cardId: string; input: UpdateCardInput }) =>
      wsApi.updateCard(cardId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", projectId] }),
  })
}

// Card enriquecido com a chave/nome do projeto (para telas agregadas).
export interface BoardCard extends Card {
  projectKey: string
  projectName: string
}

// Agrega cards de TODOS os projetos do workspace (Meu Dia, Relatórios, Portfólio).
// Faz fan-out de uma query de cards por projeto e achata o resultado.
export function useWorkspaceCards(workspaceId: string | null) {
  const projectsQuery = useProjects(workspaceId)
  const projects = projectsQuery.data ?? []

  const cardQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["cards", p.id],
      queryFn: () => wsApi.listCards(p.id),
      enabled: !!workspaceId,
    })),
  })

  const cards: BoardCard[] = []
  projects.forEach((p, i) => {
    const data = cardQueries[i]?.data
    if (data) {
      for (const c of data) {
        cards.push({ ...c, projectKey: p.key, projectName: p.name })
      }
    }
  })

  const isLoading =
    projectsQuery.isLoading || cardQueries.some((q) => q.isLoading)

  return { projects, cards, isLoading }
}

// ---- Comentários ----
export function useComments(cardId: string | null) {
  return useQuery({
    queryKey: ["comments", cardId],
    queryFn: () => wsApi.listComments(cardId!),
    enabled: !!cardId,
  })
}

export function useCreateComment(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => wsApi.createComment(cardId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", cardId] }),
  })
}

// ---- Sprints ----
export function useSprints(projectId: string | null) {
  return useQuery({
    queryKey: ["sprints", projectId],
    queryFn: () => wsApi.listSprints(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateSprint(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSprintInput) => wsApi.createSprint(projectId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sprints", projectId] }),
  })
}

export function useUpdateSprint(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sprintId, input }: { sprintId: string; input: UpdateSprintInput }) =>
      wsApi.updateSprint(sprintId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sprints", projectId] }),
  })
}

// ---- Membros e convites ----
export function useMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => wsApi.listMembers(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useInvitations(workspaceId: string | null) {
  return useQuery({
    queryKey: ["invitations", workspaceId],
    queryFn: () => wsApi.listInvitations(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useInvite(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { email: string; role: Role }) =>
      wsApi.createInvitation(workspaceId!, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations", workspaceId] }),
  })
}

export function useRevokeInvite(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => wsApi.revokeInvitation(invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations", workspaceId] }),
  })
}
