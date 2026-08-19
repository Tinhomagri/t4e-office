import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "./publicBoard.api"

export function usePublicBoard(token: string | undefined, code?: string) {
  return useQuery({
    queryKey: ["public-board", token, code],
    queryFn: () => api.getPublicBoard(token!, code),
    enabled: !!token,
    // Outras pessoas podem estar olhando o mesmo link ao mesmo tempo que o
    // dev trabalha — reconsulta sozinho pra não parecer parado. Mais rápido
    // que o board interno porque aqui não tem SSE/notificação nenhuma
    // avisando de mudança — é o único jeito de perceber algo novo.
    refetchInterval: 5_000,
    retry: false,
  })
}

export function useCreatePublicCard(token: string | undefined, code?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      title: string
      description?: string
      status?: string
      image?: File
      flagged?: boolean
    }) => api.createPublicCard(token!, { ...input, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-board", token] }),
  })
}

export function usePublicMessages(token: string | undefined, enabled: boolean, code?: string) {
  return useQuery({
    queryKey: ["public-board-messages", token, code],
    queryFn: () => api.getPublicMessages(token!, code),
    enabled: enabled && !!token,
    refetchInterval: 10_000,
  })
}

export function useCreatePublicMessage(token: string | undefined, code?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { author_name: string; body: string }) =>
      api.createPublicMessage(token!, { ...input, code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-board-messages", token] }),
  })
}
