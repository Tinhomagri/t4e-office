// Hooks do Atendimento — react-query no padrão de sales.hooks.ts.
//
// Duas particularidades em relação aos outros módulos:
// 1. O tempo real vem de polling do log de webhooks (`useInboxRealtime`), que
//    invalida só as queries afetadas pelo evento em vez de recarregar tudo.
// 2. O envio de mensagem é otimista: a bolha aparece na hora com id negativo
//    e é substituída pela resposta real — atendimento sem eco imediato parece
//    travado.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { extractApiError } from "@/shared/api/client"
import { toast } from "@/shared/ui/toast"

import * as inboxApi from "./inbox.api"
import type {
  ChatContact,
  ConnectInput,
  ConversationFilters,
  Message,
  SendMessageInput,
} from "./inbox.types"

export const inboxKeys = {
  connection: (workspaceId: string | null) => ["chatwoot-connection", workspaceId] as const,
  catalog: (workspaceId: string | null) => ["chatwoot-catalog", workspaceId] as const,
  conversations: (workspaceId: string | null, filters?: ConversationFilters) =>
    ["chatwoot-conversations", workspaceId, filters ?? {}] as const,
  conversation: (workspaceId: string | null, id: number | null) =>
    ["chatwoot-conversation", workspaceId, id] as const,
  messages: (workspaceId: string | null, id: number | null) =>
    ["chatwoot-messages", workspaceId, id] as const,
  counts: (workspaceId: string | null) => ["chatwoot-counts", workspaceId] as const,
  contact: (workspaceId: string | null, id: number | null) =>
    ["chatwoot-contact", workspaceId, id] as const,
  contactConversations: (workspaceId: string | null, id: number | null) =>
    ["chatwoot-contact-conversations", workspaceId, id] as const,
  dealConversations: (workspaceId: string | null, dealId: string | null) =>
    ["chatwoot-deal-conversations", workspaceId, dealId] as const,
}

// ── Conexão ──────────────────────────────────────────────────────────────────
export function useChatwootConnection(workspaceId: string | null) {
  return useQuery({
    queryKey: inboxKeys.connection(workspaceId),
    queryFn: () => inboxApi.getConnection(workspaceId as string),
    enabled: Boolean(workspaceId),
  })
}

export function useConnectChatwoot(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<ConnectInput, "workspace_id">) =>
      inboxApi.connect({ workspace_id: workspaceId as string, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.connection(workspaceId) })
      qc.invalidateQueries({ queryKey: inboxKeys.catalog(workspaceId) })
      toast.success("Chatwoot conectado.")
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useTestChatwootConnection(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => inboxApi.testConnection(workspaceId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.connection(workspaceId) })
      toast.success("Conexão validada.")
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useDisconnectChatwoot(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => inboxApi.disconnect(workspaceId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.connection(workspaceId) })
      toast.success("Chatwoot desconectado.")
    },
    // Desconectar exige admin do workspace no backend — sem isso o clique
    // parecia não fazer nada.
    onError: (error) => toast.error(extractApiError(error)),
  })
}

// ── Catálogo e listagem ──────────────────────────────────────────────────────
export function useCatalog(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: inboxKeys.catalog(workspaceId),
    queryFn: () => inboxApi.getCatalog(workspaceId as string),
    enabled: Boolean(workspaceId) && enabled,
    // Caixas/agentes/etiquetas mudam quando o admin mexe: 5 min é folgado.
    staleTime: 5 * 60_000,
  })
}

export function useConversations(
  workspaceId: string | null,
  filters: ConversationFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: inboxKeys.conversations(workspaceId, filters),
    queryFn: () => inboxApi.listConversations(workspaceId as string, filters),
    enabled: Boolean(workspaceId) && enabled,
    // Mantém a lista anterior visível enquanto troca de pasta — sem flash.
    placeholderData: (previous) => previous,
  })
}

export function useConversation(workspaceId: string | null, conversationId: number | null) {
  return useQuery({
    queryKey: inboxKeys.conversation(workspaceId, conversationId),
    queryFn: () => inboxApi.getConversation(workspaceId as string, conversationId as number),
    enabled: Boolean(workspaceId) && Boolean(conversationId),
  })
}

export function useMessages(workspaceId: string | null, conversationId: number | null) {
  return useQuery({
    queryKey: inboxKeys.messages(workspaceId, conversationId),
    queryFn: () => inboxApi.listMessages(workspaceId as string, conversationId as number),
    enabled: Boolean(workspaceId) && Boolean(conversationId),
  })
}

