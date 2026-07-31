// Chat — integração real com a Google Chat API (auth de usuário, mesma conexão
// Google usada em Reuniões/Agenda). Layout de duas colunas: lista de espaços à
// esquerda, thread + composer à direita — a mesma anatomia do Google Chat.
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  Check,
  MessageCircle,
  MessagesSquare,
  Search,
  Send,
  Users,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useConnectGoogle, useGoogleStatus } from "@/features/integrations/integrations.hooks"
import { extractApiError } from "@/shared/api/client"
import { Button, EmptyState, PageHeader, Spinner, cx } from "@/shared/ui/primitives"
import {
  useChatMessages,
  useChatSpaces,
  useCreateChatDm,
  useSendChatMessage,
} from "./chat.hooks"
import type { ChatMessage, ChatSpace } from "./chat.types"

// Reimplementada aqui (não importada de integrations/) pra manter a feature
// autocontida — mesmo padrão usado em IntegrationsPage.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-cyan-500 to-sky-700",
]
function gradientFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function SpaceAvatar({ space, size = "md" }: { space: ChatSpace; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-8 text-xs" : "size-10 text-sm"
  if (space.is_group) {
    return (
      <span
        className={cx(
          "grid shrink-0 place-items-center rounded-full bg-paper-200 dark:bg-ink-700 text-paper-500",
          dim,
        )}
      >
        <Users className={size === "sm" ? "size-3.5" : "size-4"} />
      </span>
    )
  }
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white",
        gradientFor(space.display_name),
        dim,
      )}
    >
      {initialsOf(space.display_name)}
    </span>
  )
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}


// O Google Chat agrupa mensagens seguidas do mesmo autor dentro de 5 min:
// some o avatar e o cabeçalho, restando só o texto alinhado.
const GROUP_WINDOW_MS = 5 * 60 * 1000

function isGrouped(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  if (!prev || prev.sender_id !== m.sender_id) return false
  return (
    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
    GROUP_WINDOW_MS
  )
}

function DayDivider({ iso }: { iso: string }) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const label =
    d.toDateString() === today.toDateString()
      ? "Hoje"
      : d.toDateString() === yesterday.toDateString()
        ? "Ontem"
        : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-paper-200 dark:bg-ink-700" />
      <span className="text-[11px] font-medium text-paper-400">{label}</span>
      <span className="h-px flex-1 bg-paper-200 dark:bg-ink-700" />
    </div>
  )
}

/**
 * Linha de mensagem no padrão do Google Chat: sempre alinhada à esquerda, com
 * avatar e autor. Balão só de um lado (estilo WhatsApp) é outro produto — e em
 * conversa de grupo dificulta seguir quem falou o quê.
 */
