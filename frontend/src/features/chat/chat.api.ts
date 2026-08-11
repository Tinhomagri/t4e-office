import { api } from "@/shared/api/client"

import type { ChatMessage, ChatSpace } from "./chat.types"

export async function listChatSpaces(): Promise<ChatSpace[]> {
  const { data } = await api.get<ChatSpace[]>("/google/chat/spaces/")
  return data
}

export async function createChatDm(memberEmail: string): Promise<ChatSpace> {
  const { data } = await api.post<ChatSpace>("/google/chat/spaces/dm/", {
    member_email: memberEmail,
  })
  return data
}

// `spaceId` já vem como "spaces/AAA" (nome de recurso do Chat, com barra) — a
// rota do backend usa um path converter que aceita a barra literal, sem
// precisar url-encodar.
export async function listChatMessages(spaceId: string): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(`/google/chat/spaces/${spaceId}/messages/`)
  return data
}

export async function sendChatMessage(spaceId: string, text: string): Promise<ChatMessage> {
  const { data } = await api.post<ChatMessage>(`/google/chat/spaces/${spaceId}/messages/`, {
    text,
  })
  return data
}