export function useInboxCounts(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: inboxKeys.counts(workspaceId),
    queryFn: () => inboxApi.getCounts(workspaceId as string),
    enabled: Boolean(workspaceId) && enabled,
  })
}

// ── Envio ────────────────────────────────────────────────────────────────────
/**
 * Envia com bolha otimista. O id negativo marca a mensagem "em trânsito" —
 * a UI mostra o relógio nela e o react-query troca pelo objeto real no sucesso.
 */
export function useSendMessage(workspaceId: string | null, conversationId: number | null) {
  const qc = useQueryClient()
  const key = inboxKeys.messages(workspaceId, conversationId)

  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      inboxApi.sendMessage(workspaceId as string, conversationId as number, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Message[]>(key) ?? []
      const optimistic: Message = {
        id: -Date.now(),
        conversation_id: conversationId ?? 0,
        content: input.content,
        message_type: 1,
        direction: "outgoing",
        content_type: input.content_type ?? "text",
        content_attributes: input.content_attributes ?? {},
        private: input.private ?? false,
        status: "progress",
        created_at: new Date().toISOString(),
        sender: null,
        attachments: [],
      }
      qc.setQueryData<Message[]>(key, [...previous, optimistic])
      return { previous }
    },
    onError: (_error, _input, context) => {
      // Rollback: a bolha some e o texto volta para o campo (o componente cuida).
      if (context?.previous) qc.setQueryData(key, context.previous)
      toast.error("Não foi possível enviar a mensagem.")
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ["chatwoot-conversations", workspaceId] })
    },
  })
}

export function useDeleteMessage(workspaceId: string | null, conversationId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messageId: number) =>
      inboxApi.deleteMessage(workspaceId as string, conversationId as number, messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.messages(workspaceId, conversationId) })
      toast.success("Mensagem apagada.")
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

// ── Ações na conversa ────────────────────────────────────────────────────────
/** Invalida tudo que uma ação na conversa afeta: detalhe, lista e contadores. */
function useConversationInvalidation(workspaceId: string | null, conversationId: number | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: inboxKeys.conversation(workspaceId, conversationId) })
    qc.invalidateQueries({ queryKey: ["chatwoot-conversations", workspaceId] })
    qc.invalidateQueries({ queryKey: inboxKeys.counts(workspaceId) })
  }
}

export function useChangeStatus(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (payload: { status: string; snoozedUntil?: string }) =>
      inboxApi.changeStatus(
        workspaceId as string,
        conversationId as number,
        payload.status,
        payload.snoozedUntil,
      ),
    onSuccess: (_data, payload) => {
      invalidate()
      if (payload.status === "resolved") toast.success("Conversa resolvida.")
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useChangePriority(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (priority: string | null) =>
      inboxApi.changePriority(workspaceId as string, conversationId as number, priority),
    onSuccess: invalidate,
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useAssignConversation(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (assignee: { assignee_id?: number | null; team_id?: number | null }) =>
      inboxApi.assignConversation(workspaceId as string, conversationId as number, assignee),
    onSuccess: invalidate,
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useSetLabels(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (labels: string[]) =>
      inboxApi.setLabels(workspaceId as string, conversationId as number, labels),
    onSuccess: invalidate,
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useSetMuted(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (muted: boolean) =>
      inboxApi.setMuted(workspaceId as string, conversationId as number, muted),
    onSuccess: invalidate,
    onError: (error) => toast.error(extractApiError(error)),
  })
}

// ── Ponte com o funil ────────────────────────────────────────────────────────
export function useLinkConversation(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: (link: { deal_id?: string | null; customer_id?: string | null }) =>
      inboxApi.linkConversation(workspaceId as string, conversationId as number, link),
    onSuccess: (result) => {
      invalidate()
      if (result.mirrored_to_chatwoot) {
        toast.success("Conversa vinculada ao negócio.")
      } else {
        // O vínculo local valeu; só o espelho no Chatwoot não foi.
        toast.success("Vinculada aqui — o Chatwoot não respondeu para espelhar.")
      }
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useUnlinkConversation(workspaceId: string | null, conversationId: number | null) {
  const invalidate = useConversationInvalidation(workspaceId, conversationId)
  return useMutation({
    mutationFn: () =>
      inboxApi.unlinkConversation(workspaceId as string, conversationId as number),
    onSuccess: () => {
      invalidate()
      toast.success("Vínculo removido.")
    },
    onError: (error) => toast.error(extractApiError(error)),
  })
}

export function useDealConversations(workspaceId: string | null, dealId: string | null) {
  return useQuery({
    queryKey: inboxKeys.dealConversations(workspaceId, dealId),
    queryFn: () => inboxApi.listDealConversations(workspaceId as string, dealId as string),
    enabled: Boolean(workspaceId) && Boolean(dealId),
  })
}

// ── Contatos ─────────────────────────────────────────────────────────────────
export function useContact(workspaceId: string | null, contactId: number | null) {
  return useQuery({
    queryKey: inboxKeys.contact(workspaceId, contactId),
    queryFn: () => inboxApi.getContact(workspaceId as string, contactId as number),
    enabled: Boolean(workspaceId) && Boolean(contactId),
  })
}

export function useContactConversations(workspaceId: string | null, contactId: number | null) {
  return useQuery({
    queryKey: inboxKeys.contactConversations(workspaceId, contactId),
    queryFn: () => inboxApi.getContactConversations(workspaceId as string, contactId as number),
    enabled: Boolean(workspaceId) && Boolean(contactId),
  })
}

export function useUpdateContact(workspaceId: string | null, contactId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<ChatContact>) =>
      inboxApi.updateContact(workspaceId as string, contactId as number, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.contact(workspaceId, contactId) })
      qc.invalidateQueries({ queryKey: ["chatwoot-conversations", workspaceId] })
      toast.success("Contato atualizado.")
    },
  })
}

