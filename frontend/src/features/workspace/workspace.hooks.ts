import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
import { toast } from "@/shared/ui/toast"

import * as wsApi from "./workspace.api"
import { useWorkspaceStore } from "./workspace.store"
import type { Card } from "./workspace.types"
import type {
  Capability,
  CreateCardInput,
  CreateIssueLinkInput,
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
export function useCards(projectId: string | null, jql?: string) {
  return useQuery({
    queryKey: ["cards", projectId, jql],
    queryFn: () => wsApi.listCards(projectId!, jql),
    enabled: !!projectId,
  })
}

export function useCardSearch(projectId: string | null, jql: string) {
  return useQuery({
    queryKey: ["card-search", projectId, jql],
    queryFn: () => wsApi.listCards(projectId!, jql),
    enabled: !!projectId && jql.trim().length > 0,
    staleTime: 10_000,
  })
}

export function useCreateCard(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCardInput) => wsApi.createCard(projectId!, input),
    onSuccess: (card) => {
      qc.invalidateQueries({ queryKey: ["cards", projectId] })
      toast.success(`Card ${card.ref} criado`)
    },
  })
}

export function useUpdateCard(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, input }: { cardId: string; input: UpdateCardInput }) =>
      wsApi.updateCard(cardId, input),
    onSuccess: (_data, { cardId }) => {
      qc.invalidateQueries({ queryKey: ["cards", projectId] })
      qc.invalidateQueries({ queryKey: ["card-history", cardId] })
    },
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

export function useCardHistory(cardId: string | null) {
  return useQuery({
    queryKey: ["card-history", cardId],
    queryFn: () => wsApi.listCardHistory(cardId!),
    enabled: !!cardId,
  })
}

export function useCreateComment(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: string | { body: string; mentions: string[] }) =>
      typeof input === "string"
        ? wsApi.createComment(cardId!, input)
        : wsApi.createComment(cardId!, input.body, input.mentions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", cardId] }),
  })
}

// ---- Vínculos entre cards ----
export function useCardLinks(cardId: string | null) {
  return useQuery({
    queryKey: ["card-links", cardId],
    queryFn: () => wsApi.listCardLinks(cardId!),
    enabled: !!cardId,
  })
}

export function useCreateCardLink(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateIssueLinkInput) => wsApi.createCardLink(cardId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-links", cardId] }),
  })
}

export function useDeleteCardLink(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => wsApi.deleteCardLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-links", cardId] }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sprints", projectId] })
      toast.success("Sprint criada")
    },
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

// ---- Versions ----
export function useVersions(projectId: string | null) {
  return useQuery({
    queryKey: ["versions", projectId],
    queryFn: () => wsApi.listVersions(projectId!),
    enabled: !!projectId,
  })
}

export function useCardVersions(cardId: string | null) {
  return useQuery({
    queryKey: ["card-versions", cardId],
    queryFn: () => wsApi.listCardVersions(cardId!),
    enabled: !!cardId,
  })
}

export function useAddCardVersion(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => wsApi.addCardVersion(cardId!, versionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-versions", cardId] }),
  })
}

export function useRemoveCardVersion(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => wsApi.removeCardVersion(cardId!, versionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-versions", cardId] }),
  })
}

// ---- Components ----
export function useComponents(projectId: string | null) {
  return useQuery({
    queryKey: ["components", projectId],
    queryFn: () => wsApi.listComponents(projectId!),
    enabled: !!projectId,
  })
}

export function useCardComponents(cardId: string | null) {
  return useQuery({
    queryKey: ["card-components", cardId],
    queryFn: () => wsApi.listCardComponents(cardId!),
    enabled: !!cardId,
  })
}

export function useAddCardComponent(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (componentId: string) => wsApi.addCardComponent(cardId!, componentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-components", cardId] }),
  })
}

export function useRemoveCardComponent(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (componentId: string) => wsApi.removeCardComponent(cardId!, componentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-components", cardId] }),
  })
}

// ---- Workflow Statuses ----
export function useWorkflowStatuses(projectId: string | null) {
  return useQuery({
    queryKey: ["workflow-statuses", projectId],
    queryFn: () => wsApi.listWorkflowStatuses(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateWorkflowStatus(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: import("./workspace.types").CreateWorkflowStatusInput) =>
      wsApi.createWorkflowStatus(projectId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-statuses", projectId] }),
  })
}

export function useUpdateWorkflowStatus(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ statusId, input }: { statusId: string; input: import("./workspace.types").UpdateWorkflowStatusInput }) =>
      wsApi.updateWorkflowStatus(statusId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-statuses", projectId] }),
  })
}

export function useDeleteWorkflowStatus(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (statusId: string) => wsApi.deleteWorkflowStatus(statusId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-statuses", projectId] }),
  })
}

// ---- Custom Fields ----
export function useCustomFields(projectId: string | null) {
  return useQuery({
    queryKey: ["custom-fields", projectId],
    queryFn: () => wsApi.listCustomFields(projectId!),
    enabled: !!projectId,
  })
}

export function useFieldValues(cardId: string | null) {
  return useQuery({
    queryKey: ["field-values", cardId],
    queryFn: () => wsApi.listFieldValues(cardId!),
    enabled: !!cardId,
  })
}

export function useUpsertFieldValue(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: unknown }) =>
      wsApi.upsertFieldValue(cardId!, fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-values", cardId] }),
  })
}

