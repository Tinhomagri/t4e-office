import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as chatApi from "./chat.api"

export function useChatSpaces(enabled: boolean) {
  return useQuery({
    queryKey: ["google", "chat", "spaces"],
    queryFn: chatApi.listChatSpaces,
    enabled,
    // Sem push da Chat API pra apps de usuário — polling curto é o jeito
    // realista de simular "quase tempo real" sem Pub/Sub.
    refetchInterval: 15_000,
  })
}

export function useChatMessages(spaceId: string | null) {
  return useQuery({
    queryKey: ["google", "chat", "messages", spaceId],
    queryFn: () => chatApi.listChatMessages(spaceId!),
    enabled: !!spaceId,
    refetchInterval: 4_000,
  })
}

export function useCreateChatDm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberEmail: string) => chatApi.createChatDm(memberEmail),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "chat", "spaces"] }),
  })
}

export function useSendChatMessage(spaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => chatApi.sendChatMessage(spaceId!, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google", "chat", "messages", spaceId] })
      qc.invalidateQueries({ queryKey: ["google", "chat", "spaces"] })
    },
  })
}