function ChatRow({ message, grouped }: { message: ChatMessage; grouped: boolean }) {
  return (
    <div
      className={cx(
        "flex gap-3 rounded-lg px-2 transition-colors hover:bg-paper-50 dark:hover:bg-ink-800/60",
        grouped ? "py-0.5" : "pb-1 pt-2",
      )}
    >
      {grouped ? (
        <span className="w-9 shrink-0" />
      ) : (
        <span
          className={cx(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white",
            gradientFor(message.sender_name),
          )}
        >
          {initialsOf(message.sender_name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink dark:text-paper">
              {message.sender_name}
            </span>
            <span className="text-[11px] text-paper-400">{timeOf(message.created_at)}</span>
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink dark:text-paper">
          <Formatted text={message.text} />
        </p>
      </div>
    </div>
  )
}

/** Marcação do Google Chat: *negrito*, _itálico_, ~tachado~, `código`. */
function Formatted({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const inner = token.slice(1, -1)
    const key = String(match.index)
    if (token.startsWith("*")) parts.push(<strong key={key}>{inner}</strong>)
    else if (token.startsWith("_")) parts.push(<em key={key}>{inner}</em>)
    else if (token.startsWith("~")) parts.push(<s key={key}>{inner}</s>)
    else
      parts.push(
        <code
          key={key}
          className="rounded bg-paper-100 px-1 py-0.5 font-mono text-[12px] dark:bg-ink-700"
        >
          {inner}
        </code>,
      )
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function ChatPage() {
  const status = useGoogleStatus()
  const connect = useConnectGoogle()
  const connected = status.data?.connected ?? false

  const spaces = useChatSpaces(connected)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [newDmOpen, setNewDmOpen] = useState(false)

  const list = spaces.data ?? []
  const filtered = query.trim()
    ? list.filter((s) => s.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    : list
  const active = list.find((s) => s.space_id === activeId) ?? null

  // Ao carregar a lista, abre a primeira conversa — igual ao Chat real, que
  // nunca deixa a coluna direita vazia se já existe alguma conversa.
  useEffect(() => {
    if (!activeId && list.length > 0) setActiveId(list[0].space_id)
  }, [activeId, list])

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        eyebrow={
          <>
            <MessageCircle className="size-4 text-brand-500" />
            <span>Chat</span>
          </>
        }
        title="Chat"
        subtitle="Conversas do Google Chat, direto do workspace"
      >
        {connected && (
          <button
            onClick={() => setNewDmOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <MessagesSquare className="size-4" /> Nova conversa
          </button>
        )}
      </PageHeader>

      {!connected ? (
        <ConnectPrompt loading={connect.isPending} onConnect={() => connect.mutate()} />
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card">
          {/* ── coluna de espaços ── */}
          <aside className="flex w-72 shrink-0 flex-col border-r border-paper-100 dark:border-ink-800">
            <div className="p-3">
              <div className="flex items-center gap-2 rounded-full bg-paper-100 dark:bg-ink-800 px-3 py-2">
                <Search className="size-4 shrink-0 text-paper-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar conversa"
                  className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder-paper-400 dark:text-paper"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-slim px-2 pb-3">
              {spaces.isLoading && (
                <div className="flex justify-center py-10">
                  <Spinner className="size-5" />
                </div>
              )}
              {spaces.isError && (
                <p className="px-3 py-4 text-xs text-danger">{extractApiError(spaces.error)}</p>
              )}
              {!spaces.isLoading && filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-paper-400">
                  Nenhuma conversa encontrada.
                </p>
              )}
              {filtered.map((s) => (
                <button
                  key={s.space_id}
                  onClick={() => setActiveId(s.space_id)}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                    s.space_id === activeId
                      ? "bg-brand-50 dark:bg-brand-500/15"
                      : "hover:bg-paper-100 dark:hover:bg-ink-800",
                  )}
                >
                  <SpaceAvatar space={s} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        "truncate text-[13px] font-semibold",
                        s.space_id === activeId
                          ? "text-brand-700 dark:text-brand-300"
                          : "text-ink dark:text-paper",
                      )}
                    >
                      {s.display_name}
                    </p>
                    {s.last_message_preview && (
                      <p className="truncate text-xs text-paper-400">{s.last_message_preview}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* ── thread ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {active ? (
              <ChatThread space={active} />
            ) : (
              <EmptyState
                icon={<MessageCircle className="size-8" />}
                title="Nenhuma conversa selecionada"
                description="Escolha uma conversa à esquerda ou inicie uma nova."
                className="h-full flex-1 rounded-none border-none"
              />
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {newDmOpen && (
          <NewDmModal
            onClose={() => setNewDmOpen(false)}
            onCreated={(spaceId) => {
              setActiveId(spaceId)
              setNewDmOpen(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ChatThread({ space }: { space: ChatSpace }) {
  const messages = useChatMessages(space.space_id)
  const send = useSendChatMessage(space.space_id)
  const [text, setText] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.data?.length])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || send.isPending) return
    setText("")
    send.mutate(trimmed)
  }

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-paper-100 dark:border-ink-800 px-5 py-3.5">
        <SpaceAvatar space={space} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink dark:text-paper">
            {space.display_name}
          </p>
          {space.is_group && (
            <p className="truncate text-xs text-paper-400">{space.members.length} participantes</p>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-slim px-5 py-4">
        {messages.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        )}
        {messages.isError && (
          <p className="text-sm text-danger">{extractApiError(messages.error)}</p>
        )}
        {!messages.isLoading && (messages.data ?? []).length === 0 && (
          <p className="py-10 text-center text-sm text-paper-400">
            Ainda não há mensagens. Diga oi 👋
          </p>
        )}
        {(messages.data ?? []).map((m, i, all) => {
          const prev = all[i - 1]
          const newDay =
            !prev ||
            new Date(prev.created_at).toDateString() !==
              new Date(m.created_at).toDateString()
          return (
            <div key={m.message_id}>
              {newDay && <DayDivider iso={m.created_at} />}
              <ChatRow message={m} grouped={!newDay && isGrouped(prev, m)} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-paper-100 dark:border-ink-800 px-4 py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Enviar mensagem"
          className="flex-1 rounded-full border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800 px-4 py-2.5 text-sm text-ink outline-none placeholder-paper-400 focus:border-brand-400 dark:text-paper"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || send.isPending}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </>
  )
}

function ConnectPrompt({ loading, onConnect }: { loading: boolean; onConnect: () => void }) {
  return (
    <section className="mt-4 rounded-2xl border border-dashed border-paper-300 dark:border-ink-700 bg-paper-50 dark:bg-ink-900/60 p-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-100 text-blue-500 dark:bg-blue-500/15 dark:text-blue-400">
        <MessageCircle className="size-7" />
      </div>
      <p className="mt-4 text-base font-semibold text-ink dark:text-paper">Conecte o Google pra usar o Chat</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-paper-400">
        Mesma conexão usada em Agenda/Reuniões — suas conversas do Google Chat aparecem aqui.
      </p>
      <Button className="mx-auto mt-4 !rounded-full" loading={loading} onClick={onConnect}>
        Conectar Google
      </Button>
    </section>
  )
}

function NewDmModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (spaceId: string) => void
}) {
  const create = useCreateChatDm()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setError(null)
    try {
      const space = await create.mutateAsync(email.trim())
      onCreated(space.space_id)
    } catch (e) {
      setError(extractApiError(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-paper dark:bg-ink-800 shadow-pop"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-lg font-bold text-ink dark:text-paper">Nova conversa</h2>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink dark:text-paper">
              E-mail da pessoa
            </span>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@t4egroup.com.br"
              className="w-full rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900/60 px-3.5 py-2.5 text-sm text-ink outline-none placeholder-paper-400 focus:border-brand-400 dark:text-paper"
            />
          </label>
          {error && (
            <p className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-paper-100 dark:border-ink-700 px-6 py-4">
          <Button variant="ghost" className="!rounded-full" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Check className="size-4" />}
            loading={create.isPending}
            disabled={!email.trim()}
            onClick={handleCreate}
            className="!rounded-full"
          >
            Iniciar conversa
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