// ---- Attachments ----
export function useAttachments(cardId: string | null) {
  return useQuery({
    queryKey: ["attachments", cardId],
    queryFn: () => wsApi.listAttachments(cardId!),
    enabled: !!cardId,
  })
}

export function useUploadAttachment(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => wsApi.uploadAttachment(cardId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments", cardId] }),
  })
}

export function useDeleteAttachment(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => wsApi.deleteAttachment(attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments", cardId] }),
  })
}

// ---- Worklogs ----
export function useWorklogs(cardId: string | null) {
  return useQuery({
    queryKey: ["worklogs", cardId],
    queryFn: () => wsApi.listWorklogs(cardId!),
    enabled: !!cardId,
  })
}

export function useCreateWorklog(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: import("./workspace.types").CreateWorklogInput) =>
      wsApi.createWorklog(cardId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklogs", cardId] }),
  })
}

export function useDeleteWorklog(cardId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (worklogId: string) => wsApi.deleteWorklog(worklogId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklogs", cardId] }),
  })
}

// ---- Notifications ----

/** Polls REST endpoint for notifications list. Refetches when invalidated. */
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => wsApi.listNotifications(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => wsApi.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => wsApi.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

/**
 * Stream de notificações via fetch-streaming (SSE) com header Authorization.
 *
 * Substitui o antigo EventSource, que (1) só aceitava token na query string —
 * vazava o JWT nos logs do servidor — e (2) reconectava sem parar em caso de
 * 401, gerando tempestade de requisições. Aqui:
 *  - o token vai no header (fora da URL);
 *  - 401/403 PARA a reconexão (evita o flood);
 *  - demais quedas reconectam com backoff exponencial (3s→30s).
 */
export function useNotificationStream(onNew: (n: import("./workspace.types").Notification) => void) {
  const qc = useQueryClient()
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew

  useEffect(() => {
    const controller = new AbortController()
    let stopped = false
    let retry = 3_000

    const run = async () => {
      while (!stopped) {
        const token = useAuthStore.getState().accessToken
        if (!token) {
          // Sem sessão: não adianta tentar. Espera e revê.
          await sleep(5_000, controller.signal)
          continue
        }
        try {
          const base = import.meta.env.VITE_API_BASE_URL ?? ""
          const res = await fetch(`${base}/api/notifications/stream/`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
            signal: controller.signal,
          })

          // Falha de autenticação: parar de vez (sem este token não há stream).
          if (res.status === 401 || res.status === 403) return
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)

          retry = 3_000 // conexão ok → reseta o backoff
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break // backend fecha ~55s → reconecta
            buffer += decoder.decode(value, { stream: true })
            // Eventos SSE são separados por linha em branco.
            const events = buffer.split("\n\n")
            buffer = events.pop() ?? ""
            for (const evt of events) {
              const line = evt.split("\n").find((l) => l.startsWith("data:"))
              if (!line) continue // heartbeat (linhas ": ...")
              try {
                const notif = JSON.parse(line.slice(5).trim()) as import("./workspace.types").Notification
                onNewRef.current(notif)
                qc.invalidateQueries({ queryKey: ["notifications"] })
              } catch {
                // ignora linhas que não são JSON
              }
            }
          }
        } catch {
          if (stopped) return
        }
        // Reconexão com backoff exponencial limitado a 30s.
        await sleep(retry, controller.signal)
        retry = Math.min(retry * 2, 30_000)
      }
    }

    run()
    return () => {
      stopped = true
      controller.abort()
    }
  }, [qc])
}

// Espera cancelável usada pelo backoff do stream.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
  })
}

// ---- Automations ----
export function useAutomationRules(projectId: string | null) {
  return useQuery({
    queryKey: ["automation-rules", projectId],
    queryFn: () => wsApi.listAutomationRules(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateAutomationRule(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: import("./workspace.types").CreateAutomationRuleInput) =>
      wsApi.createAutomationRule(projectId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules", projectId] }),
  })
}

export function useUpdateAutomationRule(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: Partial<import("./workspace.types").CreateAutomationRuleInput> }) =>
      wsApi.updateAutomationRule(ruleId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules", projectId] }),
  })
}

export function useDeleteAutomationRule(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => wsApi.deleteAutomationRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules", projectId] }),
  })
}

export function useRunAutomationRule(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => wsApi.runAutomationRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules", projectId] }),
  })
}

export function useAutomationRunLogs(ruleId: string | null) {
  return useQuery({
    queryKey: ["automation-logs", ruleId],
    queryFn: () => wsApi.listAutomationRunLogs(ruleId!),
    enabled: !!ruleId,
  })
}

// ---- Reports ----
export function useProjectReports(projectId: string | null) {
  return useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => wsApi.getProjectReports(projectId!),
    enabled: !!projectId,
  })
}

// Permissões do usuário atual num projeto (Domínio 12).
// Retorna a query + helper `can(capability)` para esconder/desabilitar ações.
export function useProjectPermissions(projectId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["project-permissions", projectId],
    queryFn: () => wsApi.getMyPermissions(projectId as string),
    enabled: !!projectId,
    staleTime: 60_000,
  })
  const can = useCallback(
    (capability: Capability) => query.data?.capabilities.includes(capability) ?? false,
    [query.data],
  )
  return { ...query, can, role: query.data?.role ?? null }
}
