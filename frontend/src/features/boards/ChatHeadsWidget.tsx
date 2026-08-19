// Bolinha de chat, acima do Copiloto: agrupa mensagem de cliente por board
// (mural) e deixa abrir várias janelas de conversa ao mesmo tempo, dockadas
// no rodapé — igual o chat heads do Messenger. Substitui o toast que ficava
// escondido atrás do Copiloto.
import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CornerUpLeft, MessageCircle, Send, X } from "lucide-react"

import {
  useBoardMessages,
  useCreateBoardMessage,
  useMarkNotificationRead,
  useNotifications,
  useNotificationStream,
  useProject,
} from "@/features/workspace/workspace.hooks"
import type { BoardMessage, Notification } from "@/features/workspace/workspace.types"
import { Spinner, cx } from "@/shared/ui/primitives"
import { beep } from "@/shared/ui/sound"

function projectIdFromLink(link: string): string | null {
  try {
    return new URL(link, window.location.origin).searchParams.get("project")
  } catch {
    return null
  }
}

interface Thread {
  projectId: string
  unread: number
  latest: Notification
}

// Notificações já vêm mais recentes primeiro (ordering do backend) — o
// primeiro board_message de cada projeto encontrado já é o mais novo dele.
function groupThreads(notifications: Notification[]): Thread[] {
  const order: string[] = []
  const map = new Map<string, Thread>()
  for (const n of notifications) {
    if (n.type !== "board_message" || !n.link) continue
    const projectId = projectIdFromLink(n.link)
    if (!projectId) continue
    let t = map.get(projectId)
    if (!t) {
      t = { projectId, unread: 0, latest: n }
      map.set(projectId, t)
      order.push(projectId)
    }
    if (!n.read) t.unread += 1
  }
  return order.map((id) => map.get(id)!)
}

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export function ChatHeadsWidget() {
  const { data: notifications } = useNotifications()
  const threads = useMemo(() => groupThreads(notifications ?? []), [notifications])
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [openChats, setOpenChats] = useState<string[]>([])
  const popoverRef = useRef<HTMLDivElement>(null)
  const markRead = useMarkNotificationRead()
  const qc = useQueryClient()

  const unreadTotal = threads.reduce((acc, t) => acc + t.unread, 0)

  // Bipe mesmo com a bolinha fechada — é o ponto: perceber sem precisar
  // estar de olho no popover ou com o chat aberto. Invalida o cache do
  // mural daquele projeto na hora — sem isto, quem tava com a aba Cliente
  // aberta só via a mensagem no próximo poll (até 10s depois do bipe).
  useNotificationStream((n) => {
    if (n.type !== "board_message") return
    beep()
    const projectId = projectIdFromLink(n.link)
    if (projectId) qc.invalidateQueries({ queryKey: ["board-messages", projectId] })
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const openThread = (t: Thread) => {
    setOpenChats((chats) => (chats.includes(t.projectId) ? chats : [...chats, t.projectId]))
    setPopoverOpen(false)
    // Notificações não lidas deste projeto: some com o ponto assim que abre a
    // conversa, igual marcar como lida ao abrir um chat de verdade.
    ;(notifications ?? [])
      .filter((n) => n.type === "board_message" && !n.read && projectIdFromLink(n.link) === t.projectId)
      .forEach((n) => markRead.mutate(n.id))
  }

  const closeChat = (projectId: string) => {
    setOpenChats((chats) => chats.filter((id) => id !== projectId))
  }

  return (
    <>
      {openChats.map((projectId, i) => (
        <ChatHeadWindow
          key={projectId}
          projectId={projectId}
          offset={i}
          onClose={() => closeChat(projectId)}
        />
      ))}

      <div ref={popoverRef}>
        {popoverOpen && (
          <div className="fixed bottom-[10.5rem] right-6 z-50 max-h-[26rem] w-80 overflow-y-auto rounded-2xl border border-paper-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900">
            <div className="border-b border-paper-100 px-4 py-3 dark:border-ink-800">
              <p className="text-sm font-semibold text-ink dark:text-paper">Mensagens de clientes</p>
            </div>
            {threads.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-paper-400">Nenhuma conversa ainda.</p>
            ) : (
              threads.map((t) => (
                <ThreadRow key={t.projectId} thread={t} onClick={() => openThread(t)} />
              ))
            )}
          </div>
        )}

        <button
          onClick={() => setPopoverOpen((v) => !v)}
          className="fixed bottom-24 right-6 z-50 grid size-14 place-items-center rounded-full bg-ink-800 text-white shadow-xl transition-transform hover:scale-105 dark:bg-ink-700"
          title="Mensagens de clientes"
        >
          <MessageCircle className="size-6" />
          {unreadTotal > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </button>
      </div>
    </>
  )
}

function ThreadRow({ thread, onClick }: { thread: Thread; onClick: () => void }) {
  const { data: project } = useProject(thread.projectId)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-3 border-b border-paper-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-paper-50 dark:border-ink-800 dark:hover:bg-ink-800"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
        {(project?.key ?? "??").slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-ink dark:text-paper">
            {project?.name ?? thread.latest.title}
          </span>
          {thread.unread > 0 && (
            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {thread.unread}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-paper-500">{thread.latest.body || thread.latest.title}</p>
      </div>
    </button>
  )
}

const WINDOW_WIDTH = 320
const WINDOW_GAP = 12
const WINDOW_RIGHT_BASE = 96 // deixa o botão do Copiloto/bolinha livres

function ChatHeadWindow({
  projectId,
  offset,
  onClose,
}: {
  projectId: string
  offset: number
  onClose: () => void
}) {
  const { data: project } = useProject(projectId)
  const { data: messages, isLoading } = useBoardMessages(projectId)
  const create = useCreateBoardMessage(projectId)
  const [body, setBody] = useState("")
  const [replyingTo, setReplyingTo] = useState<BoardMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages?.length])

  const submit = () => {
    const t = body.trim()
    if (!t) return
    create.mutate(
      { body: t, replyToId: replyingTo?.id },
      { onSuccess: () => { setBody(""); setReplyingTo(null) } },
    )
  }

  const right = WINDOW_RIGHT_BASE + offset * (WINDOW_WIDTH + WINDOW_GAP)

  return (
    <div
      style={{ right, width: WINDOW_WIDTH }}
      className="fixed bottom-6 z-50 flex h-[26rem] flex-col overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900"
    >
      <div className="flex items-center justify-between border-b border-paper-100 px-3.5 py-2.5 dark:border-ink-800">
        <p className="truncate text-[13px] font-semibold text-ink dark:text-paper">
          {project?.name ?? "Board"} <span className="font-normal text-paper-400">· Cliente</span>
        </p>
        <button onClick={onClose} className="text-paper-400 hover:text-ink dark:hover:text-paper">
          <X className="size-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
          {(messages ?? []).length === 0 ? (
            <p className="py-8 text-center text-xs text-paper-400">Nenhuma mensagem ainda.</p>
          ) : (
            (messages ?? []).map((m) => (
              <div key={m.id} className={cx("group flex items-end gap-1", m.from_team ? "justify-end" : "justify-start")}>
                {!m.from_team && (
                  <button
                    onClick={() => setReplyingTo(m)}
                    title="Responder"
                    className="shrink-0 rounded-full p-0.5 text-paper-400 opacity-0 transition-opacity hover:bg-paper-100 hover:text-ink group-hover:opacity-100 dark:hover:bg-ink-800"
                  >
                    <CornerUpLeft className="size-3" />
                  </button>
                )}
                <div
                  className={cx(
                    "max-w-[85%] rounded-xl px-3 py-2 text-[13px]",
                    m.from_team
                      ? "bg-brand-600 text-white"
                      : "bg-paper-100 text-ink dark:bg-ink-800 dark:text-paper",
                  )}
                >
                  <p className="mb-0.5 text-[10px] font-medium opacity-60">
                    {m.author_name || (m.from_team ? "Time" : "Cliente")}
                  </p>
                  {m.reply_to && (
                    <div
                      className={cx(
                        "mb-1 rounded-md border-l-2 px-1.5 py-0.5 text-[11px] opacity-80",
                        m.from_team ? "border-white/40 bg-white/10" : "border-brand-400 bg-paper-50 dark:bg-ink-900",
                      )}
                    >
                      <p className="font-medium">{m.reply_to.author_name}</p>
                      <p className="truncate">{m.reply_to.body}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  <p className="mt-1 text-[10px] opacity-60">{fmt(m.created_at)}</p>
                </div>
                {m.from_team && (
                  <button
                    onClick={() => setReplyingTo(m)}
                    title="Responder"
                    className="shrink-0 rounded-full p-0.5 text-paper-400 opacity-0 transition-opacity hover:bg-paper-100 hover:text-ink group-hover:opacity-100 dark:hover:bg-ink-800"
                  >
                    <CornerUpLeft className="size-3" />
                  </button>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {replyingTo && (
        <div className="flex items-center gap-1.5 border-t border-paper-100 bg-paper-50 px-2.5 py-1.5 dark:border-ink-800 dark:bg-ink-800">
          <CornerUpLeft className="size-3 shrink-0 text-paper-400" />
          <p className="min-w-0 flex-1 truncate text-[11px] text-paper-500">
            <span className="font-medium text-ink dark:text-paper">
              {replyingTo.author_name || (replyingTo.from_team ? "Time" : "Cliente")}:
            </span>{" "}
            {replyingTo.body}
          </p>
          <button
            onClick={() => setReplyingTo(null)}
            className="shrink-0 rounded-full p-0.5 text-paper-400 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-700"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-paper-100 p-2.5 dark:border-ink-800">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Responder…"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-paper-200 bg-paper-50 px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-400 dark:border-ink-700 dark:bg-ink-800 dark:text-paper"
        />
        <button
          onClick={submit}
          disabled={!body.trim() || create.isPending}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white disabled:opacity-40"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
