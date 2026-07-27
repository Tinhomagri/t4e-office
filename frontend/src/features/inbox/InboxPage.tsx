// Tela de Atendimento — o layout de três painéis do Chatwoot dentro do
// Comercial: lista à esquerda, thread no centro, ficha do contato à direita.
//
// Sem conexão configurada, cai no formulário de conexão em vez de mostrar uma
// caixa vazia sem explicação.
import { useState } from "react"
import { AlertTriangle, Inbox as InboxIcon, Settings2 } from "lucide-react"

import { Button, EmptyState, Spinner } from "@/shared/ui/primitives"

import { ConnectionSetup } from "./ConnectionSetup"
import { ContactPanel } from "./ContactPanel"
import { ConversationHeader } from "./ConversationHeader"
import { ConversationList } from "./ConversationList"
import { ConversationThread } from "./ConversationThread"
import { MessageComposer } from "./MessageComposer"
import * as inboxApi from "./inbox.api"
import {
  useAssignConversation,
  useCatalog,
  useChangePriority,
  useChangeStatus,
  useChatwootConnection,
  useConnectChatwoot,
  useContact,
  useContactConversations,
  useConversation,
  useConversations,
  useDisconnectChatwoot,
  useInboxCounts,
  useInboxRealtime,
  useLinkConversation,
  useMessages,
  useSendMessage,
  useSetLabels,
  useSetMuted,
  useTestChatwootConnection,
  useUnlinkConversation,
} from "./inbox.hooks"
import { cleanFilters } from "./inbox.shared"
import type { AssigneeFilter, ConversationPriority, ConversationStatus } from "./inbox.types"

interface Props {
  workspaceId: string
}

export function InboxPage({ workspaceId }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [assignee, setAssignee] = useState<AssigneeFilter>("all")
  const [status, setStatus] = useState<ConversationStatus>("open")
  const [inboxId, setInboxId] = useState<number | undefined>()
  const [search, setSearch] = useState("")
  const [showSetup, setShowSetup] = useState(false)

  const { data: connectionState, isLoading: loadingConnection } =
    useChatwootConnection(workspaceId)
  const connect = useConnectChatwoot(workspaceId)
  const testConnection = useTestChatwootConnection(workspaceId)
  const disconnect = useDisconnectChatwoot(workspaceId)

  const connected = connectionState?.connected ?? false

  const filters = cleanFilters({
    status,
    assignee_type: assignee,
    inbox_id: inboxId,
    q: search.trim(),
  })

  const { data: catalog } = useCatalog(workspaceId, connected)
  const { data: page, isLoading: loadingList } = useConversations(
    workspaceId,
    filters,
    connected,
  )
  const { data: counts } = useInboxCounts(workspaceId, connected)
  const { data: conversation } = useConversation(workspaceId, activeId)
  const { data: messages = [], isLoading: loadingMessages } = useMessages(workspaceId, activeId)

  const contactId = conversation?.contact?.id ?? null
  const { data: contact } = useContact(workspaceId, contactId)
  const { data: previousConversations = [] } = useContactConversations(workspaceId, contactId)

  const sendMessage = useSendMessage(workspaceId, activeId)
  const changeStatus = useChangeStatus(workspaceId, activeId)
  const changePriority = useChangePriority(workspaceId, activeId)
  const assign = useAssignConversation(workspaceId, activeId)
  const setLabels = useSetLabels(workspaceId, activeId)
  const setMuted = useSetMuted(workspaceId, activeId)
  const link = useLinkConversation(workspaceId, activeId)
  const unlink = useUnlinkConversation(workspaceId, activeId)

  // Puxa os eventos do webhook e invalida só o que mudou.
  useInboxRealtime(workspaceId, connected)

  function selectConversation(id: number) {
    setActiveId(id)
    // Zerar o não-lidas é melhor esforço: falhar aqui não pode travar a abertura.
    void inboxApi.markSeen(workspaceId, id).catch(() => {})
  }

  if (loadingConnection) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  // Sem conexão (ou pedindo para reconfigurar): formulário no lugar da caixa.
  if (!connectionState?.connection || showSetup) {
    return (
      <div className="rounded-2xl border border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900">
        {showSetup && connectionState?.connection && (
          <div className="flex justify-end p-3 pb-0">
            <Button variant="ghost" size="sm" onClick={() => setShowSetup(false)}>
              Voltar à caixa
            </Button>
          </div>
        )}
        <ConnectionSetup
          connection={connectionState?.connection ?? null}
          saving={connect.isPending}
          testing={testConnection.isPending}
          onConnect={(input) => connect.mutate(input)}
          onTest={() => testConnection.mutate()}
          onDisconnect={() => {
            disconnect.mutate()
            setShowSetup(false)
          }}
        />
      </div>
    )
  }

  const conversations = page?.payload ?? []

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[520px] overflow-hidden rounded-2xl border border-paper-300 bg-paper dark:border-ink-800 dark:bg-ink-900">
      <ConversationList
        conversations={conversations}
        counts={counts}
        inboxes={catalog?.inboxes ?? []}
        activeId={activeId}
        assignee={assignee}
        status={status}
        inboxId={inboxId}
        search={search}
        loading={loadingList}
        onSelect={selectConversation}
        onAssigneeChange={setAssignee}
        onStatusChange={setStatus}
        onInboxChange={setInboxId}
        onSearchChange={setSearch}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {!connected && (
          <p className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-[12px]">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="flex-1">
              A conexão com o Chatwoot está com problema — os dados podem estar desatualizados.
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings2 className="size-3.5" />}
              onClick={() => setShowSetup(true)}
            >
              Revisar
            </Button>
          </p>
        )}

        {conversation ? (
          <>
            <ConversationHeader
              conversation={conversation}
              agents={catalog?.agents ?? []}
              teams={catalog?.teams ?? []}
              labels={catalog?.labels ?? []}
              busy={changeStatus.isPending}
              onAssign={(payload) => assign.mutate(payload)}
              onPriority={(priority: ConversationPriority | null) =>
                changePriority.mutate(priority)
              }
              onLabels={(labels) => setLabels.mutate(labels)}
              onStatus={(next) => changeStatus.mutate({ status: next })}
              onMute={(muted) => setMuted.mutate(muted)}
            />

            <ConversationThread messages={messages} loading={loadingMessages} />

            <MessageComposer
              cannedResponses={catalog?.canned_responses ?? []}
              canReply={conversation.can_reply}
              sending={sendMessage.isPending}
              onSend={async (content, isPrivate) => {
                await sendMessage.mutateAsync({ content, private: isPrivate })
              }}
              onTyping={(typing) => {
                void inboxApi
                  .signalTyping(workspaceId, conversation.id, typing)
                  .catch(() => {})
              }}
            />
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8">
            <EmptyState
              icon={<InboxIcon className="size-6" />}
              title="Escolha uma conversa"
              description="Selecione uma conversa na lista ao lado para começar a atender."
            />
          </div>
        )}
      </main>

      {conversation && (
        <div className="hidden lg:block">
          <ContactPanel
            workspaceId={workspaceId}
            conversation={conversation}
            contact={contact}
            previousConversations={previousConversations}
            linking={link.isPending || unlink.isPending}
            onSelectConversation={selectConversation}
            onLink={(payload) => link.mutate(payload)}
            onUnlink={() => unlink.mutate()}
          />
        </div>
      )}
    </div>
  )
}