// ── Tempo real ───────────────────────────────────────────────────────────────
/**
 * Consome o log de webhooks e invalida só o que o evento tocou.
 *
 * É polling, não WebSocket: o Chatwoot empurra para o nosso backend, e o
 * frontend puxa daqui. Intervalo de 5s é o equilíbrio entre parecer instantâneo
 * e não martelar a API — quando o app ganhar canal WS, só esta função muda.
 */
export function useInboxRealtime(workspaceId: string | null, enabled = true) {
  const qc = useQueryClient()
  const cursor = useRef<string | null>(null)
  // Conversas em que o contato está digitando agora. Vive fora do cache do
  // react-query porque é estado efêmero: expira sozinho, não é dado do servidor.
  const [typing, setTyping] = useState<Set<number>>(new Set())
  const typingTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const { data } = useQuery({
    queryKey: ["chatwoot-events", workspaceId],
    queryFn: () => inboxApi.pollEvents(workspaceId as string, cursor.current),
    enabled: Boolean(workspaceId) && enabled,
    refetchInterval: 5_000,
    // O log é um fluxo: cachear resposta antiga não faz sentido.
    gcTime: 0,
  })

  // Limpa os timers pendentes ao desmontar — senão o setState roda depois.
  useEffect(() => {
    const timers = typingTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (!data || data.events.length === 0) return
    cursor.current = data.cursor ?? cursor.current

    const touchedConversations = new Set<number>()
    const typingOn: number[] = []
    const typingOff: number[] = []
    let listChanged = false

    for (const event of data.events) {
      const id = event.conversation_id
      if (event.event === "conversation_typing_on") {
        if (id) typingOn.push(id)
        continue
      }
      if (event.event === "conversation_typing_off") {
        if (id) typingOff.push(id)
        continue
      }
      if (id) touchedConversations.add(id)
      listChanged = true
    }

    for (const id of touchedConversations) {
      qc.invalidateQueries({ queryKey: inboxKeys.messages(workspaceId, id) })
      qc.invalidateQueries({ queryKey: inboxKeys.conversation(workspaceId, id) })
    }
    if (listChanged) {
      qc.invalidateQueries({ queryKey: ["chatwoot-conversations", workspaceId] })
      qc.invalidateQueries({ queryKey: inboxKeys.counts(workspaceId) })
    }

    // Chegar mensagem encerra o "digitando" — o texto virou mensagem.
    const stopped = [...typingOff, ...touchedConversations]
    if (typingOn.length === 0 && stopped.length === 0) return

    setTyping((current) => {
      const next = new Set(current)
      for (const id of typingOn) next.add(id)
      for (const id of stopped) next.delete(id)
      return next
    })

    // O Chatwoot nem sempre manda o `typing_off`. Sem expiração própria, o
    // indicador ficaria pulsando para sempre.
    for (const id of typingOn) {
      clearTimeout(typingTimers.current.get(id))
      typingTimers.current.set(
        id,
        setTimeout(() => {
          typingTimers.current.delete(id)
          setTyping((current) => {
            if (!current.has(id)) return current
            const next = new Set(current)
            next.delete(id)
            return next
          })
        }, 8_000),
      )
    }
  }, [data, qc, workspaceId])

  return { typingConversations: typing }
}
