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

export function usePokerCards(sessionId: string | null) {
  return useQuery({
    queryKey: ["poker-cards", sessionId],
    queryFn: () => pokerApi.getPokerCards(sessionId!),
    enabled: !!sessionId,
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
      // Sem isso o card aplicado ficava com pontos/estado velhos na barra lateral
      // até um F5 — a UI parecia travada ("Votando" grudado, pontos sumidos).
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
