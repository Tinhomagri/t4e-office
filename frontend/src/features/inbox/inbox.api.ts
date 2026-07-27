// Camada HTTP do Atendimento. Mesmo padrão de sales.api.ts: funções finas
// sobre o client axios, tipadas, sem cache (isso é dos hooks).
//
// Toda rota exige `workspace_id` — é ele que resolve qual instância Chatwoot
// atender (multi-tenancy).
import { api } from "@/shared/api/client"

import type {
  Catalog,
  ChatContact,
  ConnectInput,
  ChatwootConnection,
  ConnectionState,
  Conversation,
  ConversationFilters,
  ConversationPage,
  EventStream,
  InboxCounts,
  Message,
  SendMessageInput,
} from "./inbox.types"

// ---- Conexão ----
export async function getConnection(workspaceId: string): Promise<ConnectionState> {
  const { data } = await api.get<ConnectionState>("/chatwoot/connection/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function connect(input: ConnectInput): Promise<ChatwootConnection> {
  const { data } = await api.post<ChatwootConnection>("/chatwoot/connection/", input)
  return data
}

export async function testConnection(workspaceId: string): Promise<ChatwootConnection> {
  const { data } = await api.post<ChatwootConnection>("/chatwoot/connection/test/", {
    workspace_id: workspaceId,
  })
  return data
}

export async function disconnect(workspaceId: string): Promise<void> {
  await api.delete("/chatwoot/connection/", { params: { workspace_id: workspaceId } })
}

// ---- Catálogo (caixas, agentes, times, etiquetas, respostas prontas) ----
export async function getCatalog(workspaceId: string): Promise<Catalog> {
  const { data } = await api.get<Catalog>("/chatwoot/catalog/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

// ---- Conversas ----
export async function listConversations(
  workspaceId: string,
  filters: ConversationFilters = {},
): Promise<ConversationPage> {
  const { data } = await api.get<ConversationPage>("/chatwoot/conversations/", {
    params: { workspace_id: workspaceId, ...filters },
    // `labels` é lista: o DRF lê `?labels=a&labels=b`, não `labels[]`.
    paramsSerializer: { indexes: null },
  })
  return data
}

export async function getConversation(
  workspaceId: string,
  conversationId: number,
): Promise<Conversation> {
  const { data } = await api.get<Conversation>(`/chatwoot/conversations/${conversationId}/`, {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function getCounts(workspaceId: string): Promise<InboxCounts> {
  const { data } = await api.get<InboxCounts>("/chatwoot/conversations/counts/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

// ---- Mensagens ----
export async function listMessages(
  workspaceId: string,
  conversationId: number,
  before?: number,
): Promise<Message[]> {
  const { data } = await api.get<Message[]>(
    `/chatwoot/conversations/${conversationId}/messages/`,
    { params: { workspace_id: workspaceId, before } },
  )
  return data
}

export async function sendMessage(
  workspaceId: string,
  conversationId: number,
  input: SendMessageInput,
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/chatwoot/conversations/${conversationId}/messages/`,
    { workspace_id: workspaceId, ...input },
  )
  return data
}

export async function deleteMessage(
  workspaceId: string,
  conversationId: number,
  messageId: number,
): Promise<void> {
  await api.delete(`/chatwoot/conversations/${conversationId}/messages/${messageId}/`, {
    params: { workspace_id: workspaceId },
  })
}

// ---- Ações na conversa ----
export async function changeStatus(
  workspaceId: string,
  conversationId: number,
  status: string,
  snoozedUntil?: string,
): Promise<void> {
  await api.post(`/chatwoot/conversations/${conversationId}/status/`, {
    workspace_id: workspaceId,
    status,
    snoozed_until: snoozedUntil,
  })
}

export async function changePriority(
  workspaceId: string,
  conversationId: number,
  priority: string | null,
): Promise<void> {
  await api.post(`/chatwoot/conversations/${conversationId}/priority/`, {
    workspace_id: workspaceId,
    priority,
  })
}

export async function assignConversation(
  workspaceId: string,
  conversationId: number,
  assignee: { assignee_id?: number | null; team_id?: number | null },
): Promise<void> {
  await api.post(`/chatwoot/conversations/${conversationId}/assign/`, {
    workspace_id: workspaceId,
    ...assignee,
  })
}

export async function setLabels(
  workspaceId: string,
  conversationId: number,
  labels: string[],
): Promise<string[]> {
  const { data } = await api.post<{ labels: string[] }>(
    `/chatwoot/conversations/${conversationId}/labels/`,
    { workspace_id: workspaceId, labels },
  )
  return data.labels
}

export async function setAttributes(
  workspaceId: string,
  conversationId: number,
  attributes: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data } = await api.post<{ custom_attributes: Record<string, unknown> }>(
    `/chatwoot/conversations/${conversationId}/attributes/`,
    { workspace_id: workspaceId, custom_attributes: attributes },
  )
  return data.custom_attributes
}

export async function setMuted(
  workspaceId: string,
  conversationId: number,
  muted: boolean,
): Promise<void> {
  const url = `/chatwoot/conversations/${conversationId}/mute/`
  if (muted) {
    await api.post(url, { workspace_id: workspaceId })
  } else {
    await api.delete(url, { params: { workspace_id: workspaceId } })
  }
}

/** Melhor esforço: "digitando…" não pode derrubar o envio se falhar. */
export async function signalTyping(
  workspaceId: string,
  conversationId: number,
  typingOn: boolean,
): Promise<void> {
  await api.post(`/chatwoot/conversations/${conversationId}/typing/`, {
    workspace_id: workspaceId,
    typing_on: typingOn,
  })
}

export async function markSeen(workspaceId: string, conversationId: number): Promise<void> {
  await api.post(`/chatwoot/conversations/${conversationId}/seen/`, {
    workspace_id: workspaceId,
  })
}

// ---- Ponte com o funil ----
export async function linkConversation(
  workspaceId: string,
  conversationId: number,
  link: { deal_id?: string | null; customer_id?: string | null },
): Promise<{ mirrored_to_chatwoot: boolean }> {
  const { data } = await api.post(`/chatwoot/conversations/${conversationId}/link/`, {
    workspace_id: workspaceId,
    ...link,
  })
  return data
}

export async function unlinkConversation(
  workspaceId: string,
  conversationId: number,
): Promise<void> {
  await api.delete(`/chatwoot/conversations/${conversationId}/link/`, {
    params: { workspace_id: workspaceId },
  })
}

export async function listDealConversations(
  workspaceId: string,
  dealId: string,
): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>(`/chatwoot/deals/${dealId}/conversations/`, {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function listCustomerConversations(
  workspaceId: string,
  customerId: string,
): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>(
    `/chatwoot/customers/${customerId}/conversations/`,
    { params: { workspace_id: workspaceId } },
  )
  return data
}

// ---- Contatos ----
export async function searchContacts(workspaceId: string, q: string): Promise<ChatContact[]> {
  const { data } = await api.get<ChatContact[]>("/chatwoot/contacts/", {
    params: { workspace_id: workspaceId, q },
  })
  return data
}

export async function getContact(workspaceId: string, contactId: number): Promise<ChatContact> {
  const { data } = await api.get<ChatContact>(`/chatwoot/contacts/${contactId}/`, {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function updateContact(
  workspaceId: string,
  contactId: number,
  payload: Partial<ChatContact>,
): Promise<ChatContact> {
  const { data } = await api.patch<ChatContact>(`/chatwoot/contacts/${contactId}/`, {
    workspace_id: workspaceId,
    ...payload,
  })
  return data
}

export async function getContactConversations(
  workspaceId: string,
  contactId: number,
): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>(
    `/chatwoot/contacts/${contactId}/conversations/`,
    { params: { workspace_id: workspaceId } },
  )
  return data
}

// ---- Tempo real (polling dos eventos do webhook) ----
export async function pollEvents(workspaceId: string, after?: string | null): Promise<EventStream> {
  const { data } = await api.get<EventStream>("/chatwoot/events/", {
    params: { workspace_id: workspaceId, after },
  })
  return data
}
