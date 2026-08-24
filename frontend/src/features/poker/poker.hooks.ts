import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import * as pokerApi from "./poker.api"
import { pickActiveSession } from "./poker.selectors"

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["poker-session", sessionId],
    queryFn: () => pokerApi.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 2000, // polling 2s
  })
}

/** Cards disponíveis para a fila. `busca` chega ao backend porque a sessão da
 *  squad varre o workspace inteiro — filtrar só no cliente traria uma fatia
 *  arbitrária de milhares de cards. */
export function usePokerCards(sessionId: string | null, busca = "", projectId?: string) {
  const termo = busca.trim()
  return useQuery({
    queryKey: ["poker-cards", sessionId, termo, projectId ?? null],
    queryFn: () =>
      pokerApi.getPokerCards(sessionId!, {
        ...(termo ? { q: termo } : {}),
        ...(projectId ? { project: projectId } : {}),
      }),
    enabled: !!sessionId,
    // Mantém a lista anterior enquanto a busca nova viaja: sem isso a coluna
    // pisca em branco a cada tecla.
    placeholderData: (anterior) => anterior,
  })
}

export function useHeartbeat(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId) return
    pokerApi.heartbeat(sessionId)
    const timer = setInterval(() => pokerApi.heartbeat(sessionId), 10_000)
    return () => clearInterval(timer)
  }, [sessionId])
}

export function useLeaveSession() {
  return useMutation({
    mutationFn: (sessionId: string) => pokerApi.leaveSession(sessionId),
  })
}

export function useSquads(workspaceId: string | null) {
  return useQuery({
    queryKey: ["squads", workspaceId],
    queryFn: () => pokerApi.listSquads(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateSquad(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color?: string; member_ids?: string[] }) =>
      pokerApi.createSquad(workspaceId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["squads", workspaceId] }),
  })
}

export function useUpdateSquad(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ squadId, input }: {
      squadId: string
      input: { name?: string; color?: string; member_ids?: string[] }
    }) => pokerApi.updateSquad(squadId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["squads", workspaceId] }),
  })
}

export function useDeleteSquad(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (squadId: string) => pokerApi.deleteSquad(squadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["squads", workspaceId] }),
  })
}

/** Sessão da squad — sem projeto, estima cards de qualquer projeto. */
export function useCreateSquadSession(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ squadId, name }: { squadId: string; name: string }) =>
      pokerApi.createSquadSession(workspaceId!, squadId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poker-sessions", workspaceId] }),
  })
}

export function useCreateSession(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      pokerApi.createSession(workspaceId!, projectId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poker-sessions"] }),
  })
}

export function useJoinSession(sessionId: string | null) {
  return useMutation({
    mutationFn: () => pokerApi.joinSession(sessionId!),
  })
}

export function useSubmitVote(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: string) => pokerApi.submitVote(sessionId!, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poker-session", sessionId] }),
  })
}

// Não invalida a sessão de propósito: quem envia já vê a própria reação voar
// na hora (estado local) e os outros recebem no poll de 2s. Invalidar aqui só
// faria um request extra para buscar algo que o cliente já sabe.
export function useSendReaction(sessionId: string | null) {
  return useMutation({
    mutationFn: ({ toUserId, emoji }: { toUserId: string; emoji: string }) =>
      pokerApi.sendReaction(sessionId!, toUserId, emoji),
  })
}

export function useSendEmote(sessionId: string | null) {
  return useMutation({
    mutationFn: (emote: string) => pokerApi.sendEmote(sessionId!, emote),
  })
}

export function useUpdateSession(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: { status?: string; current_card_id?: string | null; card_ids?: string[] }) =>
      pokerApi.updateSession(sessionId!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poker-session", sessionId] }),
  })
}

// ---- Sala a partir do projeto/board ----
export function useProjectSessions(projectId: string | null) {
  return useQuery({
    queryKey: ["poker-sessions", "project", projectId],
    queryFn: () => pokerApi.listProjectSessions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateProjectSession(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input?: { name?: string; card_ids?: string[] }) =>
      pokerApi.createProjectSession(projectId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poker-sessions", "project", projectId] }),
  })
}

export function useRounds(sessionId: string | null) {
  return useQuery({
    queryKey: ["poker-rounds", sessionId],
    queryFn: () => pokerApi.getRounds(sessionId!),
    enabled: !!sessionId,
  })
}

export function usePokerSummary(workspaceId: string | null) {
  return useQuery({
    queryKey: ["poker-summary", workspaceId],
    queryFn: () => pokerApi.getWorkspaceSummary(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useApplyPoints(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (points: number) => pokerApi.applyPoints(sessionId!, points),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poker-session", sessionId] })
      // Sem isso o card aplicado ficava com peso/estado velhos na barra lateral
      // até um F5 — a UI parecia travada ("Votando" grudado, peso sumido).
      qc.invalidateQueries({ queryKey: ["poker-cards", sessionId] })
      qc.invalidateQueries({ queryKey: ["cards"] })
      qc.invalidateQueries({ queryKey: ["poker-rounds", sessionId] })
    },
  })
}

export function useActivePokerSession(workspaceId: string | null) {
  return useQuery({
    queryKey: ["poker-sessions", "workspace", workspaceId],
    queryFn: () => pokerApi.listSessions(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 2000,
    select: pickActiveSession,
  })
}

// Encerra uma sala a partir de uma lista (o id vem na chamada, não no hook) —
// é o que tira a sala de "salas abertas" no board.
export function useCloseProjectSession(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      pokerApi.updateSession(sessionId, { status: "done" }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["poker-sessions", "project", projectId] }),
  })
}
