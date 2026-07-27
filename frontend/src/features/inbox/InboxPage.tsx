// Tela de Atendimento — o layout de três painéis do Chatwoot dentro do
// Comercial: lista à esquerda, thread no centro, ficha do contato à direita.
//
// Sem conexão configurada, cai no formulário de conexão em vez de mostrar uma
// caixa vazia sem explicação.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Inbox as InboxIcon, Loader2, Settings2 } from "lucide-react"

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
import { DUR } from "./inbox.motion"
import { cleanFilters, contactDisplayName } from "./inbox.shared"
import type { AssigneeFilter, ConversationPriority, ConversationStatus } from "./inbox.types"

interface Props {
  workspaceId: string
}

export function InboxPage({ workspaceId }: Props) {
  const reduced = useReducedMotion()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [assignee, setAssignee] = useState<AssigneeFilter>("all")
  const [status, setStatus] = useState<ConversationStatus>("open")
  const [inboxId, setInboxId] = useState<number | undefined>()
  const [search, setSearch] = useState("")
  const [showSetup, setShowSetup] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

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
  const { data: page, isLoading: loadingList } = useConversations(workspaceId, filters, connected)
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

  // Eventos do webhook: invalida o que mudou e diz quem está digitando.
  const { typingConversations } = useInboxRealtime(workspaceId, connected)

  // ⌘F / Ctrl+F foca a busca — convenção de desktop em tela cheia de lista.
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    function onKeyDown(event: KeyboardEvent) {
      const modifier = isMac ? event.metaKey : event.ctrlKey
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      // Esc fecha a conversa e devolve o foco à lista.
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function selectConversation(id: number) {
    setActiveId(id)
    // Zerar o não-lidas é melhor esforço: falhar aqui não pode travar a abertura.
    void inboxApi.markSeen(workspaceId, id).catch(() => {})
  }

  if (loadingConnection) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-cw-muted" />
      </div>
    )
  }

  // Sem conexão (ou pedindo reconfiguração): formulário no lugar da caixa.
  if (!connectionState?.connection || showSetup) {
    return (
      <div className="rounded-lg border border-cw-border bg-white dark:border-ink-800 dark:bg-ink-900">
        {showSetup && connectionState?.connection && (
          <div className="flex justify-end p-3 pb-0">
            <button
              type="button"
              onClick={() => setShowSetup(false)}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-cw-muted transition-colors duration-100 hover:bg-cw-surface focus-ring dark:hover:bg-ink-800"
            >
              Voltar à caixa
            </button>
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
  const typingName =
    conversation && typingConversations.has(conversation.id)
      ? contactDisplayName(conversation)
      : null

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[520px] overflow-hidden rounded-lg border border-cw-border bg-white dark:border-ink-800 dark:bg-ink-900">
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
        searchRef={searchRef}
        onSelect={selectConversation}
        onAssigneeChange={setAssignee}
        onStatusChange={setStatus}
        onInboxChange={setInboxId}
        onSearchChange={setSearch}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <AnimatePresence>
          {!connected && (
            <motion.p
              key="broken"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.ui, ease: "easeOut" }}
              className="flex items-center gap-2 overflow-hidden border-b border-orange-400/40 bg-orange-100 px-4 py-2 text-[12px] text-orange-700"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">
                A conexão com o Chatwoot está com problema — os dados podem estar desatualizados.
              </span>
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors duration-100 hover:bg-orange-400/20 focus-ring"
              >
                <Settings2 className="size-3.5" /> Revisar
              </button>
            </motion.p>
          )}
        </AnimatePresence>

        {conversation ? (
          <>
            <ConversationHeader
              conversation={conversation}
              agents={catalog?.agents ?? []}
              teams={catalog?.teams ?? []}
              labels={catalog?.labels ?? []}
              busy={changeStatus.isPending}
              onAssign={(payload) => assign.mutate(payload)}
              onPriority={(priority: ConversationPriority | null) => changePriority.mutate(priority)}
              onLabels={(labels) => setLabels.mutate(labels)}
              onStatus={(next) => changeStatus.mutate({ status: next })}
              onMute={(muted) => setMuted.mutate(muted)}
            />

            <ConversationThread
              messages={messages}
              loading={loadingMessages}
              typingName={typingName}
            />

            <MessageComposer
              cannedResponses={catalog?.canned_responses ?? []}
              canReply={conversation.can_reply}
              sending={sendMessage.isPending}
              onSend={async (content, isPrivate) => {
                await sendMessage.mutateAsync({ content, private: isPrivate })
              }}
              onTyping={(typing) => {
                void inboxApi.signalTyping(workspaceId, conversation.id, typing).catch(() => {})
              }}
            />
          </>
        ) : (
          <div className="grid flex-1 place-items-center bg-cw-surface p-8 dark:bg-ink-950">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-12 place-items-center rounded-full bg-white text-cw-muted ring-1 ring-cw-border dark:bg-ink-800 dark:ring-ink-700">
                <InboxIcon className="size-5" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-cw-ink dark:text-paper">
                Escolha uma conversa
              </p>
              <p className="mt-1 max-w-xs text-[12px] text-cw-muted">
                Selecione uma conversa na lista ao lado para começar a atender.
              </p>
            </div>
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
